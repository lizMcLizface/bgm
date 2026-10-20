// Renders every program of Prophet VS program dumps through the engine, with the waves it needs: a
// C-major triad held for 1.5 s then released. The ROM waves come from the two wave-set WAVs and the
// user waves from the program set's own wave dump (the file named like the programs with
// "-user-waves.syx"). Reports level, peak and brightness; can write a WAV per program.
// Usage: npx vite-node tools/auditVsBank.mjs <programs.syx> [--waves dir] [--wav dir] [--quiet]
// The waves directory (default: the folder of the programs file) holds waves-000-063.wav, waves-064-127.wav
// and <name>-user-waves.syx.
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,MODELS,rms,peak,brightness} from '../src/synths/engine/offline.js';
import {parseVsSysex} from '../src/synths/vs/sysex.js';
import {composeWaves} from '../src/synths/vs/waves.js';
import {engineValues,toPairs,sanitize} from '../src/synths/vs/params.js';

const args=process.argv.slice(2);
const arg=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:null;};
const file=args.find((a,i)=>!a.startsWith('--')&&!['--waves','--wav'].includes(args[i-1])),wavDir=arg('--wav');
if(!file){console.error('Usage: vite-node tools/auditVsBank.mjs <programs.syx> [--waves dir] [--wav dir] [--quiet]');process.exit(1);}
const dir=arg('--waves')??path.dirname(file);
const read=name=>{const f=path.join(dir,name);return fs.existsSync(f)?fs.readFileSync(f):null;};
const wavs=[['waves-000-063.wav',0],['waves-064-127.wav',64]].map(([n,first])=>({bytes:read(n),first})).filter(w=>w.bytes);
const dump=read(path.basename(file).replace(/programs\.syx$/,'user-waves.syx'));
if(!wavs.length)console.warn('No wave-set WAVs found: the ROM waves fall back to the built-in set.');
const waves=composeWaves({wavs,userDump:dump});
const sr=48000,module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
function wav(target,left,right){
 const n=left.length,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++){b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),44+i*4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]))*32767),46+i*4);}
 fs.writeFileSync(target,b);
}
const db=x=>+(20*Math.log10(Math.max(x,1e-9))).toFixed(1);
const rows=[];
for(const p of parseVsSysex(fs.readFileSync(file))){
 const t0=performance.now();
 const s=createOfflineSynth(module,{sampleRate:sr,model:MODELS.vs,waves,params:toPairs(sanitize(engineValues(p.raw)))});
 [60,64,67].forEach((n,k)=>s.k.syn_note_on(k+1,n,.8));
 const [hl,hr]=s.seconds(1.5);[1,2,3].forEach(k=>s.k.syn_note_off(k));const [tl,tr]=s.seconds(1);
 rows.push({number:p.number,name:p.name,heldDb:db(rms(hl)),peak:+Math.max(peak(hl),peak(hr),peak(tl)).toFixed(3),brightness:+brightness(hl).toFixed(3),finite:[hl,hr,tl,tr].every(a=>a.every(Number.isFinite)),realtimeX:Math.round(2500/(performance.now()-t0))});
 if(wavDir){fs.mkdirSync(wavDir,{recursive:true});const join=(a,b)=>{const o=new Float32Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;};wav(path.join(wavDir,`${String(p.number).padStart(2,'0')}-${p.name.replace(/\W+/g,'-')}.wav`),join(hl,tl),join(hr,tr));}
}
if(!args.includes('--quiet'))console.table(rows);
else{const by=[...rows].sort((a,b)=>a.heldDb-b.heldDb);console.table([...by.slice(0,8),...by.slice(-8)]);}
const levels=rows.map(r=>r.heldDb).filter(x=>x>-100).sort((a,b)=>a-b);
console.log(`${rows.length} programs · all finite: ${rows.every(r=>r.finite)} · held level median ${levels[levels.length>>1]} dB (range ${levels[0]} … ${levels.at(-1)}) · max peak ${Math.max(...rows.map(r=>r.peak))} · slowest ${Math.min(...rows.map(r=>r.realtimeX))}× real time`);
