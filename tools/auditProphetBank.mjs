// Renders every program of a Prophet-5/10 Rev 4 .syx file through the engine: a
// C-major triad held for 1.5 s then released. Reports level, peak and brightness and
// can write a WAV per program for listening or comparison with recordings.
// Usage: npx vite-node tools/auditProphetBank.mjs <programs.syx> [--wav dir] [--only F5-11,F5-17] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,MODELS,rms,peak,brightness} from '../src/synths/engine/offline.js';
import {parseProphetSysex} from '../src/synths/prophet/sysex.js';
import {toPairs,sanitize} from '../src/synths/prophet/params.js';

const file=process.argv[2];
if(!file){console.error('Usage: vite-node tools/auditProphetBank.mjs <programs.syx> [--wav dir] [--only F5-11,F5-17] [--quiet]');process.exit(1);}
const arg=name=>{const at=process.argv.indexOf(name);return at>0?process.argv[at+1]:null;};
const wavDir=arg('--wav'),only=arg('--only')?.split(',');
const sr=48000,module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
function wav(target,left,right){
 const n=left.length,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
 fs.writeFileSync(target,b);
}
const db=x=>+(20*Math.log10(Math.max(x,1e-9))).toFixed(1);
const rows=[];
for(const patch of parseProphetSysex(fs.readFileSync(file))){
 if(only&&!only.includes(patch.code))continue;
 const t0=performance.now();
 const s=createOfflineSynth(module,{sampleRate:sr,model:MODELS.prophet5,params:toPairs(sanitize(patch.engine))});
 [60,64,67].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
 const [hl,hr]=s.seconds(1.5);[1,2,3].forEach(i=>s.k.syn_note_off(i));const [tl,tr]=s.seconds(1);
 rows.push({code:patch.code,name:patch.name,heldDb:db(rms(hl)),peak:+Math.max(peak(hl),peak(hr),peak(tl)).toFixed(3),brightness:+brightness(hl).toFixed(3),finite:[hl,hr,tl,tr].every(a=>a.every(Number.isFinite)),realtimeX:Math.round(2500/(performance.now()-t0))});
 if(wavDir){fs.mkdirSync(wavDir,{recursive:true});const join=(a,b)=>{const o=new Float32Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;};wav(path.join(wavDir,`${patch.code}-${patch.name.replace(/\W+/g,'-')}.wav`),join(hl,tl),join(hr,tr));}
}
if(!process.argv.includes('--quiet'))console.table(rows);
else{const by=[...rows].sort((a,b)=>a.heldDb-b.heldDb);console.table([...by.slice(0,8),...by.slice(-8)]);}
const levels=rows.map(r=>r.heldDb).filter(x=>x>-100).sort((a,b)=>a-b);
console.log(`${rows.length} programs · all finite: ${rows.every(r=>r.finite)} · held level median ${levels[levels.length>>1]} dB (range ${levels[0]} … ${levels.at(-1)}) · max peak ${Math.max(...rows.map(r=>r.peak))} · slowest ${Math.min(...rows.map(r=>r.realtimeX))}× real time`);
