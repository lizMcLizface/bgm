import {decodeTape,readWav,parseStream} from './tape';
import {decodePatch} from './patch';

// Cassette-style audio: pilot tone, then 8N2 bytes as phase-continuous FSK (mono samples).
function tapeAudio(bytes,{sampleRate=11025,speed=1,noise=.02,seed=7,level=.6}={}){
 const baud=300*speed,mark=2100*speed,space=1300*speed,samples=[];let phase=0,s=seed;
 const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff*2-1;};
 const tone=(f,seconds)=>{const n=Math.round(seconds*sampleRate);for(let i=0;i<n;i++){phase+=2*Math.PI*f/sampleRate;samples.push((f?level*Math.sin(phase):0)+noise*rnd());}};
 const bit=b=>tone(b?mark:space,1/baud);
 tone(0,.5);tone(mark,4);
 for(const v of bytes){bit(0);for(let k=0;k<8;k++)bit((v>>k)&1);bit(1);bit(1);}
 tone(mark,.3);tone(0,1);for(let i=0;i<sampleRate*.5;i++)samples.push(.3+noise*rnd());   // DC offset tail
 return Float32Array.from(samples);
}
// channels: arrays of samples; bits 8/16 PCM, or 32 with float (optionally WAVE_FORMAT_EXTENSIBLE)
function wav(channels,{sampleRate=11025,bits=16,float=false,extensible=false}={}){
 const c=channels.length,n=channels[0].length,width=bits/8,fmtLen=extensible?40:16,data=n*c*width;
 const buf=new Uint8Array(20+fmtLen+8+data),view=new DataView(buf.buffer);
 const put=(at,str)=>[...str].forEach((ch,i)=>buf[at+i]=ch.charCodeAt(0));
 put(0,'RIFF');view.setUint32(4,buf.length-8,true);put(8,'WAVEfmt ');view.setUint32(16,fmtLen,true);
 view.setUint16(20,extensible?0xFFFE:float?3:1,true);view.setUint16(22,c,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*c*width,true);view.setUint16(32,c*width,true);view.setUint16(34,bits,true);
 if(extensible){view.setUint16(36,22,true);view.setUint16(38,bits,true);view.setUint16(44,float?3:1,true);}
 const at=20+fmtLen;put(at,'data');view.setUint32(at+4,data,true);
 for(let i=0;i<n;i++)for(let k=0;k<c;k++){
  const v=Math.max(-1,Math.min(1,channels[k][i])),p=at+8+(i*c+k)*width;
  if(float)view.setFloat32(p,v,true);else if(bits===8)buf[p]=Math.round(v*127+128);else view.setInt16(p,Math.round(v*32767),true);
 }
 return buf;
}
const PATCH=Uint8Array.from([82,255,0,217,0,128,145,228,191,161,68,169,69,132,0,0,80,120,161,182,201,0,196,0,0b10101110,0b11011011,0b10110101]);
// a record's checksum makes (type + body) ≡ 0 mod 256
const sealed=(type,body)=>[...body,(256-body.reduce((s,v)=>s+v,type)%256)%256];
function tapeFile(patches){
 const out=[0x80,0x80,0x80,0x50,0x00,0x01,0xFF,0x01,0x40,0x00,0x22,0x81,...sealed(0x81,Array(33).fill(0x11))];
 patches.forEach((p,n)=>out.push(0x40,0x00,0x1F,0x80,...sealed(0x80,[0x01,n,0xFF,...p])));
 out.push(0xF0,0x00,0x00);return out;
}
const PATCHES=Array.from({length:4},(_,n)=>PATCH.map((b,i)=>i<24?(b+n*37)&255:b));
const FILE=tapeFile(PATCHES);
const expectBank=(tape,count=4)=>{
 expect(tape.patches.map(p=>p.number)).toEqual(Array.from({length:count},(_,n)=>n));
 tape.patches.forEach((p,n)=>{expect(p.damaged).toBe(false);expect([...p.data.subarray(0,27)]).toEqual([...PATCHES[n]]);});
};

test('a synthetic cassette decodes byte for byte at 5.5–44.1 kHz, 8/16-bit and off-speed tape',()=>{
 for(const opts of [{sampleRate:5500,bits:8},{sampleRate:11025,speed:.984},{sampleRate:44100,speed:1.012}]){
  const tape=decodeTape(wav([tapeAudio(FILE,opts)],opts));
  expect(tape.errors).toBe(0);expect(tape.file).toBe(80);expect(Math.abs(tape.speed-(opts.speed??1))).toBeLessThan(.003);
  expect([...tape.bytes]).toEqual(FILE);expect(tape.missing).toHaveLength(60);expect(tape.presets.checksumOk).toBe(true);
  expectBank(tape);
 }
});

test('quiet transfers with hum, float WAVs and an out-of-phase stereo pair still decode',()=>{
 const x=tapeAudio(FILE);
 const quiet=x.map((v,i)=>v*.004+.01*Math.sin(2*Math.PI*50*i/11025));                  // −44 dB under loud mains hum
 expectBank(decodeTape(wav([quiet],{bits:32,float:true,extensible:true})));
 expectBank(decodeTape(wav([x,x.map(v=>-v)])));                                         // the mono mix cancels
});

test('a dropout costs only the patches it touches, and they are flagged',()=>{
 const x=tapeAudio(FILE),at=Math.round(11025*(.5+4+(8+38+35*1.5)*11/300));             // middle of patch 1
 x.fill(0,at,at+Math.round(11025*.03));
 const tape=decodeTape(wav([x]));
 const p1=tape.patches.find(p=>p.number===1);
 expect(!p1||p1.damaged).toBe(true);
 tape.patches.filter(p=>p.number!==1).forEach(p=>{expect(p.damaged).toBe(false);expect([...p.data.subarray(0,27)]).toEqual([...PATCHES[p.number]]);});
 // a second copy of the bank on the same recording repairs it
 const repaired=decodeTape(wav([Float32Array.from([...x,...tapeAudio(FILE,{seed:3})])]));
 expect(repaired.copies).toBe(2);expectBank(repaired);
});

test('the stream parser finds records after garbage and checks each checksum',()=>{
 const bytes=Uint8Array.from([0x13,0x37,...FILE.slice(0,8),0x99,...FILE.slice(8)]);
 const corrupt=Uint8Array.from(bytes);corrupt[bytes.length-10]^=4;                        // inside patch 3
 const [file]=parseStream(corrupt);
 expect(file.file).toBe(80);expect(file.trailer).toBe(true);
 expect(file.patches.map(p=>p.damaged)).toEqual([false,false,false,true]);
});

test('WAV reading keeps channels, mixes them to mono and rejects non-WAV input',()=>{
 const {samples,sampleRate,channels}=readWav(wav([[.5],[-.5]],{sampleRate:8000}));
 expect(sampleRate).toBe(8000);expect(samples[0]).toBeCloseTo(0);expect(channels[0][0]).toBeCloseTo(.5);
 expect(()=>readWav(new Uint8Array(64))).toThrow(/WAV/);
 expect(()=>decodeTape(wav([new Float32Array(11025)]))).toThrow(/silent/);
});

test('patch bytes decode into named controls and switches',()=>{
 const p=decodePatch(PATCH);
 expect(p.vcoModLfo).toBe(1);expect(p.vcoModEnv).toBe(0);expect(p.cutoff).toBeCloseTo(228/255);
 expect(p.vco2Semitones).toBeCloseTo(0);   // 82 = 8'
 // b24 1010 1110: LFO square, VCO mod to VCO-1 and VCO-2, PWM source manual, VCO-1 range 4'
 expect([p.lfoWave,p.vcoModVco1,p.vcoModVco2,p.pwmSource,p.vco1Range]).toEqual(['square',true,true,'manual',"4'"]);
 // b25 1101 1011: VCO-1 pulse, VCO-2 saw, VCA LFO 3
 expect([p.vco1Wave,p.vco2Wave,p.vcaLfo]).toEqual(['pulse','saw',3]);
 // b26 1011 0101: sync on (bit1 0), VCO-2 normal (bit2 1), slope up off, env up, ENV-1 key follow on, ENV-1 normal, ENV-2 key follow off
 expect([p.sync,p.vco2Low,p.vcfSlopeUp,p.vcfEnvUp,p.env1KeyFollow,p.env1Inverted,p.env2KeyFollow]).toEqual([true,false,false,true,false,true,false]);
});
