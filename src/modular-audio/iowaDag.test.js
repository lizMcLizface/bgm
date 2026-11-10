// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {iowaFixture,iowaReferenceMessages} from './iowaFixture';
import {iowaFrame} from './iowaCompiler';
import {iowaMixedFixture} from './iowaMixedFixture';
import {verifyWorker} from './workerVerification';
import {verifyPool} from './poolVerification';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
import {PATCHES} from '../app/engine/iowaModel/patches';
const wasm=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
let Legacy;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={};}};
globalThis.registerProcessor=(name,C)=>{if(name==='iowa-voices')Legacy=C;};
globalThis.currentTime=0;globalThis.sampleRate=48000;
await import('../app/engine/iowaModel/iowa.worklet.js');
const table=id=>JSON.parse(fs.readFileSync(`src/library/iowaTables/${id}.json`));
const make=(p,e=new WebAssembly.Instance(wasm,{}).exports)=>new ReferenceGraph(e,p,contracts,48000,512);
const render=(g,total,cadence=[512])=>{const out=new Float32Array(total);for(let at=0,k=0;at<total;k++){const n=Math.min(cadence[k%cadence.length],total-at);g.render(n);out.set(g.left.subarray(0,n),at);expect(g.right.subarray(0,n)).toEqual(g.left.subarray(0,n));at+=n;}return out;};
it.each(PATCHES)('matches actual legacy Iowa $id DSP on the canonical tick',patch=>{
 globalThis.currentTime=0;const f=iowaFixture(table(patch.uses??patch.id),patch.id),e=new WebAssembly.Instance(wasm,{}).exports,g=new ReferenceGraph(e,f.patch,contracts,48000,512),old=new Legacy({processorOptions:{messages:iowaReferenceMessages(f)}});let max=0,peak=0;
 try{for(let at=0;at<48000*3;at+=128){globalThis.currentTime=at/48000;const expected=new Float32Array(128);old.process([],[[expected]]);g.render(128);for(let i=0;i<128;i++){max=Math.max(max,Math.abs(expected[i]-g.left[i]));peak=Math.max(peak,Math.abs(g.left[i]));if(!Number.isFinite(g.left[i]))throw Error('Non-finite Iowa sample');}}expect(max).toBeLessThan(1e-6);expect(peak).toBeGreaterThan(0);expect(g.stats()).toMatchObject({late:0,overflow:0});}finally{g.dispose();}
},30000);
it.each(['flute','guitar','marimba-roll'])('replays %s save/reset across irregular graph splits without changing its legacy voice tick',id=>{
 const patch=PATCHES.find(p=>p.id===id),f=iowaFixture(table(patch.uses??id),id),a=make(f.patch),b=make(loadPatch(savePatch(f.patch,contracts),contracts));try{const pcm=render(a,60000),other=render(b,60000,[1,37,203,127,11]);expect(other).toEqual(pcm);a.reset();for(const e of f.patch.events)a.enqueue(e);expect(render(a,60000,[113])).toEqual(pcm);}finally{a.dispose();b.dispose();}
});
it.each(['flute','guitar','marimba-roll'])('matches native %s prepared tuning and held-note slide behavior',id=>{
 globalThis.currentTime=0;const patch=PATCHES.find(p=>p.id===id),f=iowaFixture(table(patch.uses??id),id,{tune:37});f.patch.modules[0].config.notes.forEach(n=>n.slide={cents:-137,seconds:.2});const g=make(f.patch),old=new Legacy({processorOptions:{messages:iowaReferenceMessages(f)}});let max=0;try{for(let at=0;at<48000*2;at+=128){globalThis.currentTime=at/48000;const expected=new Float32Array(128);old.process([],[[expected]]);g.render(128);for(let i=0;i<128;i++)max=Math.max(max,Math.abs(expected[i]-g.left[i]));}expect(max).toBeLessThan(1e-6);}finally{g.dispose();}
});
it('owns two handles in one memory, pauses a partial tick, and cancels one owner without changing the other instance',()=>{
 const p=iowaFixture(table('flute'),'flute').patch;p.events=p.events.map(e=>({...e,owner:e.note===1?1:2}));const e=new WebAssembly.Instance(wasm,{}).exports,a=make(p,e),b=make(p,e);a.refresh();b.refresh();try{expect(render(a,24017,[127])).toEqual(render(b,24017,[37]));a.pause(true);expect(render(a,511).every(v=>v===0)).toBe(true);expect(a.stats().frame).toBe(24017);a.pause(false);expect(render(a,257)).toEqual(render(b,257));a.cancel(1);expect(a.pitchedStats(1).active).toBe(1);expect(b.pitchedStats(1).active).toBe(2);expect(render(a,1024)).not.toEqual(render(b,1024));const frame=b.stats().frame;a.reset();expect(b.stats().frame).toBe(frame);}finally{a.dispose();b.dispose();}
});
it('preserves 32-voice FIFO stealing and release of a very short note inside the same legacy tick',()=>{
 globalThis.currentTime=0;const notes=Array.from({length:34},(_,i)=>({midi:60,time:.125+i/48000,duration:i===33?.0001:.6,velocity:.4})),f=iowaFixture(table('flute'),'flute',{notes}),g=make(f.patch),old=new Legacy({processorOptions:{messages:iowaReferenceMessages(f)}});let max=0;try{for(let at=0;at<48000;at+=128){globalThis.currentTime=at/48000;const expected=new Float32Array(128);old.process([],[[expected]]);g.render(128);for(let i=0;i<128;i++)max=Math.max(max,Math.abs(expected[i]-g.left[i]));}expect(max).toBeLessThan(1e-5);expect(g.pitchedStats(1)).toMatchObject({steals:2,peakActive:32});}finally{g.dispose();}
});
it('quantizes strict native block-end times, validates schema/clock/ownership, and rounds late notes up to the next tick',()=>{
 for(const rate of [44100,48000,96000])for(const q of [1,7,53,257]){const time=q*128/rate;let first=0;while(time>=first*128/rate+128/rate)first++;expect(iowaFrame(time,rate)).toBe(first*128);}
 const p=iowaFixture(table('flute'),'flute').patch;for(const edit of [p=>p.modules[0].config.quantumFrames=64,p=>p.events[0].frame++,p=>p.events[0].a++,p=>p.events.push({...p.events[0]}),p=>p.modules[0].config.banks[0].tables[0].pop(),p=>p.modules[0].config.notes[0].gain=Infinity,p=>p.modules[0].config.banks[0].noise=[1,2,3],p=>p.events[1].owner=9]){const invalid=structuredClone(p);edit(invalid);expect(()=>validatePatch(invalid,contracts)).toThrow();}
 const g=make(p);try{render(g,37);expect(()=>g.enqueue({...p.events[0],frame:0})).not.toThrow();render(g,91);expect(g.pitchedStats(1).active).toBe(0);render(g,1);expect(g.pitchedStats(1).active).toBe(1);expect(g.stats().late).toBe(1);}finally{g.dispose();}
});
it('publishes Iowa held/roll, measured piano, core/FM/drums and sidechain master exactly through one and three workers',async()=>{
 const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),patch=iowaMixedFixture(fixture,table('flute'),table('marimba')),assets={fixture,contracts,modules:{graph:wasm}};globalThis.MessageChannel=MessageChannel;
 for(const verify of [verifyWorker,verifyPool]){const r=await verify(assets,48000,{patch,seconds:2,options:{blockFrames:512,poolBlocks:12,scheduling:'message'},makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.nonFinite).toBe(0);}
},60000);
