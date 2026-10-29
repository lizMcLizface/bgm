// @vitest-environment node
import fs from 'node:fs';
import {DSP_CASES,dspFixture,prepareDsp,compareDsp} from './profileDsp';
import {summarizeCpuProfile} from '../../tools/dspProfileSummary.mjs';
import {wasmCodeHash} from '../../tools/wasmCodeHash.mjs';
const fixture=id=>dspFixture(DSP_CASES.find(c=>c.id===id));
test('profiling fixtures isolate colour, voice/lane counts and prolonged curve cost',()=>{
 expect(new Set(DSP_CASES.map(c=>c.id)).size).toBe(DSP_CASES.length);
 const base=fixture('fm-base'),body=fixture('fm-body'),curved=fixture('fm-long-curved'),linear=fixture('fm-long-linear');
 expect(base.notes).toEqual(body.notes);expect(base.patch.global.formant).toBe(0);expect(body.patch.global.body).toBe(.35);expect(body.patch.global.breath).toBe(0);
 expect(curved.patch.operators.map(o=>o.attack)).toEqual(linear.patch.operators.map(o=>o.attack));expect(curved.patch.operators[0].attackCurve).toBe(2);expect(linear.patch.operators[0].attackCurve).toBe(1);
 const layered=fixture('core-lanes8');expect(layered.patch.layers[0]).toEqual(layered.patch.layers[1]);expect(layered.patch.global).toMatchObject({model:2,unison:4,chorus:0,polyphony:16});expect(fixture('fm-idle').notes).toEqual([]);
});
test('native fixtures preserve full source quality, chorus/layers and independent colour controls',()=>{
 const choir=fixture('fm-choir'),dry=fixture('fm-choir-dry-colour'),rosin=fixture('core-rosin'),noir=fixture('core-noir'),chorus=fixture('core-chorus');
 expect(choir.voices).toBe(8);expect(choir.patch.global.quality).toBe(1);expect(choir.patch.global.formant).toBe(.85);expect(dry.patch.global.formant).toBe(0);expect(dry.patch.operators).toEqual(choir.patch.operators);expect(dry.notes).toEqual(choir.notes);
 expect(rosin.patch.layers[0].body).toBe(.8);expect(noir.patch.global.model).toBe(2);expect(chorus.patch.global.chorus).toBe(.65);expect(fixture('core-organ-wave').patch.layers[0].waveA).toBe(5);
 dry.patch.operators[0].ratio=17;expect(fixture('fm-choir').patch.operators[0].ratio).not.toBe(17);
});
test('direct render loops preserve partial blocks and continuous input at 128 / 2048 frames',()=>{
 for(const kernel of ['core','fm','effects','inserts']){
  const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/'+kernel+'.wasm')),spec=DSP_CASES.find(c=>c.kernel===kernel),f=dspFixture(spec,{seconds:.101});
  const a=prepareDsp(module,f).run({capture:true}),b=prepareDsp(module,{...f,block:2048}).run({capture:true}),m=compareDsp(a.pcm,b.pcm);
  expect(a.pcm[0]).toHaveLength(4848);expect(m.nonFinite).toBe(0);expect(m.maxDifference).toBe(0);expect(m.peak).toBeGreaterThan(0);if(a.stats)expect(a.stats).toEqual([16,0,0,0]);
 }
});
test('CPU sample summaries distinguish self from inclusive weights and exclude idle samples',()=>{
 const frame=functionName=>({functionName,url:'',lineNumber:0}),p={nodes:[{id:1,callFrame:frame('(root)'),children:[2,4]},{id:2,callFrame:frame('render'),children:[3]},{id:3,callFrame:frame('filter')},{id:4,callFrame:frame('(idle)')}],samples:[2,3,4],timeDeltas:[100,300,600]},s=summarizeCpuProfile(p);
 expect(s.totalMs).toBe(1);expect(s.activeMs).toBe(.4);expect(s.self[0]).toMatchObject({functionName:'filter',activePercent:75});expect(s.inclusive.find(s=>s.functionName==='render').activePercent).toBe(100);
});
test('profiling provenance hashes function bodies independently of optional metadata',()=>{
 const bytes=fs.readFileSync('public/synth-lab/core.wasm'),withMetadata=Buffer.concat([bytes,Buffer.from([0,2,1,120])]);expect(wasmCodeHash(bytes)).toBe(wasmCodeHash(withMetadata));expect(()=>wasmCodeHash(Buffer.from([0]))).toThrow('Invalid Wasm');
});
