// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {workerOptions,WorkerPcmQueue} from './workerProtocol';
import {ReferenceGraph} from './runtime';
import {pitchedPatch} from './pitchedFixture';
import {coreCases} from '../../tools/coreOwnedVerification.mjs';
const outputs=n=>Array.from({length:8},()=>[new Float32Array(n),new Float32Array(n)]);
function block(slot,frame,n=256,generation=1){const buffer=new ArrayBuffer(256*16*4),pcm=new Float32Array(buffer);for(let b=0;b<8;b++)for(let i=0;i<n;i++){pcm[(b*n+i)*2]=frame+i+b/16;pcm[(b*n+i)*2+1]=-frame-i-b/16;}return {slot,frame,n,generation,buffer};}
describe('bounded worker PCM publication',()=>{
 it('holds a partial serial graph at frame zero until armed, then emits only its selected source and clips the final quantum',()=>{
  const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),patch=pitchedPatch({...coreCases()[0].spec,events:[[0,1,0,60,.8]],edits:[]},false);let Type;const messages=[],ctx=vm.createContext({ReferenceGraph,WebAssembly,Float32Array,Array,Math,Number,Error,Object,Uint32Array,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c});
  vm.runInContext(fs.readFileSync('public/modular-audio/worker-output-processor.js','utf8').replace(/^import[^;]+;\s*$/gm,''),ctx);
  const p=new Type({processorOptions:{mode:'serial',sourceIds:[1],startPaused:true,module,contracts,patch,endFrame:131,options:{blockFrames:256,poolBlocks:2}}}),out=outputs(128);
  for(let i=0;i<20;i++)p.process([],out);expect(p.outputFrame).toBe(0);expect(p.sourceFrame).toBe(0);expect(p.g.stats().frame).toBe(0);p.port.onmessage({data:{type:'start'}});for(let i=0;i<4;i++)p.process([],out);expect(p.sourceFrame).toBe(0);p.process([],out);expect(out.slice(1).every(bus=>bus.every(ch=>ch.every(v=>v===0)))).toBe(true);expect(out[0][0].some(v=>v!==0)).toBe(true);expect(p.process([],out)).toBe(false);expect(out[0][0].slice(3).every(v=>v===0)).toBe(true);expect(messages.find(d=>d.type==='stats')).toMatchObject({armed:true,sourceIds:[1],sourceFrame:131});p.port.onmessage({data:{type:'dispose'}});
 });
 it('bounds the pool, generation, block and latency contracts',()=>{expect(workerOptions().delayFrames).toBe(4096);for(const o of [{poolBlocks:9},{poolBlocks:1},{blockFrames:300},{generation:0}])expect(()=>workerOptions(o)).toThrow();});
 it('preserves every stereo bus through irregular consumption and final partial blocks',()=>{
  const recycled=[],q=new WorkerPcmQueue({blockFrames:256,poolBlocks:2},259,b=>recycled.push(b));q.accept(block(0,0));q.accept(block(1,256,3));
  const a=outputs(127),b=outputs(132);q.consume(a,0,127);q.consume(b,0,132);
  for(let bus=0;bus<8;bus++){expect(a[bus][0][126]).toBe(126+bus/16);expect(b[bus][0][131]).toBe(258+bus/16);expect(b[bus][1][131]).toBe(-258-bus/16);}expect(q.frame).toBe(259);expect(recycled).toHaveLength(2);expect(q.counters.underrunFrames).toBe(0);expect(q.counters.queueHighWater).toBe(2);
 });
 it('emits silence for a miss, drops expired work and trims a partially late block without replay',()=>{
  const recycled=[],q=new WorkerPcmQueue({blockFrames:256,poolBlocks:2},1024,b=>recycled.push(b));const silent=outputs(300);q.consume(silent,0,300);expect(silent.every(bus=>bus.every(ch=>ch.every(x=>x===0)))).toBe(true);
  expect(q.accept(block(0,0))).toBe(false);expect(q.accept(block(1,256))).toBe(true);const recovered=outputs(212);q.consume(recovered,0,212);expect(recovered[0][0][0]).toBe(300);expect(recovered[0][0][211]).toBe(511);expect(q.counters).toMatchObject({underrunFrames:300,underrunQuanta:1,lateBlocks:1});expect(recycled).toHaveLength(2);
 });
 it('rejects stale generations, duplicate frames, invalid slots and malformed payloads',()=>{
  const q=new WorkerPcmQueue({blockFrames:256,poolBlocks:2},1024,()=>{});expect(q.accept(block(0,0,256,2))).toBe(false);expect(q.accept(block(0,0))).toBe(true);expect(q.accept(block(1,0))).toBe(false);expect(q.accept(block(2,256))).toBe(false);expect(q.accept({...block(1,256),buffer:new ArrayBuffer(4)})).toBe(false);expect(q.count).toBe(1);expect(q.counters).toMatchObject({staleGeneration:1,rejectedBlocks:3});q.dispose();expect(q.count).toBe(0);
 });
 it('runs the generated output worklet with exact startup delay, final clipping and serial disposal',()=>{
  const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
  // Serial fallback supports the six-role graph only; provide actual fixture.
  return import('./pitchedFixture').then(({sixSourceDag})=>{
    const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));let Type;const messages=[],ctx=vm.createContext({ReferenceGraph,Float32Array,Array,Math,Number,Error,Object,Uint32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c,sampleRate:48000,WebAssembly});
    vm.runInContext(fs.readFileSync('public/modular-audio/worker-output-processor.js','utf8').replace(/^import[^;]+;\s*$/gm,''),ctx);
    const p=new Type({processorOptions:{mode:'serial',module,contracts,patch:sixSourceDag(fixture,48000),endFrame:131,options:{blockFrames:256,poolBlocks:2}}}),out=outputs(128);
    for(let i=0;i<4;i++){expect(p.process([],out)).toBe(true);expect(out.every(bus=>bus.every(ch=>ch.every(v=>v===0)))).toBe(true);}
    expect(p.sourceFrame).toBe(0);expect(p.process([],out)).toBe(true);out.forEach(bus=>bus.forEach(ch=>ch.fill(1)));expect(p.process([],out)).toBe(false);expect(out.every(bus=>bus.every(ch=>ch.slice(3).every(v=>v===0)))).toBe(true);expect(messages.find(d=>d.type==='stats')).toMatchObject({sourceFrame:131,delayFrames:512});p.port.onmessage({data:{type:'dispose'}});expect(p.g.handle).toBe(0);
  });
 });
 it('consumes worker publications without a local DSP and fails closed on a runtime error',()=>{
  let Type;const messages=[],recycled=[],ctx=vm.createContext({ReferenceGraph:class{constructor(){throw Error('DSP must stay in the worker');}},Float32Array,Array,Math,Number,Error,Object,Uint32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c,sampleRate:48000});
  vm.runInContext(fs.readFileSync('public/modular-audio/worker-output-processor.js','utf8').replace(/^import[^;]+;\s*$/gm,''),ctx);
  const p=new Type({processorOptions:{mode:'worker',endFrame:1024,options:{blockFrames:256,poolBlocks:2}}}),link={postMessage:b=>recycled.push(b),close(){}};p.port.onmessage({data:{type:'connect',port:link}});link.onmessage({data:{type:'block',...block(0,0)}});link.onmessage({data:{type:'block',...block(1,256)}});
  expect(messages.some(d=>d.type==='primed')).toBe(true);const out=outputs(128);for(let i=0;i<4;i++)p.process([],out);expect(p.process([],out)).toBe(true);expect(out[7][0][127]).toBe(127+7/16);p.port.onmessage({data:{type:'failure'}});expect(recycled).toHaveLength(2);expect(p.process([],out)).toBe(false);expect(out.every(bus=>bus.every(ch=>ch.every(v=>v===0)))).toBe(true);expect(messages.at(-1).type).toBe('finished');expect(messages.find(d=>d.type==='stats')).toMatchObject({queue:{lead:{observations:1,steady:{samples:1,minFrames:512},drain:{samples:0}}}});
 });
});
