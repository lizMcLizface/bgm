// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {OwnedFm,validateFmSpec,saveFmSpec,loadFmSpec} from './ownedFm';
import {fmCases,pcm,legacyOwnedExports} from '../../tools/fmOwnedVerification.mjs';
const graph=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const legacy=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
const golden=JSON.parse(fs.readFileSync('src/modular-audio/fmLegacyPcm.json'));
const cases=fmCases(),base=cases[0];
describe('owned FM state and compatibility',()=>{
 it.each([44100,48000,96000])('matches pre-extraction PCM at %i Hz across partial blocks, stealing and transitions',rate=>{
  for(const id of ['recipe-0','dense-reordered-stealing','structural-transition']){const c=cases.find(c=>c.rate===rate&&c.id===id),d=new OwnedFm(new WebAssembly.Instance(graph,{}).exports,c.spec,rate);try{const out=pcm(d,c.total);expect(out.sha256).toBe(golden.fixtures.find(f=>f.key===`${id}/${rate}`).sha256);expect(out.stats.latencyFrames).toBe(id==='structural-transition'?7.75:7.5);expect(out.stats.dropped).toBe(0);}finally{d.dispose();}}
 });
 it('keeps two owners in one memory independent through reset, panic and disposal',()=>{
  const aSpec=base.spec,bSpec=cases.find(c=>c.id==='mono-2').spec,e=new WebAssembly.Instance(graph,{}).exports;
  expect('fm_init' in e).toBe(false);const a=new OwnedFm(e,aSpec,48000),b=new OwnedFm(e,bSpec,48000),oldA=new OwnedFm(legacyOwnedExports(legacy),aSpec,48000),oldB=new OwnedFm(legacyOwnedExports(legacy),bSpec,48000);a.refresh();b.refresh();
  try{for(let i=0;i<200;i++){if(i===50){b.reset();oldB.reset();}if(i===100){b.panic();oldB.panic();}if(i===150){b.dispose();oldB.dispose();}a.render(127);oldA.render(127);expect(a.left.subarray(0,127)).toEqual(oldA.left.subarray(0,127));expect(a.right.subarray(0,127)).toEqual(oldA.right.subarray(0,127));if(i<150){b.render(127);oldB.render(127);expect(b.left.subarray(0,127)).toEqual(oldB.left.subarray(0,127));}}}finally{a.dispose();b.dispose();oldA.dispose();oldB.dispose();}
 });
 it('roundtrips the versioned packet and rejects malformed contracts before allocation',()=>{
  expect(loadFmSpec(saveFmSpec(base.spec))).toEqual(base.spec);
  const full=structuredClone(cases.find(c=>c.id==='structural-transition').spec);full.events=Array(4095).fill(base.spec.events[0]);expect(()=>validateFmSpec(full)).toThrow('resource bounds');
  for(const change of [s=>s.version=2,s=>s.events[0][2]=.5,s=>s.events[0][1]=-1,s=>s.patch.operators[0][0]=8,s=>s.patch.routes[0][2]=1,s=>s.patch.globals.push(s.patch.globals[0]),s=>s.performance.mode=3,s=>s.edits=Array(33).fill({})]){const s=structuredClone(base.spec);change(s);expect(()=>validateFmSpec(s)).toThrow();}
  const d=new OwnedFm(new WebAssembly.Instance(graph,{}).exports,base.spec,48000);d.dispose();d.dispose();expect(()=>d.render(1)).toThrow('Disposed');
 });
 it('runs the actual paired worklet with a partial final quantum and two distinct outputs',()=>{
  let Type;const messages=[],context=vm.createContext({WebAssembly,Float32Array,Math,Number,Error,Set,Object,OwnedFm,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c});
  vm.runInContext(fs.readFileSync('public/modular-audio/owned-fm-processor.js','utf8').replace(/^import .*\n/,''),context);
  const spec=structuredClone(base.spec);spec.events=[[0,9,37,60,.7]];const second=structuredClone(spec);second.events[0][3]=48;
  const p=new Type({processorOptions:{module:graph,parts:[{role:'second',spec},{role:'bass',spec:second}],endFrame:131}}),out=Array.from({length:2},()=>[new Float32Array(128),new Float32Array(128)]);
  expect(p.process([],out)).toBe(true);expect(out[0][0].slice(0,37).every(x=>x===0)).toBe(true);expect(out[0][0]).not.toEqual(out[1][0]);out.forEach(bus=>bus.forEach(ch=>ch.fill(1)));expect(p.process([],out)).toBe(false);expect(out[0][0].slice(3).every(x=>x===0)).toBe(true);expect(messages.at(-1).roles.second.frame).toBe(131);p.port.onmessage({data:{type:'dispose'}});expect(p.parts.every(p=>p.dsp.handle===0)).toBe(true);
 });
});
