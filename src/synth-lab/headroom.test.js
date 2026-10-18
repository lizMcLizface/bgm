// @vitest-environment node
import fs from 'node:fs';
import {translatedWasmVoice} from '../app/engine/wasmPreset';
import {parameterTriples} from './patch';
import {fmPacket} from './fmPatch';
import {effectTriples} from './effectsConfig';
import {libraryVoice} from '../labs/catalog';
const modules=Object.fromEntries(['core','fm','effects'].map(k=>[k,new WebAssembly.Module(fs.readFileSync('public/synth-lab/'+k+'.wasm'))]));
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);
function voice(name,notes,velocity=1,rate=48000){
 const spec=translatedWasmVoice(libraryVoice(name).patch,32),fm=spec.kind==='fm',p=fm?'fm':'engine',e=new WebAssembly.Instance(modules[fm?'fm':'core'],{}).exports;e[p+'_init'](rate);
 if(fm){const packet=fmPacket(spec.patch);for(const a of packet.globals)e.fm_param(...a);for(const a of packet.operators)e.fm_op(...a);for(const a of packet.routes)e.fm_route(...a);for(const a of packet.carriers)e.fm_carrier(...a);}else for(const a of parameterTriples(spec.patch))e.engine_param(...a);
 for(const [id,midi]of notes)e[p+'_event'](0,id,0,midi,velocity);
 const out=new Float32Array(rate);for(let at=0;at<out.length;at+=128){const n=Math.min(128,out.length-at);e[p+'_render'](n);out.set(new Float32Array(e.memory.buffer,fm?e.fm_output(0):e.engine_left(),n),at);}return out;
}
test('ordinary organ/bell chords sum cleanly without an always-on output waveshaper',()=>{
 for(const name of ['Organ Whistle','Warm Organ','Celesta','Haunted Celesta']){
  // Keep note IDs identical: initial oscillator phase is seeded by ID.
  const a=voice(name,[[1,60]],.7),b=voice(name,[[2,64]],.7),chord=voice(name,[[1,60],[2,64]],.7);
  const error=chord.slice(24000).map((x,i)=>x-a[i+24000]-b[i+24000]);
  expect(rms(error)/rms(chord.slice(24000)),name).toBeLessThan(1e-5);
  expect(rms(chord.slice(24000)),name).toBeGreaterThan(.005);
 }
});
test('dense translated subtractive/FM chords remain finite and below full scale',()=>{
 for(const name of ['Organ Whistle','Warm Organ','Haunted Celesta'])for(const rate of [44100,96000]){
  const x=voice(name,Array.from({length:32},(_,i)=>[i+1,36+i]),1,rate);
  expect([...x].every(Number.isFinite)).toBe(true);expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(.980001);expect(rms(x.slice(rate/2))).toBeGreaterThan(.01);
 }
});
function effects(rate){const e=new WebAssembly.Instance(modules.effects,{}).exports;e.fx_init(rate);for(const a of effectTriples({dry:1,reverb:0,delay:0,delayToReverb:0}))e.fx_param(...a);return e;}
function stream(e,frames,signal,chunk=128,offset=0){
 const input=Array.from({length:6},(_,ch)=>new Float32Array(e.memory.buffer,e.fx_input(ch),2048)),out=[new Float32Array(frames),new Float32Array(frames)];
 for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);for(const ch of input)ch.fill(0);for(let i=0;i<n;i++){const x=signal(offset+at+i);input[0][i]=x;input[1][i]=x*.5;}e.fx_render(n);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,e.fx_output(ch),n),at);}return out;
}
test('effects return is exactly linear below the protection ceiling',()=>{
 const x=stream(effects(48000),48000,i=>.35*Math.sin(2*Math.PI*997*i/48000)+.25*Math.sin(2*Math.PI*1501*i/48000));
 expect(x[0].every((v,i)=>v===Math.fround(.35*Math.sin(2*Math.PI*997*i/48000)+.25*Math.sin(2*Math.PI*1501*i/48000)))).toBe(true);
 expect(x[1].every((v,i)=>v===x[0][i]*.5)).toBe(true);
});
test('overload protection links stereo, holds wave peaks, recovers and resets at different rates',()=>{
 for(const rate of [44100,48000,96000,192000]){
  const e=effects(rate),signal=i=>3*Math.sin(2*Math.PI*200*i/rate),[l,r]=stream(e,rate,signal);
  expect(l.reduce((peak,x)=>Math.max(peak,Math.abs(x)),0)).toBeLessThanOrEqual(.980001);
  const body=l.slice(rate/2),reference=body.map((_,i)=>signal(i+rate/2)),gain=body.reduce((s,x,i)=>s+x*reference[i],0)/reference.reduce((s,x)=>s+x*x,0);
  expect(rms(body.map((x,i)=>x-gain*reference[i]))/rms(body)).toBeLessThan(.002);
  expect(gain).toBeLessThan(.34);expect(gain).toBeGreaterThan(.3);
  expect(r.every((v,i)=>v===l[i]*.5)).toBe(true);
  const [recovered]=stream(e,rate*2,()=>.1);expect(recovered.at(-1)).toBeCloseTo(.1,6);
  stream(e,rate/10,()=>4);e.fx_clear();expect(stream(e,128,()=>.1)[0][0]).toBe(Math.fround(.1));
 }
});
test('overload protection is sample-consistent across callback sizes',()=>{
 const run=chunk=>stream(effects(48000),24000,i=>(i<12000?4:.1)*Math.sin(i*.13),chunk)[0];
 expect(run(1)).toEqual(run(257));
});
