// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {assertSerialRealtimeAllowed} from './executionPolicy';
import {describe,it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {pitchedPatch,sixSourceDag} from './pitchedFixture';
import {coreCases,OwnedCore,legacyOwnedCoreExports} from '../../tools/coreOwnedVerification.mjs';
import {fmCases,OwnedFm,legacyOwnedExports} from '../../tools/fmOwnedVerification.mjs';
import {coreSpecForPart,fmSpecForPart} from './sixRoleFixture';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));
const make=(p,rate=48000)=>new ReferenceGraph(new WebAssembly.Instance(module,{}).exports,p,contracts,rate);
const render=(g,total)=>{let peak=0;for(let at=0;at<total;){const n=Math.min(127,total-at);g.render(n);for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(g.left[i]),Math.abs(g.right[i]));at+=n;}return peak;};
describe('block-capable pitched Rust DAG',()=>{
 it.each([44100,48000,96000])('owns and routes the actual six sources at %i Hz with exact raw stems',rate=>{
  const g=make(sixSourceDag(fixture,rate),rate),modules=Object.fromEntries(['core','fm'].map(k=>[k,new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${k}.wasm`))])),old=fixture.parts.slice(0,5).map(p=>new (p.kind==='core'?OwnedCore:OwnedFm)(p.kind==='core'?legacyOwnedCoreExports(modules.core):legacyOwnedExports(modules.fm),(p.kind==='core'?coreSpecForPart:fmSpecForPart)(fixture,p,rate),rate));
  try{let peak=0;const diff=Array(5).fill(0),total=Math.round(fixture.totalSeconds*rate);for(let at=0;at<total;){const n=Math.min(113,total-at);g.render(n);for(let k=0;k<5;k++){old[k].render(n);const source=g.outputs.get(k+1);for(let i=0;i<n;i++)diff[k]=Math.max(diff[k],Math.abs(source[i*2]-old[k].left[i]),Math.abs(source[i*2+1]-old[k].right[i]));}for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(g.left[i]),Math.abs(g.right[i]));at+=n;}expect(diff).toEqual([0,0,0,0,0]);expect(peak).toBeGreaterThan(.01);expect(g.pitchedStats(2)).toMatchObject({latencyFrames:7.5,steals:14});expect(g.stats()).toMatchObject({late:0,overflow:0,frame:total});expect(g.meters()[17].externalKey).toBe(1);}finally{old.forEach(d=>d.dispose());g.dispose();}
 });
 it.each([false,true])('cancels only the named owner, bypassing sustain without releasing peers (FM=%s)',fm=>{
  const spec=structuredClone((fm?fmCases():coreCases())[0].spec);spec.events=[];spec.edits=[];
  if(fm)for(const row of spec.patch.operators){if(row[1]===10)row[2]=.01;}else for(const row of spec.patch){if(row[0]>0&&[20,24,68].includes(row[1]))row[2]=.01;}
  const p=pitchedPatch(spec,fm);const note=(frame,owner,event,id,a=0,b=0)=>({kind:'note',target:1,frame,owner,event,note:id,a,b});
  p.events=[note(37,1,0,101,60,.7),note(73,2,0,102,67,.7),note(100,1,2,0,1),note(1001,1,1,101),note(1001,2,1,102),{kind:'cancel',target:1,owner:1,frame:1013},note(4000,1,0,103,72,.7)];
  const g=make(p);try{render(g,24000);expect(g.pitchedStats(1).active).toBe(1);g.cancel(2);render(g,48000);expect(g.pitchedStats(1).active).toBe(0);expect(g.stats().overflow).toBe(0);}finally{g.dispose();}
 });
 it.each([false,true])('forgets cancelled mono fallback keys and safely returns to the remaining owner (FM=%s)',fm=>{
  const spec=structuredClone((fm?fmCases():coreCases())[0].spec);spec.performance.mode=2;spec.events=[];spec.edits=[];const p=pitchedPatch(spec,fm);p.events=[{frame:0,target:1,owner:1,kind:'note',event:0,note:101,a:60,b:.6},{frame:100,target:1,owner:2,kind:'note',event:0,note:102,a:67,b:.6},{frame:501,target:1,owner:2,kind:'cancel'},{frame:1003,target:1,owner:1,kind:'cancel'}];const g=make(p);try{render(g,800);expect(g.pitchedStats(1).active).toBe(1);render(g,192000);expect(g.pitchedStats(1).active).toBe(0);}finally{g.dispose();}
 });
 it('roundtrips prepared transition configuration and resets it for exact replay',()=>{
  const spec=coreCases().find(c=>c.id==='structural-transition').spec,p=pitchedPatch(spec,false),saved=savePatch(p,contracts),g=make(loadPatch(saved,contracts)),a=[];try{for(let i=0;i<150;i++){g.render(127);a.push(g.left.slice(0,127));}g.reset();for(const e of p.events)g.enqueue(e);for(let i=0;i<150;i++){g.render(127);expect(g.left.slice(0,127)).toEqual(a[i]);}g.pause(true);g.render(128);expect(g.outputs.get(1).slice(0,256).every(x=>x===0)).toBe(true);}finally{g.dispose();}
 });
 it('rejects ambiguous ownership, duplicate note authority and unsupported contracts',()=>{
  const p=pitchedPatch(coreCases()[0].spec,false),a=structuredClone(p);a.events.push({...a.events[0],owner:999});expect(()=>validatePatch(a,contracts)).toThrow('owner conflict');const b=structuredClone(p);b.modules[0].config.events=[[0,1,0,60,.7]];expect(()=>validatePatch(b,contracts)).toThrow('graph events');const c=structuredClone(p);c.events[0].a=128;expect(()=>make(c)).toThrow();const g=make(p);try{expect(()=>g.enqueue({...p.events[0],owner:999})).toThrow('(3)');expect(g.pitchedStats(1).frame).toBe(0);}finally{g.dispose();}
 });
 it('runs the actual eight-output source worklet and clips a partial final block',()=>{
  let Type;const messages=[],ctx=vm.createContext({assertSerialRealtimeAllowed,WebAssembly,ReferenceGraph,Number,Error,Math,Object,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:x=>messages.push(x),close(){}};}},registerProcessor:(_,c)=>Type=c});vm.runInContext(fs.readFileSync('public/modular-audio/dag-sources-processor.js','utf8').replace(/^import .*\n/,''),ctx);const p=new Type({processorOptions:{module,contracts,patch:sixSourceDag(fixture,48000),roles:fixture.parts.map(p=>p.role),endFrame:131}}),out=Array.from({length:8},()=>[new Float32Array(128),new Float32Array(128)]);expect(p.process([],out)).toBe(true);out.forEach(bus=>bus.forEach(ch=>ch.fill(1)));expect(p.process([],out)).toBe(false);expect(out.every(bus=>bus.every(ch=>ch.slice(3).every(v=>v===0)))).toBe(true);expect(messages.at(-1).roles.sourceDag.frame).toBe(131);p.port.onmessage({data:{type:'dispose'}});expect(p.g.handle).toBe(0);
 });
});
