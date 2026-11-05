// Sets the output gain of every DIY FM library sound so that they all play at the loudness of the older hand-balanced recipes,
// then prints a table of level, peak and length for review. Run: npx vite-node tools/calibrateFMLibrary.mjs [--write]
import fs from 'node:fs';
import {FM_RECIPES,fmPacket,cloneFM} from '../src/synth-lab/fmPatch.js';
import {FM_LIBRARY} from '../src/synths/diy/fmLibrary.js';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
const SR=48000;
function play(patch,midi=60,velocity=.8,hold=1.2,tail=2.5){
 const e=new WebAssembly.Instance(module,{}).exports;e.fm_init(SR);const k=fmPacket(patch);
 for(const a of k.globals)e.fm_param(...a);for(const a of k.operators)e.fm_op(...a);for(const a of k.routes)e.fm_route(...a);for(const a of k.carriers)e.fm_carrier(...a);
 e.fm_event(0,1,0,midi,velocity);e.fm_event(1,1,Math.round(hold*SR),0,0);
 const frames=Math.round((hold+tail)*SR),out=new Float32Array(frames);
 for(let at=0;at<frames;at+=128){const n=Math.min(128,frames-at);e.fm_render(n);out.set(new Float32Array(e.memory.buffer,e.fm_output(0),n),at);}
 return out;
}
// Loudest 50 ms window (RMS), the peak, and how long the sound stays within 30 dB of its loudest window.
function measure(data){
 const w=Math.round(SR*.05),r=[];for(let i=0;i+w<=data.length;i+=w/2){let s=0;for(let j=0;j<w;j++)s+=data[i+j]**2;r.push(Math.sqrt(s/w));}
 const top=Math.max(...r),last=r.findLastIndex(v=>v>top*.0316);
 return {rms:top,peak:data.reduce((m,v)=>Math.max(m,Math.abs(v)),0),length:last*w/2/SR,finite:data.every(Number.isFinite)};
}
const reference=FM_RECIPES.map(p=>measure(play(p)).rms).sort((a,b)=>a-b),target=reference[Math.floor(reference.length/2)];
console.log('target rms',target.toFixed(4),'from',reference.map(v=>v.toFixed(3)).join(' '));
const gains={},rows=[];
for(const {name,patch} of FM_LIBRARY){
 let gain=patch.global.gain;
 for(let pass=0;pass<3;pass++){const p=cloneFM(patch);p.global.gain=gain;const m=measure(play(p));if(!(m.rms>0))break;gain=Math.min(2,Math.max(.02,gain*target/m.rms));}
 const p=cloneFM(patch);p.global.gain=gain;gains[name]=Math.round(gain*1e4)/1e4;
 // a low, a middle and a high note, and a four-note chord at full velocity, to catch clipping and silence
 const lo=measure(play(p,36)),hi=measure(play(p,84)),loud=measure(play(p,60,1));
 rows.push({name,ops:patch.global.operators,gain:gains[name],rms:measure(play(p)).rms,lo:lo.rms,hi:hi.rms,peakFull:loud.peak,len:measure(play(p)).length,ok:[lo,hi,loud].every(m=>m.finite)});
}
console.table(rows.map(r=>({...r,rms:+r.rms.toFixed(3),lo:+r.lo.toFixed(3),hi:+r.hi.toFixed(3),peakFull:+r.peakFull.toFixed(2),len:+r.len.toFixed(1)})));
if(process.argv.includes('--write')){fs.writeFileSync('src/synths/diy/fmLibraryGains.json',JSON.stringify(gains,null,1)+'\n');console.log('wrote gains for',rows.length,'sounds');}
