// Shared pieces for matching our synth engines against the installed VST3 synths.
// See docs/VST_MATCHING.md. Needs vite-node (the model registry uses Vite imports).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SYNTHS} from '../../src/synths/models.js';
import {createOfflineSynth} from '../../src/synths/engine/offline.js';
import {readWav} from '../../src/synths/wav.js';
import {compareReferences} from '../../src/synths/engine/referenceMetrics.js';
import {fft} from '../../src/synths/ui/scopeMath.js';

export const ROOT=path.resolve(import.meta.dirname,'../..');
const PYTHON=path.join(ROOT,'.tmp/vst/venv/Scripts/python.exe'),HOST=path.join(ROOT,'tools/vst/vsthost.py');
const kernel=fs.readFileSync(path.join(ROOT,'public/synths/classics.wasm'));
const kernelModule=new WebAssembly.Module(kernel);

/** Renders a job (see vsthost.py) in the python host and returns its result. */
export function runHost(job,dir){
 if(!fs.existsSync(PYTHON))throw Error('Missing .tmp/vst/venv: uv venv .tmp/vst/venv --python 3.12 && uv pip install --python .tmp/vst/venv/Scripts/python.exe pedalboard numpy scipy mido');
 fs.mkdirSync(dir,{recursive:true});
 const jobFile=path.join(dir,'job.json'),resultFile=path.join(dir,'result.json');
 fs.writeFileSync(jobFile,JSON.stringify({...job,outDir:path.join(dir,'vst').replaceAll('\\','/')}));
 fs.rmSync(resultFile,{force:true});
 const r=spawnSync(PYTHON,[HOST,'render',jobFile,resultFile],{stdio:['ignore','inherit','inherit']});
 if(r.status!==0||!fs.existsSync(resultFile))throw Error('vsthost.py failed');
 return JSON.parse(fs.readFileSync(resultFile,'utf8'));
}

export const loadWav=file=>{const w=readWav(fs.readFileSync(file));return {sampleRate:w.sampleRate,channels:w.channels};};

/** One note on one of our synths, dry. `values` are model param keys; effects default off. */
export function renderOurs(modelId,values,{note=60,velocity=100,hold=1,tail=1.5,sampleRate=48000,waves=null}={}){
 const model=SYNTHS[modelId];
 const clean=model.params.sanitize({chorusMix:0,reverbMix:0,...values});
 const synth=createOfflineSynth(kernelModule,{model:model.model,sampleRate,params:model.params.toPairs(clean),waves});
 synth.k.syn_note_on(1,note,velocity/127);
 const held=synth.render(Math.round(hold*sampleRate));synth.k.syn_note_off(1);
 const released=synth.render(Math.round(tail*sampleRate));
 return held.map((c,i)=>{const out=new Float32Array(c.length+released[i].length);out.set(c);out.set(released[i],c.length);return out;});
}

/** Fits the VST render to the same length as ours (the VST renders `seconds`, ours hold+tail). */
export function trimTo(channels,frames){return channels.map(c=>{const o=new Float32Array(frames);o.set(c.subarray(0,frames));return o;});}

/** Level (dB re the loudest harmonic) of each harmonic of f0 from a Hann-windowed FFT of the held part of channel 0. */
export function harmonicLevels(channels,sr,f0,from,to){
 let n=1;while(n*2<=Math.min(to-from,1<<16))n*=2;
 const re=new Float64Array(n),im=new Float64Array(n),x=channels[0];
 for(let i=0;i<n;i++)re[i]=x[from+i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 fft(re,im);
 const p=k=>re[k]**2+im[k]**2,levels=[];
 for(let h=1;h*f0<Math.min(18000,sr*.45);h++){
  const lo=Math.max(1,Math.floor(h*f0*.985*n/sr)),hi=Math.min(n/2-1,Math.ceil(h*f0*1.015*n/sr));let m=0;
  for(let k=lo;k<=hi;k++)m=Math.max(m,p(k));
  levels.push(10*Math.log10(m+1e-30));
 }
 const top=Math.max(...levels);return levels.map(v=>v-top);
}

/** Timbre error that ignores noise floors and drift: harmonic-by-harmonic level difference (RMS, after removing the mean). */
export function harmonicError(vst,ours,sr,note,{from=0,to=vst[0].length}={}){
 const f0=440*2**((note-69)/12);
 if(to-from<sr*.1)return null;
 const a=harmonicLevels(vst,sr,f0,from,to),b=harmonicLevels(ours,sr,f0,from,to);
 // Floor both at -60 dB so the score is smooth: a harmonic dropping under the floor on one side only costs the gap to the floor.
 const FLOOR=-60,fa=a.map(v=>Math.max(v,FLOOR)),fb=b.map(v=>Math.max(v,FLOOR));
 const idx=a.map((v,i)=>i).filter(i=>Math.max(fa[i],fb[i])>FLOOR);
 if(idx.length<2)return null;
 const d=idx.map(i=>fb[i]-fa[i]),lead=idx.filter(i=>Math.max(a[i],b[i])>-40),mean=lead.length?lead.reduce((s,i)=>s+fb[i]-fa[i],0)/lead.length:d.reduce((s,v)=>s+v,0)/d.length;
 return {rms:Math.sqrt(d.reduce((s,v)=>s+(v-mean)**2,0)/d.length),worst:idx.map((i,j)=>({h:i+1,diff:d[j]-mean,vst:a[i]})).sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff)).slice(0,3)};
}

/** Metrics for a VST/ours pair of equal-length stereo renders. */
export function measure(vst,ours,sampleRate,{hold,tail,note}={}){
 // Digital silence reads as -240 dB and would turn any residual tail into a 100 dB "error": floor both at about -120 dB.
 const floor=channels=>channels.map((c,k)=>{let r=12345+k;return c.map(v=>{r=(r*1664525+1013904223)>>>0;return v+(r/4294967296-.5)*2e-6;});});
 vst=floor(vst);ours=floor(ours);
 const frames=vst[0].length,held=Math.round(hold*sampleRate);
 const full=compareReferences(vst,ours,sampleRate);
 const slice=(ch,a,b)=>ch.map(c=>c.subarray(a,b));
 const segment=(a,b)=>b-a>=sampleRate*.1?compareReferences(slice(vst,a,b),slice(ours,a,b),sampleRate):null;
 const heldEnd=segment(Math.max(0,held-Math.round(.3*sampleRate)),held),release=tail>0?segment(held,frames):null;
 const trim=r=>r&&{gainDb:r.gainToMatchDb,pitchCents:r.pitchErrorCents,envDb:r.envelopeErrorDb,specDb:r.spectralShapeErrorDb};
 // Band-by-band level difference (ours - vst) after removing the single overall gain.
 const bandDiff=full.reference.bands.map((b,i)=>({hz:Math.round(b.hz),vst:b.db,ours:full.candidate.bands[i].db,diff:full.candidate.bands[i].db-b.db}));
 // Held part of the note, skipping the attack; the whole signal when a window left no hold.
 const hf=held>=sampleRate*.5?Math.round(.2*sampleRate):0,harm=note==null?null:harmonicError(vst,ours,sampleRate,note,{from:hf,to:held>=sampleRate*.5?held:frames});
 return {harm,full:trim(full),heldEnd:trim(heldEnd),release:trim(release),
  vst:{rmsDb:full.reference.rmsDb,peakDb:full.reference.peakDb,hz:full.reference.pitchHz,rise90:full.reference.rise90Seconds},
  ours:{rmsDb:full.candidate.rmsDb,peakDb:full.candidate.peakDb,hz:full.candidate.pitchHz,rise90:full.candidate.rise90Seconds},
  bandDiff};
}

/** Scalar to minimise when fitting: spectrum + envelope + pitch + level, in comparable dB units. */
export function cost(m){
 const f=m.full;if(f.gainDb==null)return 1e9;
 return (m.harm?m.harm.rms:(f.specDb??60))+(f.envDb??60)+Math.abs(f.pitchCents??0)/20+(m.release?.envDb??0)*.5;
}

export function writeWav(file,channels,sampleRate){
 const frames=channels[0].length,b=Buffer.alloc(44+frames*4);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++)for(let c=0;c<2;c++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[Math.min(c,channels.length-1)][i]))*32767),44+i*4+c*2);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,b);
}

/** Coordinate search over the listed params of our patch against a fixed reference. */
export function fit(modelId,start,keys,reference,sampleRate,note,{hold,tail,velocity,rounds=3,window=null}={}){
 const model=SYNTHS[modelId];let values={...start};
 // `window` [from,to] seconds scores only that part of the note, so one fit can calibrate attack, decay or release alone.
 const w=window&&[Math.round(window[0]*sampleRate),Math.round(window[1]*sampleRate)];
 const cut=ch=>w?ch.map(c=>c.subarray(w[0],w[1])):ch,ref=cut(reference);
 const evaluate=v=>{const o=trimTo(renderOurs(modelId,v,{note,velocity,hold,tail,sampleRate}),reference[0].length);return cost(measure(ref,cut(o),sampleRate,w?{hold:0,tail:0,note}:{hold,tail,note}));};
 let best=evaluate(values);const history=[{round:0,cost:best}];
 for(let round=1;round<=rounds;round++){
  for(const key of keys){
   const p=model.params.BY_KEY[key];if(!p)throw Error(`Unknown param ${key}`);
   if(values[key]===undefined)values[key]=p.default;
   const log=p.curve==='log'&&p.min>0;
   const to=x=>log?Math.log(x):x,from=x=>log?Math.exp(x):x;
   if(round===1&&p.curve!=='step'){
    // The cost has ridges (a bright filter against a dark one), so a local step from the start can miss the basin: scan the range first.
    for(let i=0;i<=10;i++){
     const cand=model.params.clampValue(key,from(to(p.min)+(to(p.max)-to(p.min))*i/10));
     if(cand===values[key])continue;
     const c=evaluate({...values,[key]:cand});
     if(c<best-1e-6){best=c;values={...values,[key]:cand};}
    }
   }
   let span=(to(p.max)-to(p.min))/(round===1?4:round===2?12:40);
   for(let tries=0;tries<4;tries++){
    let improved=false;
    for(const dir of [-1,1]){
     const cand=model.params.clampValue(key,from(to(values[key])+dir*span));
     if(cand===values[key])continue;
     const c=evaluate({...values,[key]:cand});
     if(c<best-1e-6){best=c;values={...values,[key]:cand};improved=true;break;}
    }
    if(!improved)span/=2;
   }
  }
  history.push({round,cost:best});
 }
 return {values,cost:best,history};
}

/** Parameter table of a plugin (ranges, enum text, program names); cached under .tmp/vst/catalog. */
export function catalog(plugin){
 const file=path.join(ROOT,'.tmp/vst/catalog',plugin+'.json');
 if(!fs.existsSync(file)){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const r=spawnSync(PYTHON,[HOST,'catalog',plugin,file],{stdio:['ignore','inherit','inherit']});
  if(r.status!==0)throw Error('catalog failed');
 }
 return JSON.parse(fs.readFileSync(file,'utf8'));
}

/** Duty cycle of a pulse wave from its harmonic levels (dB re the top harmonic, as harmonicLevels gives): least squares against |sin(pi k d)|/k. */
export function dutyOf(levels){
 const model=d=>{const m=Array.from({length:16},(_,k)=>20*Math.log10(Math.max(1e-4,Math.abs(Math.sin(Math.PI*(k+1)*d))/(k+1))));return m.map(v=>v-m[0]);};
 let best={err:Infinity,duty:0};
 for(let d=.02;d<=.5;d+=.002){const m=model(d);let e=0;for(let k=0;k<16;k++)e+=(Math.max(-50,levels[k])-Math.max(-50,m[k]))**2;if(e<best.err)best={err:e,duty:d};}
 return {duty:best.duty,rmsDb:Math.sqrt(best.err/16)};
}
