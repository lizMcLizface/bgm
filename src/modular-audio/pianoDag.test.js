// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {pianoFixture,modulatedPianoFixture} from './pianoFixture';
import {sixSourceDag} from './pitchedFixture';
import {verifyWorker} from './workerVerification';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const make=(p,e=new WebAssembly.Instance(module,{}).exports)=>new ReferenceGraph(e,p,contracts,48000,512);
const render=(g,total,blocks=[512])=>{const out=new Float32Array(total);for(let at=0,k=0;at<total;k++){const n=Math.min(blocks[k%blocks.length],total-at);g.render(n);out.set(g.left.subarray(0,n),at);expect(g.right.subarray(0,n)).toEqual(g.left.subarray(0,n));at+=n;}return out;};
it.each(['felt','electric','grand','felted','upright','ambient','glass','drama','soft','subdued','concert','measured','measuredAmbient','measuredDrama','measuredGlass','measuredHouse','measuredRavel','measuredSoft','measuredSubdued'])('owns %s playback with block-independent clocks and persisted exact replay',type=>{
 const p=pianoFixture(type,2),saved=savePatch(p,contracts),a=make(p),b=make(loadPatch(saved,contracts));try{
 const first=render(a,60000),other=render(b,60000,[37,203,1,127,128]);expect(other).toEqual(first);expect(Math.max(...first.subarray(0,37))).toBe(0);expect(first.some(v=>Math.abs(v)>.01)).toBe(true);expect(a.stats()).toEqual({frame:60000,applied:3,late:0,overflow:0});expect(a.pitchedStats(1)).toMatchObject({active:0,steals:0,peakActive:3});
 a.reset();for(const e of p.events)a.enqueue(e);expect(render(a,60000,[113])).toEqual(first);
 }finally{a.dispose();b.dispose();}
});
it('keeps two graph handles independent in the same Wasm memory and cancels one owner only',()=>{
 const e=new WebAssembly.Instance(module,{}).exports,p=pianoFixture('electric'),a=make(p,e),b=make(p,e);a.refresh();b.refresh();try{render(a,10000);render(b,10000);a.cancel(1);expect(a.pitchedStats(1).active).toBe(1);expect(b.pitchedStats(1).active).toBe(2);const muted=render(a,6000),normal=render(b,6000);expect(muted).not.toEqual(normal);a.pause(true);expect(render(a,512).every(v=>v===0)).toBe(true);expect(b.stats().frame).toBe(16000);}finally{a.dispose();b.dispose();}
});
it('rejects malformed banks, automation, ambiguous triggers and unsupported steals before playback',()=>{
 for(const edit of [p=>p.modules[0].config.banks[0].frequency=NaN,p=>p.modules[0].config.notes[0].gain[1][1]=-1,p=>p.events.push({...p.events[0]}),p=>p.events[0].a=61,p=>p.modules[0].config.voices=1,p=>p.events[0].event=1]){const p=pianoFixture();edit(p);expect(()=>validatePatch(p,contracts)).toThrow();}
 const g=make(pianoFixture());try{expect(()=>g.enqueue({...pianoFixture().events[0],note:999})).toThrow();}finally{g.dispose();}
});
it.each(['sine','linear'])('owns %s shared modulation across blocks and persisted instances',kind=>{
 const p=modulatedPianoFixture('electric',kind);
 const a=make(p),b=make(loadPatch(savePatch(p,contracts),contracts)),dry=make(pianoFixture('electric',2));try{const pcm=render(a,60000),other=render(b,60000,[37,127,203]);expect(other).toEqual(pcm);expect(render(dry,60000)).not.toEqual(pcm);a.reset();for(const e of p.events)a.enqueue(e);expect(render(a,60000,[128])).toEqual(pcm);}finally{a.dispose();b.dispose();dry.dispose();}
});
it('rejects unsupported control schemas, versions and unbounded walk snapshots',()=>{
 const p=pianoFixture();p.modules[0].version=p.modules[0].config.version=2;const control={axis:'pitch',kind:'linear',phase:0,frequency:.1,initialDepth:0,targetDepth:8,tauFrames:14400,points:[[0,0],[5760000,.5]]};p.modules[0].config.controls=[control];expect(()=>validatePatch(p,contracts)).not.toThrow();
 for(const change of [p=>p.modules[0].version=1,p=>p.modules[0].config.controls[0].phase=1,p=>p.modules[0].config.controls[0].points[1][0]=300,p=>p.modules[0].config.controls[0].points[1][1]=2]){const invalid=structuredClone(p);change(invalid);expect(()=>validatePatch(invalid,contracts)).toThrow();}
 const e=new WebAssembly.Instance(module,{}).exports,g=make(pianoFixture(),e);try{expect(e.graph_piano_control(g.handle,1,0,0,0,1,0,8,14400)).not.toBe(0);}finally{g.dispose();}
});
it('accepts the native clamped three-sigma walk endpoint including its final floating-point bit',()=>{const p=modulatedPianoFixture('electric','linear');p.modules[0].config.controls[0].points[0][1]=-1.2000000000000002;const g=make(p);try{expect(render(g,8000).some(v=>v!==0)).toBe(true);}finally{g.dispose();}});
it.each([1,2])('owns explicit %s-slot steal fades with exact persisted and irregular-block replay',voices=>{
 const p=pianoFixture('electric',2,voices),a=make(p),b=make(loadPatch(savePatch(p,contracts),contracts));try{expect(p.modules[0].version).toBe(3);const pcm=render(a,60000),other=render(b,60000,[37,203,1,128]);expect(other).toEqual(pcm);expect(pcm.some(v=>Math.abs(v)>.01)).toBe(true);expect(a.pitchedStats(1)).toMatchObject({active:0,steals:voices===1?2:1,peakActive:voices});a.reset();for(const e of p.events)a.enqueue(e);expect(render(a,60000,[127])).toEqual(pcm);}finally{a.dispose();b.dispose();}
});
it('keeps stolen slot owners independent and cancels their future triggers without moving other owners',()=>{
 const e=new WebAssembly.Instance(module,{}).exports,p=pianoFixture('electric',0,1),a=make(p,e),b=make(p,e);a.refresh();b.refresh();try{render(a,8000);render(b,8000);a.cancel(1);expect(a.pitchedStats(1).active).toBe(1);expect(b.pitchedStats(1).active).toBe(1);expect(render(a,5000)).toEqual(render(b,5000));expect(render(a,10000)).not.toEqual(render(b,10000));expect(a.pitchedStats(1).steals).toBe(1);expect(b.pitchedStats(1).steals).toBe(2);}finally{a.dispose();b.dispose();}
});
it('rejects dense steals, unsorted onsets, wrong versions, overlapping slots and wrong-time dynamic triggers',()=>{
 const score=[{midi:60,time:.125,duration:.5,velocity:.5},{midi:64,time:.13,duration:.5,velocity:.5}];expect(()=>pianoFixture('felted',0,1,score)).toThrow('10 ms');expect(()=>pianoFixture('felted',0,1,[...score].reverse())).toThrow('ordered');
 for(const edit of [p=>p.modules[0].version=2,p=>p.modules[0].config.notes[0].fadeFrame=-1,p=>p.modules[0].config.notes[0].cutFrame++,p=>p.modules[0].config.notes[1].voice=3,p=>p.modules[0].config.notes[1].onsetFrame++,p=>p.modules[0].config.notes[0].cutFrame+=500,p=>p.modules[0].config.notes[0].fadeFrame=NaN]){const p=pianoFixture('electric',0,1);edit(p);expect(()=>validatePatch(p,contracts)).toThrow();}
 const p=pianoFixture('electric',0,1),g=make(p);try{expect(()=>g.enqueue({...p.events[0],frame:p.events[0].frame+1})).toThrow();}finally{g.dispose();}
 const e=new WebAssembly.Instance(module,{}).exports,old=make(pianoFixture(),e);try{expect(e.graph_piano_lifetime(old.handle,1,1,0,37,-1,30000)).not.toBe(0);}finally{old.dispose();}
});
it('preserves the native next-free cursor across a steal and selects the earliest release',()=>{
 const score=[{midi:60,time:.125,duration:.3,velocity:.5},{midi:64,time:.2,duration:.8,velocity:.5},{midi:67,time:.4,duration:.2,velocity:.5},{midi:72,time:1.5,duration:.2,velocity:.5}],p=pianoFixture('electric',0,2,score),n=p.modules[0].config.notes;
 expect(n.map(n=>n.voice)).toEqual([0,1,0,0]);expect(n[0].fadeFrame).toBe(12720);expect(n[0].cutFrame).toBe(13200);expect(n[1].fadeFrame).toBeNull();
});
it('publishes two pianos, core, FM and drums with exact eight-bus serial/worker PCM through the sidechain master',async()=>{
 const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),patch=sixSourceDag(fixture,48000);
 for(const [id,type]of [[3,'measuredAmbient'],[4,'measuredRavel']]){const p=id===3?pianoFixture(type,2,1):modulatedPianoFixture(type,'linear');if(id===3)p.modules[0].config.controls=modulatedPianoFixture(type,'sine').modules[0].config.controls;patch.modules=patch.modules.map(n=>n.id===id?{...p.modules[0],id}:n);patch.events=patch.events.filter(e=>e.target!==id).concat(p.events.map(e=>({...e,target:id,owner:id})));}
 globalThis.MessageChannel=MessageChannel;
 const r=await verifyWorker({fixture,contracts,modules:{graph:module}},48000,{patch,seconds:3,options:{blockFrames:512,poolBlocks:12,scheduling:'message'},makeWorker:()=>new BrowserThreadWorker()});
 expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.nonFinite).toBe(0);expect(r.worker.roles[2]).toMatchObject({peakActive:1,steals:2});expect(r.worker.roles[3].peakActive).toBe(3);
},30000);
