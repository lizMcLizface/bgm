// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {OwnedCore,validateCoreSpec,saveCoreSpec,loadCoreSpec} from './ownedCore';
import {coreCases,pcm,legacyOwnedCoreExports} from '../../tools/coreOwnedVerification.mjs';
import {OwnedFm} from './ownedFm';
import {legacyOwnedExports} from '../../tools/fmOwnedVerification.mjs';
import {coreSpecForPart,fmSpecForPart,percussionPatch} from './sixRoleFixture';
import {ReferenceGraph} from './runtime';
import {LegacyRoleKernel} from './sixRoleKernels';
const graph=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const legacy=new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm'));
const golden=JSON.parse(fs.readFileSync('src/modular-audio/coreLegacyPcm.json'));
const cases=coreCases(),base=cases[0];
describe('owned core state and compatibility',()=>{
 it.each([44100,48000,96000])('matches pre-extraction PCM at %i Hz across partial blocks, stealing and transitions',rate=>{
  for(const id of ['recipe-0','dense-reordered-stealing','structural-transition']){const c=cases.find(c=>c.rate===rate&&c.id===id),d=new OwnedCore(new WebAssembly.Instance(graph,{}).exports,c.spec,rate);try{const out=pcm(d,c.total);expect(out.sha256).toBe(golden.fixtures.find(f=>f.key===`${id}/${rate}`).sha256);expect(out.stats.latencyFrames).toBe(0);expect(out.stats.dropped).toBe(0);}finally{d.dispose();}}
 });
 it('keeps three owners in one memory independent through reset, panic and disposal',()=>{
  const specs=['recipe-0','additive-7','recipe-8'].map(id=>cases.find(c=>c.id===id).spec),e=new WebAssembly.Instance(graph,{}).exports;
  expect('engine_init' in e).toBe(false);const ds=specs.map(s=>new OwnedCore(e,s,48000)),old=specs.map(s=>new OwnedCore(legacyOwnedCoreExports(legacy),s,48000));ds.forEach(d=>d.refresh());
  try{for(let i=0;i<200;i++){if(i===50){ds[1].reset();old[1].reset();}if(i===100){ds[2].panic();old[2].panic();}if(i===150){ds[1].dispose();old[1].dispose();}for(let k=0;k<3;k++){if(k===1&&i>=150)continue;ds[k].render(127);old[k].render(127);expect(ds[k].left.subarray(0,127)).toEqual(old[k].left.subarray(0,127));expect(ds[k].right.subarray(0,127)).toEqual(old[k].right.subarray(0,127));}}}finally{ds.forEach(d=>d.dispose());old.forEach(d=>d.dispose());}
 });
 it('roundtrips the versioned packet and rejects malformed contracts before allocation',()=>{
  expect(loadCoreSpec(saveCoreSpec(base.spec))).toEqual(base.spec);
  const full=structuredClone(cases.find(c=>c.id==='structural-transition').spec);full.events=Array(4095).fill(base.spec.events[0]);expect(()=>validateCoreSpec(full)).toThrow('resource bounds');
  for(const change of [s=>s.version=2,s=>s.events[0][2]=.5,s=>s.events[0][1]=-1,s=>s.patch[0][0]=3,s=>s.patch[12][1]=116,s=>s.patch.push(s.patch[0]),s=>s.performance.mode=3,s=>s.edits=Array(33).fill({})]){const s=structuredClone(base.spec);change(s);expect(()=>validateCoreSpec(s)).toThrow();}
  const d=new OwnedCore(new WebAssembly.Instance(graph,{}).exports,base.spec,48000);d.dispose();d.dispose();expect(()=>d.render(1)).toThrow('Disposed');
 });
 it('keeps all six actual source engines exact together in one Wasm memory',()=>{
  const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),fm=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm')),drums=new WebAssembly.Module(fs.readFileSync('public/synth-lab/percussion.wasm')),e=new WebAssembly.Instance(graph,{}).exports;
  const ds=fixture.parts.slice(0,5).map(p=>new (p.kind==='core'?OwnedCore:OwnedFm)(e,(p.kind==='core'?coreSpecForPart:fmSpecForPart)(fixture,p,48000),48000));
  const old=fixture.parts.slice(0,5).map(p=>new (p.kind==='core'?OwnedCore:OwnedFm)(p.kind==='core'?legacyOwnedCoreExports(legacy):legacyOwnedExports(fm),(p.kind==='core'?coreSpecForPart:fmSpecForPart)(fixture,p,48000),48000));
  const g=new ReferenceGraph(e,percussionPatch(fixture,48000),contracts,48000),oldDrums=new LegacyRoleKernel({percussion:drums},fixture,fixture.parts[5],48000),diff=Array(6).fill(0),peak=Array(6).fill(0);ds.forEach(d=>d.refresh());g.refresh();
  try{for(let at=0;at<840000;){const n=Math.min(113,840000-at);for(let k=0;k<6;k++){const a=k===5?g:ds[k],b=k===5?oldDrums:old[k];a.render(n);b.render(n);for(let i=0;i<n;i++){diff[k]=Math.max(diff[k],Math.abs(a.left[i]-b.left[i]),Math.abs(a.right[i]-b.right[i]));peak[k]=Math.max(peak[k],Math.abs(a.left[i]),Math.abs(a.right[i]));}}at+=n;}expect(diff).toEqual([0,0,0,0,0,0]);expect(peak.every(x=>x>0)).toBe(true);}finally{ds.forEach(d=>d.dispose());old.forEach(d=>d.dispose());g.dispose();}
 });
 it('runs the actual three-output worklet with a partial final quantum and distinct outputs',()=>{
  let Type;const messages=[],context=vm.createContext({WebAssembly,Float32Array,Math,Number,Error,Set,Object,OwnedCore,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close(){}};}},registerProcessor:(_,c)=>Type=c});
  vm.runInContext(fs.readFileSync('public/modular-audio/owned-core-processor.js','utf8').replace(/^import .*\n/,''),context);
  const spec=structuredClone(base.spec);spec.events=[[0,9,37,60,.7]];const second=structuredClone(spec);second.events[0][3]=48;
  const p=new Type({processorOptions:{module:graph,parts:[{role:'lead',spec},{role:'rhythm',spec:second},{role:'pad',spec:second}],endFrame:131}}),out=Array.from({length:3},()=>[new Float32Array(128),new Float32Array(128)]);
  expect(p.process([],out)).toBe(true);expect(out[0][0].slice(0,37).every(x=>x===0)).toBe(true);expect(out[0][0]).not.toEqual(out[1][0]);out.forEach(bus=>bus.forEach(ch=>ch.fill(1)));expect(p.process([],out)).toBe(false);expect(out[0][0].slice(3).every(x=>x===0)).toBe(true);expect(messages.at(-1).roles.lead.frame).toBe(131);p.port.onmessage({data:{type:'dispose'}});expect(p.parts.every(p=>p.dsp.handle===0)).toBe(true);
 });
});
