// Renders every factory sound of one model (a held chord, then a short phrase) and
// reports level, peak and brightness, plus render speed. Optional WAVs: --wav <dir>.
// Usage: npx vite-node tools/auditClassics.mjs [--model cs80|juno|prophet5|jupiter8|minimoog|dx7|obxa|vs] [--wav dir]
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,rms,peak,brightness} from '../src/synths/engine/offline.js';
import {SYNTHS} from '../src/synths/models.js';
import {builtinWaves} from '../src/synths/vs/waves.js';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const arg=name=>{const at=process.argv.indexOf(name);return at>0?process.argv[at+1]:null;};
const wavDir=arg('--wav'),synth=SYNTHS[arg('--model')??'cs80'];
const {presets:PRESETS,params:{toPairs}}=synth;
const sr=48000;
function wav(file,left,right){
 const n=left.length,buf=Buffer.alloc(44+n*4);buf.write('RIFF',0);buf.writeUInt32LE(36+n*4,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(2,22);buf.writeUInt32LE(sr,24);buf.writeUInt32LE(sr*4,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++){buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
 fs.writeFileSync(file,buf);
}
const rows=[];
for(const preset of PRESETS){
 const s=createOfflineSynth(module,{sampleRate:sr,model:synth.model,params:toPairs(preset.values),waves:synth.id==='vs'?builtinWaves():null});
 const chord=[48,55,60,64,67];
 chord.forEach((n,i)=>s.k.syn_note_on(i+1,n,.7));
 const t0=performance.now();
 const [hl,hr]=s.seconds(3);
 chord.forEach((_,i)=>s.k.syn_note_off(i+1));
 const [tl,tr]=s.seconds(2);
 // phrase with pressure
 const phrase=[60,62,64,67,69,67,64,62];const pl=[],pr=[];
 phrase.forEach((n,i)=>{s.k.syn_note_on(100+i,n,.5+.4*(i%3)/2);const [a,b]=s.seconds(.15);s.k.syn_control(1,.8);const [c,d]=s.seconds(.25);s.k.syn_control(1,0);s.k.syn_note_off(100+i);pl.push(a,c);pr.push(b,d);});
 const [el,er]=s.seconds(2.5);pl.push(el);pr.push(er);
 const ms=performance.now()-t0;
 const body=hl.subarray(sr*1.5),seconds=3+2+phrase.length*.4+2.5;
 rows.push({name:preset.name,onsetRmsDb:+(20*Math.log10(rms(hl.subarray(0,sr*1.5)))).toFixed(1),chordRmsDb:+(20*Math.log10(rms(body))).toFixed(1),peak:+Math.max(peak(hl),peak(hr),peak(tl)).toFixed(3),brightness:+brightness(body).toFixed(3),tailRmsDb:+(20*Math.log10(rms(tl.subarray(sr))+1e-9)).toFixed(1),realtimeX:+(seconds*1000/ms).toFixed(0)});
 if(wavDir){fs.mkdirSync(wavDir,{recursive:true});const cat=arrs=>{const len=arrs.reduce((a,x)=>a+x.length,0),o=new Float32Array(len);let at=0;for(const x of arrs){o.set(x,at);at+=x.length;}return o;};wav(path.join(wavDir,preset.name.replace(/\W+/g,'-').toLowerCase()+'.wav'),cat([hl,tl,...pl]),cat([hr,tr,...pr]));}
}
console.table(rows);
