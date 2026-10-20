import {readWav} from '../wav.js';

// Jupiter-8 data-cassette decoder: tape audio (a WAV of the cassette) → patches.
// Reverse-engineered from recordings of the factory cassette and the factory
// patch sheets; see docs/JP8_TAPE_FORMAT.md. No Roland data ships with the site:
// players import their own recording.
//
// Signal: FSK, space ≈ 1300 Hz, mark ≈ 2100 Hz, 300 baud, async 8 data bits LSB
// first, 2 stop bits, idle = mark. Tape speed varies between recordings (one
// known transfer runs 1.6 % slow), so speed is measured from the pilot tone.
// File: 80 80 80 <file> 00 01 FF 01, then records `40 00 LL TT <LL bytes>`;
// TT 0x81 = patch presets (34 bytes), TT 0x80 = one patch: 01 <number> FF <28 bytes>.
// The last body byte is a checksum: (TT + every body byte) mod 256 = 0, which holds
// for all 65 records of the factory tape. The file ends F0 00 00.
//
// Pipeline: WAV → mono candidates (mix, then each channel) → band-pass and
// resample to ≈11 kHz → pilot tone (speed, level) → per-sample mark/space
// discriminator → UART framing that samples every bit at its centre and
// re-locks on each start bit → records found by their headers wherever they
// are, so a dropout costs only the patches it touches. Repeats of a bank on
// the same recording are merged, taking each patch from a copy whose
// checksum holds.

const MARK=2100,SPACE=1300,BAUD=300,WORK_RATE=11025;
const PATCH=0x80,PRESETS=0x81;

export {readWav};

// Band-pass to the FSK band (removes DC, hum and hiss) and bring any rate down to ≈11 kHz.
// High-pass: 2nd-order Butterworth at 500 Hz; anti-alias: windowed sinc before decimating.
export function prepare(x,sr){
 const hp=biquadHighpass(x,sr,500);
 const factor=Math.max(1,Math.floor(sr/WORK_RATE));
 if(factor===1)return {x:hp,sr};
 const taps=8*factor+1,h=new Float32Array(taps),fc=.45/factor;let sum=0;
 for(let k=0;k<taps;k++){const t=k-(taps-1)/2,w=.42-.5*Math.cos(2*Math.PI*k/(taps-1))+.08*Math.cos(4*Math.PI*k/(taps-1));h[k]=(t?Math.sin(2*Math.PI*fc*t)/(Math.PI*t):2*fc)*w;sum+=h[k];}
 const n=Math.floor(hp.length/factor),out=new Float32Array(n),half=(taps-1)>>1;
 for(let i=0;i<n;i++){const c=i*factor;let s=0;for(let k=0;k<taps;k++){const j=c+k-half;if(j>=0&&j<hp.length)s+=hp[j]*h[k];}out[i]=s/sum;}
 return {x:out,sr:sr/factor};
}
function biquadHighpass(x,sr,f){
 const w=2*Math.PI*Math.min(f,sr*.45)/sr,cw=Math.cos(w),alpha=Math.sin(w)/Math.SQRT2,a0=1+alpha;
 const b0=(1+cw)/2/a0,b1=-(1+cw)/a0,b2=b0,a1=-2*cw/a0,a2=(1-alpha)/a0;
 const y=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;
 for(let i=0;i<x.length;i++){const v=x[i],o=b0*v+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=v;y2=y1;y1=o;y[i]=o;}
 return y;
}

// Zero-crossing frequency of a stretch of a band-passed signal: robust even at 2.6 samples per cycle.
function crossingRate(x,from,to,sr){
 let n=0;for(let i=from+1;i<to;i++)if((x[i-1]<0)!==(x[i]<0))n++;
 return n/2/((to-from)/sr);
}

// Pilot frequency to ≈0.1 Hz: the strongest DFT bin near the zero-crossing guess (which hiss
// biases upwards), refined by a parabola through the three best bins. Uses at most 3 s.
function peakFrequency(x,from,to,sr,guess){
 to=Math.min(to,from+Math.round(sr*3));
 // Goertzel recurrence: one multiply-add per sample and frequency
 const power=f=>{const k=2*Math.cos(2*Math.PI*f/sr);let s1=0,s2=0;for(let i=from;i<to;i++){const s=x[i]+k*s1-s2;s2=s1;s1=s;}return s1*s1+s2*s2-k*s1*s2;};
 let best=guess,bestP=-1;
 for(let f=Math.max(1600,guess*.92);f<=Math.min(2600,guess*1.08);f+=2){const p=power(f);if(p>bestP){bestP=p;best=f;}}
 const step=.25,a=power(best-step),c=power(best+step),den=a-2*bestP+c;
 return den<0?best+step*(a-c)/(2*den):best;
}

/**
 * Finds the pilot tone (the longest run of windows near the mark frequency) on a
 * band-passed signal: tape speed from its frequency, signal level from its loudness.
 * Loudness is judged against the recording itself, so quiet transfers work.
 */
export function findLeader(x,sr){
 const win=Math.round(sr*.05),rates=[],rms=[];
 for(let at=0;at+win<=x.length;at+=win){let e=0;for(let i=at;i<at+win;i++)e+=x[i]*x[i];rms.push(Math.sqrt(e/win));}
 const loudest=[...rms].sort((a,b)=>b-a)[Math.floor(rms.length*.05)]??0;
 if(!(loudest>1e-5))throw Error('The recording is silent.');
 rms.forEach((r,k)=>rates.push(r>loudest*.1?crossingRate(x,k*win,(k+1)*win,sr):0));
 let best={len:0,start:0},run=0;
 rates.forEach((r,k)=>{if(r>1750&&r<2450){run++;if(run>best.len)best={len:run,start:k-run+1};}else run=0;});
 if(best.len<20)throw Error('No pilot tone found: is this a Jupiter-8 tape recording?');
 const start=best.start*win,end=(best.start+best.len)*win;
 const pilot=peakFrequency(x,start+win,end-win,sr,crossingRate(x,start+win,end-win,sr));
 let level=0;for(let k=best.start+1;k<best.start+best.len-1;k++)level+=rms[k];level/=Math.max(1,best.len-2);
 return {start,end,speed:pilot/MARK,level};
}

/**
 * Mark/space discriminator per sample, (E_mark − E_space)/(E_mark + E_space + floor),
 * from tone energies over a sliding window one bit long, centred. +1 = mark, −1 = space,
 * ≈0 = silence (energy below the floor, set from the pilot level).
 */
export function discriminate(x,sr,{speed=1,level=.1}={}){
 const n=Math.max(3,Math.round(sr/(BAUD*speed))),h=n>>1,len=x.length;
 const energy=f=>{
  const w=2*Math.PI*f*speed/sr,e=new Float32Array(len),ri=new Float32Array(n),rq=new Float32Array(n);
  let si=0,sq=0,c=1,s=0;const cw=Math.cos(w),sw=Math.sin(w);
  for(let i=0;i<len+h;i++){
   const slot=i%n;
   if(i>=n){si-=ri[slot];sq-=rq[slot];}
   const v=i<len?x[i]:0,vi=v*c,vq=v*s;ri[slot]=vi;rq[slot]=vq;si+=vi;sq+=vq;
   const nc=c*cw-s*sw;s=c*sw+s*cw;c=nc;
   if((i&1023)===1023){const m=Math.hypot(c,s);c/=m;s/=m;}
   const at=i-h;if(at>=0)e[at]=si*si+sq*sq;
  }
  return e;
 };
 const em=energy(MARK),es=energy(SPACE);
 // a pure tone at the pilot level gives (level·n/√2)² per window; ignore anything 30 dB below
 const floor=(level*n/Math.SQRT2)**2*1e-3,d=new Float32Array(len);
 for(let i=0;i<len;i++)d[i]=(em[i]-es[i])/(em[i]+es[i]+floor);
 return d;
}

/**
 * UART on the discriminator: wait for a mark→space edge, check the start bit at its
 * centre, read 8 data bits LSB first and 2 stop bits at their centres. Every start
 * bit re-locks the timing, so wow, flutter and drift only need to stay inside one byte.
 */
export function frameBytes(d,sr,{speed=1,from=0,to=d.length}={}){
 const T=sr/(BAUD*speed),bytes=[],bad=[],at=[];
 const val=t=>{const i=Math.round(t);return i>=0&&i<d.length?d[i]:0;};
 for(let i=Math.max(1,from);i<to-11*T;){
  if(!(d[i-1]>=0&&d[i]<0)){i++;continue;}
  // interpolate the crossing; a real start bit stays space for its whole length
  const edge=i-1+d[i-1]/(d[i-1]-d[i]);
  if(!(val(edge+T*.5)<-.2&&val(edge+T*.3)<0&&val(edge+T*.7)<0)){i++;continue;}
  let v=0;for(let k=0;k<8;k++)if(val(edge+T*(k+1.5))>0)v|=1<<k;
  const stopOk=val(edge+T*9.5)>0&&val(edge+T*10.5)>0;
  bytes.push(v);bad.push(!stopOk);at.push(edge);
  // next start bit can begin at the end of the second stop bit; if the stop bits were
  // wrong, look for it after the first data bit instead of trusting this byte's length
  i=Math.ceil(edge+(stopOk?T*10.6:T*1.6));
 }
 return {bytes:Uint8Array.from(bytes),bad,at,errors:bad.filter(Boolean).length};
}

const checksumOk=(type,body)=>body.reduce((s,v)=>s+v,type)%256===0;

/**
 * Finds files and records anywhere in a byte stream. A file starts 80 80 80 <file>;
 * records are `40 00 LL TT <body>`, found by their headers so damage between them
 * does not lose the rest of the file. `bad` marks bytes with framing errors.
 */
export function parseStream(bytes,bad=[]){
 const files=[];let file=null;
 const open=(number,at)=>{file={file:number,at,header:[],patches:[],presets:null,trailer:false,end:at};files.push(file);};
 for(let i=0;i<bytes.length;){
  if(bytes[i]===0x80&&bytes[i+1]===0x80&&bytes[i+2]===0x80&&i+3<bytes.length&&bytes[i+3]!==0x80){
   open(bytes[i+3],i);file.header=[...bytes.subarray(i,i+8)];i+=8;file.end=i;continue;
  }
  const len=bytes[i+2],type=bytes[i+3];
  if(bytes[i]===0x40&&bytes[i+1]===0x00&&((type===PATCH&&len===31)||(type===PRESETS&&len===34))&&i+4+len<=bytes.length){
   if(!file)open(null,i);
   const body=bytes.subarray(i+4,i+4+len),framing=bad.slice(i,i+4+len).some(Boolean),ok=checksumOk(type,body);
   if(type===PRESETS)file.presets={data:Uint8Array.from(body),checksumOk:ok,damaged:framing||!ok};
   else if(body[0]===1&&body[1]<64)file.patches.push({number:body[1],data:Uint8Array.from(body.subarray(3,31)),checksumOk:ok,damaged:framing||!ok,at:i});
   i+=4+len;file.end=i;
   if(bytes[i]===0xF0&&bytes[i+1]===0x00&&bytes[i+2]===0x00){file.trailer=true;i+=3;file.end=i;}
   continue;
  }
  i++;
 }
 return files.filter(f=>f.patches.length||f.presets);
}

// Merges every copy of the same file on a recording: per patch number, the first copy
// whose checksum holds, otherwise the first damaged one.
function mergeCopies(files){
 const groups=new Map();
 for(const f of files){const key=f.file??'?';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 return [...groups.values()].map(copies=>{
  const best=new Map();
  for(const f of copies)for(const p of f.patches){const have=best.get(p.number);if(!have||(have.damaged&&!p.damaged))best.set(p.number,p);}
  const patches=[...best.values()].sort((a,b)=>a.number-b.number);
  const presets=copies.map(f=>f.presets).filter(Boolean).sort((a,b)=>a.damaged-b.damaged)[0]??null;
  return {file:copies[0].file,copies:copies.length,patches,presets,header:copies[0].header,trailer:copies.some(f=>f.trailer),first:copies[0]};
 });
}

const score=r=>r.files.length?Math.max(...r.files.map(f=>f.patches.filter(p=>!p.damaged).length*1000-f.patches.length)):-1e9;

function decodeChannel(x,sampleRate){
 const {x:y,sr}=prepare(x,sampleRate);
 const leader=findLeader(y,sr);
 const d=discriminate(y,sr,leader);
 const framed=frameBytes(d,sr,{speed:leader.speed,from:Math.max(0,leader.start)});
 return {leader,framed,files:mergeCopies(parseStream(framed.bytes,framed.bad))};
}

/**
 * Whole pipeline: WAV bytes → the best file on the recording:
 * {file, patches[{number,data,checksumOk,damaged}], missing[], damaged[], speed, errors, bytes, copies, files}.
 * `bytes` is the first copy of that file, header to trailer; `errors` counts its framing errors.
 * Throws only when nothing usable is found.
 */
export function decodeTape(input){
 const wav=readWav(input);
 const candidates=[wav.samples,...(wav.channels.length>1?wav.channels:[])];
 let best=null,firstError=null;
 for(const x of candidates){
  let r;try{r=decodeChannel(x,wav.sampleRate);}catch(e){firstError??=e;continue;}
  if(!best||score(r)>score(best))best=r;
  // a clean, complete bank needs no second opinion
  if(r.files.some(f=>f.patches.length===64&&f.patches.every(p=>!p.damaged)))break;
 }
 if(!best)throw firstError;
 if(!best.files.length)throw Error('Found a tape signal but no Jupiter-8 patches in it.');
 const file=best.files.reduce((a,b)=>score({files:[b]})>score({files:[a]})?b:a);
 const {framed}=best,start=file.first.at,end=file.first.end;
 const have=new Set(file.patches.map(p=>p.number));
 return {
  file:file.file,header:file.header,patches:file.patches,presets:file.presets,copies:file.copies,
  missing:Array.from({length:64},(_,n)=>n).filter(n=>!have.has(n)),
  damaged:file.patches.filter(p=>p.damaged).map(p=>p.number),
  speed:best.leader.speed,
  errors:framed.bad.slice(start,end).filter(Boolean).length,
  bytes:framed.bytes.subarray(start,end),
  files:best.files.map(f=>({file:f.file,patches:f.patches.length,damaged:f.patches.filter(p=>p.damaged).length,copies:f.copies})),
 };
}
