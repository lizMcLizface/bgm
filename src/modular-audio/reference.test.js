// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {ReferenceGraph,loadPatch,savePatch,validatePatch} from '../../public/modular-audio/runtime.js';
const bytes=fs.readFileSync('public/modular-audio/graph.wasm');
const module=new WebAssembly.Module(bytes);
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('public/modular-audio/reference-patch.json','utf8'));
const exportsOf=()=>new WebAssembly.Instance(module,{}).exports;
function pcm(g,total=48000,block=128) {
 const l=new Float32Array(total),r=new Float32Array(total);
 for(let at=0;at<total;) { const n=Math.min(block,total-at); g.render(n); l.set(g.left.subarray(0,n),at); r.set(g.right.subarray(0,n),at); at+=n; }
 return [l,r];
}
function expected(i,rate) {
 if(i<37||i>=42023)return [0,0];
 const base=i<12013?.5:.4, mod=i>=24017&&i<30019?0:.45*Math.sin(i*2/rate*Math.PI*2),gain=Math.min(2,Math.max(0,base+mod));
 return [Math.sin(i*220/rate*2*Math.PI)*.2*gain+Math.sin(i*330/rate*2*Math.PI)*.05,Math.cos(i*220/rate*2*Math.PI)*.2*gain+Math.cos(i*330/rate*2*Math.PI)*.05].map(v=>v*.7);
}
describe('portable graph actual Wasm PCM',()=>{
 it('publishes the same machine contracts from the compiled Rust core',()=>{
  const e=exportsOf(),h=e.graph_contracts_new();try{expect(JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer,e.graph_contracts_ptr(h),e.graph_contracts_len(h))))).toEqual(contracts);}finally{e.graph_contracts_free(h);}
 });
 it.each([44100,48000,96000])('matches independent stereo/time/modulation equations at %i Hz',rate=>{
  const g=new ReferenceGraph(exportsOf(),fixture,contracts,rate);
  try { const out=pcm(g,48000,127); let error=0;
   for(let i=0;i<48000;i++){const e=expected(i,rate); for(let ch=0;ch<2;ch++)error=Math.max(error,Math.abs(out[ch][i]-e[ch]));}
   expect(error).toBeLessThan(6e-8); expect(out[1][37]).not.toBe(0); expect(g.stats()).toEqual({frame:48000,late:0,overflow:0,applied:7});
  } finally {g.dispose();}
 });
 it('save/reload is bit identical across variable block sizes with stable IDs/bases/mappings',()=>{
  const saved=savePatch(fixture,contracts),reloaded=loadPatch(saved,contracts);
  expect(reloaded).toEqual(fixture);
  const a=new ReferenceGraph(exportsOf(),fixture,contracts,48000),b=new ReferenceGraph(exportsOf(),reloaded,contracts,48000);
  try {const reference=pcm(a,48000,2048),output=pcm(b,48000,113);expect(output).toEqual(reference);}finally{a.dispose();b.dispose();}
 });
 it('maps unipolar control with negative depth/offset and clamps gain without changing the base',()=>{
  const p=structuredClone(fixture);p.events=[{frame:0,target:11,owner:1,kind:'gate',value:true}];p.modules.find(n=>n.id===14).parameters.amplitude=0;
  Object.assign(p.connections.find(e=>e.id===22),{mapping:'unipolar',depth:-2,offset:1});
  const g=new ReferenceGraph(exportsOf(),p,contracts,48000);
  try{const out=pcm(g,24000,511);let max=0;for(let i=0;i<24000;i++){const gain=Math.max(0,Math.min(2,.5-Math.sin(i*2/48000*Math.PI*2)));max=Math.max(max,Math.abs(out[1][i]-Math.cos(i*220/48000*Math.PI*2)*.2*gain*.7));}expect(max).toBeLessThan(6e-8);expect(g.patch.modules.find(n=>n.id===13).parameters.gain).toBe(.5);}finally{g.dispose();}
 });
 it('bounds the live event queue, counts late events and rejects invalid render sizes',()=>{
  const p=structuredClone(fixture);p.events=[];const g=new ReferenceGraph(exportsOf(),p,contracts,48000);
  try{g.render(100);g.enqueue({frame:0,target:11,owner:1,kind:'gate',value:true});g.render(1);expect(g.stats()).toMatchObject({frame:101,late:1,applied:1});
   for(let i=0;i<contracts.maxEvents;i++)g.enqueue({frame:1000+i,target:11,owner:1,kind:'gate',value:false});
   expect(()=>g.enqueue({frame:2000,target:11,owner:1,kind:'gate',value:false})).toThrow('(7)');expect(g.stats().overflow).toBe(1);expect(()=>g.render(.5)).toThrow('frame count');
  }finally{g.dispose();}
 });
 it('owns multiple handles in ONE Wasm instance, survives disposal and reset',()=>{
  const e=exportsOf(),a=new ReferenceGraph(e,fixture,contracts,48000),silent=structuredClone(fixture);silent.events=[];
  const b=new ReferenceGraph(e,silent,contracts,48000);a.refresh(); // preparation can grow shared memory
  expect(pcm(b,100)[1].every(v=>v===0)).toBe(true);
  expect(pcm(a,100)[1].some(v=>v!==0)).toBe(true);
  a.dispose();a.dispose();expect(()=>a.render(1)).toThrow('Disposed');
  b.enqueue({frame:100,target:11,owner:9,kind:'gate',value:true});expect(pcm(b,1)[1][0]).not.toBe(0);b.cancel(9);expect(pcm(b,1)[1][0]===0).toBe(true);
  b.reset();expect(b.stats().frame).toBe(0);b.dispose();
 });
 it('rejects graph cycles/fan-in, unknown identities, incompatible ports/versions and NaN',()=>{
  const mutate=fn=>{const p=structuredClone(fixture);fn(p);return p;};
  for(const p of [mutate(p=>p.version=2),mutate(p=>p.modules[0].version=99),mutate(p=>p.modules[0].parameters.frequency=NaN),mutate(p=>p.modules[1].id=11),mutate(p=>p.connections[0].from.module=999),mutate(p=>p.connections[0].from.module=12),mutate(p=>p.events[0].frame=.5)])expect(()=>validatePatch(p,contracts)).toThrow();
  const dup=mutate(p=>p.connections.push({...p.connections[0],id:999}));expect(()=>savePatch(dup,contracts)).toThrow('Duplicate input');
  const cycle=mutate(p=>p.connections[0].from={module:15,port:'audio.out'});expect(()=>loadPatch(JSON.stringify(cycle),contracts)).toThrow('cycle');
 });
 it('runs the actual worklet processor with variable quanta and disposes outside process',async()=>{
  let Processor;const messages=[];
  const context=vm.createContext({WebAssembly,Float32Array,Math,Infinity,sampleRate:48000,currentFrame:8192,ReferenceGraph,AudioWorkletProcessor:class {constructor(){this.port={postMessage:m=>messages.push(m),close(){}};}},registerProcessor:(_name,c)=>Processor=c});
  vm.runInContext(fs.readFileSync('public/modular-audio/processor.js','utf8').replace(/^import .*\n/,''),context);
  const p=new Processor({processorOptions:{module,patch:fixture,contracts,stopFrame:48000}});
  const g=new ReferenceGraph(exportsOf(),fixture,contracts,48000);let at=0;
  for(const n of [1,17,128,511,2048,127,256]) { const channels=[new Float32Array(n),new Float32Array(n)];expect(p.process([], [channels])).toBe(true);g.render(n);expect(channels[0]).toEqual(g.left.slice(0,n));expect(channels[1]).toEqual(g.right.slice(0,n));at+=n; }
  expect(messages[0]).toMatchObject({type:'ready',contextCreatedFrame:8192,frame:0});expect(p.origin).toBe(8192);expect(p.graph.stats().frame).toBe(at);
  p.port.onmessage({data:{type:'dispose'}});expect(p.process([],[[new Float32Array(128),new Float32Array(128)]])).toBe(false);expect(p.graph.handle).toBe(0);g.dispose();
  const end=new Processor({processorOptions:{module,patch:fixture,contracts,stopFrame:101}}),tail=[new Float32Array(128),new Float32Array(128)];
  expect(end.process([],[tail])).toBe(false);expect(end.graph.stats().frame).toBe(101);expect(tail[1].slice(101).every(v=>v===0)).toBe(true);end.port.onmessage({data:{type:'dispose'}});
 });
});
