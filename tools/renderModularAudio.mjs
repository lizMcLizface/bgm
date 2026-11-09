// Direct portable Wasm render, no browser automation or audio-device access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReferenceGraph,savePatch,loadPatch} from '../public/modular-audio/runtime.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(root,'public/modular-audio',f));
const sidechain=process.argv.includes('--sidechain'),stem=sidechain?'modular-audio-sidechain':'modular-audio-reference';
const module=new WebAssembly.Module(read('graph.wasm')),contracts=JSON.parse(read('contracts.json')),patch=JSON.parse(read(sidechain?'sidechain-patch.json':'reference-patch.json'));
const total=sidechain?96000:48000,results=[];
for(const sampleRate of [44100,48000,96000]) {
 const g=new ReferenceGraph(new WebAssembly.Instance(module,{}).exports,loadPatch(savePatch(patch,contracts),contracts),contracts,sampleRate),pcm=[new Float32Array(total),new Float32Array(total)];
 try {
  for(let at=0;at<total;){const n=Math.min(113,total-at);g.render(n);pcm[0].set(g.left.subarray(0,n),at);pcm[1].set(g.right.subarray(0,n),at);at+=n;}
  const energy=[0,0];let peak=0,first=-1,last=-1;
  for(let i=0;i<total;i++)for(let ch=0;ch<2;ch++){const v=pcm[ch][i];if(!Number.isFinite(v))throw Error('Non-finite output');energy[ch]+=v*v;peak=Math.max(peak,Math.abs(v));if(v!==0){if(first<0)first=i;last=i;}}
  results.push({sampleRate,frames:total,firstFrame:first,lastFrame:last,peak,rms:energy.map(n=>Math.sqrt(n/total)),stats:g.stats()});
  if(sampleRate===48000){const wav=Buffer.alloc(44+total*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(total*4,40);for(let i=0;i<total;i++)for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.min(1,Math.max(-1,pcm[ch][i]))*32767),44+i*4+ch*2);fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});fs.writeFileSync(path.join(root,'.tmp',stem+'.wav'),wav);}
 }finally{g.dispose();}
}
fs.writeFileSync(path.join(root,sidechain?'.tmp/modular-audio-sidechain-pcm.json':'.tmp/modular-audio-pcm.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
