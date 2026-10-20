// Renders every voice of DX7 .syx cartridges through the engine: a C-major triad held for 1.5 s
// then released. Reports level, peak and brightness, and can write a WAV per voice for listening
// or for comparison with renders from another DX7 emulator.
// Usage: npx vite-node tools/auditDx7Cart.mjs <cart.syx> [more.syx …] [--wav dir] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,MODELS,rms,peak,brightness} from '../src/synths/engine/offline.js';
import {parseDx7Sysex} from '../src/synths/dx7/sysex.js';
import {engineValues} from '../src/synths/dx7/voice.js';
import {toPairs,sanitize} from '../src/synths/dx7/params.js';

const args=process.argv.slice(2);
const arg=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:null;};
const wavDir=arg('--wav'),files=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--wav');
if(!files.length){console.error('Usage: vite-node tools/auditDx7Cart.mjs <cart.syx> […] [--wav dir] [--quiet]');process.exit(1);}
const sr=48000,module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
function wav(target,left,right){
 const n=left.length,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
 fs.writeFileSync(target,b);
}
const db=x=>+(20*Math.log10(Math.max(x,1e-9))).toFixed(1);
const rows=[];
for(const file of files){
 for(const [i,v] of parseDx7Sysex(fs.readFileSync(file)).entries()){
  const t0=performance.now();
  const s=createOfflineSynth(module,{sampleRate:sr,model:MODELS.dx7,params:toPairs(sanitize(engineValues(v.raw)))});
  [60,64,67].forEach((n,k)=>s.k.syn_note_on(k+1,n,.8));
  const [hl,hr]=s.seconds(1.5);[1,2,3].forEach(k=>s.k.syn_note_off(k));const [tl,tr]=s.seconds(1);
  rows.push({cart:path.basename(file,'.syx'),voice:v.number??i+1,name:v.name,heldDb:db(rms(hl)),peak:+Math.max(peak(hl),peak(hr),peak(tl)).toFixed(3),brightness:+brightness(hl).toFixed(3),finite:[hl,hr,tl,tr].every(a=>a.every(Number.isFinite)),realtimeX:Math.round(2500/(performance.now()-t0))});
  if(wavDir){fs.mkdirSync(wavDir,{recursive:true});const join=(a,b)=>{const o=new Float32Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;};wav(path.join(wavDir,`${path.basename(file,'.syx')}-${String(v.number??i+1).padStart(2,'0')}-${v.name.replace(/\W+/g,'-')}.wav`),join(hl,tl),join(hr,tr));}
 }
}
if(!args.includes('--quiet'))console.table(rows);
else{const by=[...rows].sort((a,b)=>a.heldDb-b.heldDb);console.table([...by.slice(0,8),...by.slice(-8)]);}
const levels=rows.map(r=>r.heldDb).filter(x=>x>-100).sort((a,b)=>a-b);
console.log(`${rows.length} voices · all finite: ${rows.every(r=>r.finite)} · held level median ${levels[levels.length>>1]} dB (range ${levels[0]} … ${levels.at(-1)}) · max peak ${Math.max(...rows.map(r=>r.peak))} · slowest ${Math.min(...rows.map(r=>r.realtimeX))}× real time`);
