// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {pianoFixture} from './pianoFixture';
import {sixSourceDag} from './pitchedFixture';
import {verifyWorker} from './workerVerification';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const make=(p,e=new WebAssembly.Instance(module,{}).exports)=>new ReferenceGraph(e,p,contracts,48000,512);
const render=(g,total,blocks=[512])=>{const out=new Float32Array(total);for(let at=0,k=0;at<total;k++){const n=Math.min(blocks[k%blocks.length],total-at);g.render(n);out.set(g.left.subarray(0,n),at);expect(g.right.subarray(0,n)).toEqual(g.left.subarray(0,n));at+=n;}return out;};
it.each(['felt','electric','grand','felted','upright'])('owns %s playback with block-independent clocks and persisted exact replay',type=>{
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
it('publishes two pianos, core, FM and drums with exact eight-bus serial/worker PCM through the sidechain master',async()=>{
 const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),patch=sixSourceDag(fixture,48000);
 for(const [id,type]of [[3,'felted'],[4,'electric']]){const p=pianoFixture(type,2);patch.modules=patch.modules.map(n=>n.id===id?{...p.modules[0],id}:n);patch.events=patch.events.filter(e=>e.target!==id).concat(p.events.map(e=>({...e,target:id,owner:id})));}
 globalThis.MessageChannel=MessageChannel;
 const r=await verifyWorker({fixture,contracts,modules:{graph:module}},48000,{patch,seconds:3,options:{blockFrames:512,poolBlocks:12,scheduling:'message'},makeWorker:()=>new BrowserThreadWorker()});
 expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.nonFinite).toBe(0);expect(r.worker.roles[2].peakActive).toBe(3);expect(r.worker.roles[3].peakActive).toBe(3);
},30000);
