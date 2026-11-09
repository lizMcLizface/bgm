// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {it,expect} from 'vitest';
import {ReferenceGraph} from './runtime';
import {sixSourceDag} from './pitchedFixture';
import {planSourcePool} from './poolPlan';
it('runs the actual Rust master worklet, retaining raw/key taps before host buffers clear and clipping the final quantum',()=>{
  const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),plan=planSourcePool(sixSourceDag(fixture,48000),contracts);let Type;const messages=[],ctx=vm.createContext({ReferenceGraph,WebAssembly,Float32Array,Array,Math,Number,Error,Object,Uint32Array,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c});
  vm.runInContext(fs.readFileSync('public/modular-audio/pool-output-processor.js','utf8').replace(/^import[^;]+;\s*$/gm,''),ctx);
  const p=new Type({processorOptions:{module,contracts,patch:plan.master,groups:plan.groups,endFrame:131,options:{blockFrames:256,poolBlocks:2}}});
  for(let group=0;group<3;group++){const link={postMessage(){},close(){}};p.port.onmessage({data:{type:'connect',group,port:link}});const buffer=new ArrayBuffer(256*16*4);new Float32Array(buffer).fill(.1);link.onmessage({data:{slot:0,frame:0,n:131,generation:1,buffer}});}
  expect(messages.some(d=>d.type==='primed')).toBe(true);const outputs=Array.from({length:8},()=>[new Float32Array(128),new Float32Array(128)]);for(let i=0;i<4;i++){expect(p.process([],outputs)).toBe(true);expect(outputs[7][0].every(x=>x===0)).toBe(true);}expect(p.process([],outputs)).toBe(true);for(let bus=0;bus<7;bus++)expect(outputs[bus][0][0]).toBeCloseTo(.1,7);expect(outputs[7][0][0]).toBeGreaterThan(0);expect(p.process([],outputs)).toBe(false);expect(outputs.every(bus=>bus.every(ch=>ch.slice(3).every(x=>x===0)))).toBe(true);expect(messages.find(d=>d.type==='stats')).toMatchObject({sourceFrame:131,queue:{underrunFrames:0},master:{graph:{frame:131}}});p.port.onmessage({data:{type:'dispose'}});expect(p.g.handle).toBe(0);
});
