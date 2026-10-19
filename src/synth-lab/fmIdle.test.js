// @vitest-environment node
import fs from 'node:fs';
import {FM_RECIPES,cloneFM,fmPacket} from './fmPatch';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
function render(p,rate,quality,fast,chunk=128){
 const e=new WebAssembly.Instance(module,{}).exports;e.fm_init(rate);e.fm_idle_mode(fast?1:0);
 const packet=fmPacket({...p,global:{...p.global,quality,vibrato:12,lfoRate:3,wanderCents:4}});
 for(const t of packet.globals)e.fm_param(...t);for(const t of packet.operators)e.fm_op(...t);for(const t of packet.routes)e.fm_route(...t);for(const t of packet.carriers)e.fm_carrier(...t);
 const note=(id,frame,midi)=>{e.fm_event(0,id,frame,midi,.7);e.fm_event(1,id,frame+rate*.2,0,0);};
 note(1,129,60);note(2,2048,67);e.fm_event(5,1,rate*.05,65,.1);
 const edits=[{frame:Math.floor(rate*.1),apply:()=>e.fm_param(4,(quality+1)%3)},{frame:Math.floor(rate*.4),apply:()=>{e.fm_panic();note(3,Math.floor(rate*.6),72);e.fm_param(9,.6);}},{frame:Math.floor(rate*.8),apply:()=>{e.fm_param(4,quality);note(4,rate,48);}}],frames=Math.ceil(rate*1.4),out=[new Float32Array(frames),new Float32Array(frames)];let next=0;
 for(let at=0;at<frames;){if(edits[next]?.frame===at)edits[next++].apply();const count=Math.min(chunk,frames-at,(edits[next]?.frame??frames)-at);e.fm_render(count);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,e.fm_output(ch),count),at);at+=count;}
 return {out,stats:[0,1,2,3,4].map(i=>e.fm_stat(i))};
}
test('idle optimization preserves PCM, LFO clocks, events, tails, panic and live quality switches',()=>{
 for(const rate of [44100,48000,96000])for(const quality of [0,1,2])for(const index of [0,4,9]){
  const p=cloneFM(FM_RECIPES[index]),a=render(p,rate,quality,false),b=render(p,rate,quality,true);
  for(let ch=0;ch<2;ch++)expect(Buffer.from(b.out[ch].buffer).equals(Buffer.from(a.out[ch].buffer))).toBe(true);
  expect(b.stats).toEqual(a.stats);expect(b.out[0].some(x=>Math.abs(x)>.0001)).toBe(true);
 }
},30000);
test('delayed starts and idle-to-active blocks remain independent of render chunk size',()=>{
 const a=render(FM_RECIPES[4],48000,1,true,127),b=render(FM_RECIPES[4],48000,1,true,2048);
 for(let ch=0;ch<2;ch++)expect(Buffer.from(b.out[ch].buffer).equals(Buffer.from(a.out[ch].buffer))).toBe(true);expect(a.stats).toEqual(b.stats);
});
