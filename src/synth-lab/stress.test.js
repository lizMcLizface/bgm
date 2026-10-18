// @vitest-environment node
import {vi} from 'vitest';
vi.mock('../audio/context',()=>({audioContext:{}}));
vi.mock('./ensembleBackend',()=>({renderEnsemble:vi.fn()}));
vi.mock('./inserts',()=>({insertsMemoryBytes:async()=>1024}));
import {STRESS_CASES,stressCases,stressConfig,stressPlan} from './stressPlan';
import {ensembleEvents,effectsLayout} from './ensemblePlan';
import {median,stressSummary,runStressCase,runStressMatrix} from './stressRunner';
test('the bounded case registry covers every family and keeps melodic voices active without accidental stealing',()=>{
 expect(STRESS_CASES).toHaveLength(27);expect(new Set(STRESS_CASES.map(c=>c.id)).size).toBe(27);expect(['core','quality','boundary','tails'].map(s=>stressCases(s).length)).toEqual([15,7,3,2]);
 for(const spec of STRESS_CASES){expect(stressConfig(spec.config)).toEqual(spec.config);const p=stressPlan(spec.config);expect(p.seconds).toBeGreaterThanOrEqual(8);expect(p.parts).toHaveLength(spec.config.instruments);
  for(const part of p.parts){const events=ensembleEvents(part,p.config.sampleRate);expect(events.length).toBeLessThan(4096);expect(events.every(e=>e.every(Number.isFinite))).toBe(true);if(part.family!=='drums'){expect(p.voices[part.id].peak).toBe(spec.config.voices);expect(p.voices[part.id].capacity).toBe(spec.config.voices);expect(Math.max(...part.notes.map(n=>n.time+n.duration+part.release))).toBeLessThan(p.cycleSeconds+.05);}else expect(part.notes.length/p.cycleSeconds).toBe(12);}
 }
 expect(new Set(stressPlan().parts.map(p=>p.family))).toEqual(new Set(['fm','subtractive','piano','pluck','drums']));expect(stressConfig({voices:999,rate:0,unison:100})).toMatchObject({voices:8,rate:48000,unison:1});
});
test('room/quality and full-tail variants isolate the requested cost dimensions',()=>{
 const normal=stressPlan({}),privateRoom=stressPlan({rooms:2,privateRoom:true}),long=stressPlan({decay:20}),tail=stressPlan({window:'tail',decay:20});expect(effectsLayout(normal,'local').count).toBe(1);expect(effectsLayout(privateRoom,'local').count).toBe(3);expect(effectsLayout(normal,'separate').count).toBe(5);expect(normal.seconds).toBe(long.seconds);expect(normal.parts.map(p=>p.notes)).toEqual(long.parts.map(p=>p.notes));expect(tail.seconds).toBeGreaterThan(long.seconds);expect(tail.stress.tailTruncated).toBe(false);expect(normal.stress.tailTruncated).toBe(true);
 const acoustic=stressPlan(STRESS_CASES.find(c=>c.id==='mixed-acoustic').config);expect(acoustic.parts[0].patch.global.breath).toBeGreaterThan(0);expect(acoustic.parts[1].patch.layers[0].bow).toBeGreaterThan(0);const ladder=stressPlan(STRESS_CASES.find(c=>c.id==='sub-ladder').config);expect(ladder.parts[0].patch.layers[0].filterFamily).toBe(1);
 const lanes=stressPlan({family:'subtractive',instruments:4,voices:16,layers:2,unison:4});expect(lanes.stress.subtractiveLanes).toBe(512);expect(stressPlan({family:'fm',instruments:4,voices:8,operators:6,quality:2}).stress.fmOperatorLanes).toBe(768);
});
test('expression controls keep sample frames and IDs aligned across live cycles',()=>{
 const p=stressPlan({expression:true}),part=p.parts[0],events=ensembleEvents(part,48000,{cycle:2,offset:16});expect(events).toContainEqual([3,20001,Math.round(18.5*48000),.6,0]);expect(events).toContainEqual([5,20001,Math.round(17.5*48000),part.notes[0].midi+2,.7]);expect(part.patches.map(p=>p.time)).toEqual([2,4]);expect(p.parts.filter(p=>p.kind==='procedural').every(p=>p.controls.length===0&&p.patches.length===0)).toBe(true);
});
const sample=(ms=10)=>({buffer:{},prepareMs:3,renderMs:ms,seconds:8,metrics:{peak:.2,rms:.05,fullScale:0,nonFinite:0},sourceStats:{0:{late:2,dropped:0,steals:1},1:{late:3,dropped:1,steals:2}},missingSourceStats:[],instrumentInsertCount:0,tail:{estimatedRT60:8}});
test('summaries exclude warm-up and sum source diagnostics within each run',()=>{
 const s=stressSummary([{...sample(900),warmup:true},{...sample(10),warmup:false},{...sample(30),warmup:false},{...sample(20),warmup:false}]);expect(s).toMatchObject({runs:3,renderMs:20,audioPerRender:400,late:5,dropped:1,steals:3});expect(median([3,9,1,5])).toBe(4);expect(median([])).toBe(null);
});
test('a case discards PCM, preserves cold/preparation runs and explicitly marks truncated tail metrics',async()=>{
 const render=vi.fn(async()=>sample()),r=await runStressCase(STRESS_CASES[0],{render,repeats:3,warmup:true});expect(render).toHaveBeenCalledTimes(4);expect(r.runs).toHaveLength(4);expect(r.summary.runs).toBe(3);expect(r.runs.every(r=>!('buffer'in r))).toBe(true);expect(r.runs[0].warmup).toBe(true);expect(r.runs[0].tail.available).toBe(false);
});
test('a failed case remains reviewable, while cancellation stops the sweep and aborts the current graph',async()=>{
 const render=vi.fn(async()=>{throw Error('prepared buffer bound');}),rows=await runStressMatrix(STRESS_CASES.slice(0,2),{render,warmup:false,repeats:1});expect(rows).toHaveLength(2);expect(rows.every(r=>r.status==='failed'&&r.error==='prepared buffer bound')).toBe(true);
 const controller=new AbortController();let graphSignal;const pending=runStressCase(STRESS_CASES[0],{signal:controller.signal,render:(_p,_path,{signal})=>{graphSignal=signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('disposed'))));}});controller.abort();await expect(pending).rejects.toThrow('cancelled');expect(graphSignal.aborted).toBe(true);
});

import {frameSummary,clockProgress} from './stressMetrics';
test('live clocks expose overload even when graphics and queues remain smooth',()=>{expect(clockProgress(17,13.5)).toMatchObject({inspect:true,lagSeconds:3.5});expect(clockProgress(17,17.002).inspect).toBe(false);expect(clockProgress(0,0).ratio).toBeNull();expect(frameSummary([16,17,50])).toMatchObject({samples:3,maxMs:50,over33ms:1});});
