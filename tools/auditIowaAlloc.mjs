import './reportDirectory.mjs';
// Run graph:audit-alloc first; all allocations below are watched only after prepare.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ReferenceGraph} from '../src/modular-audio/runtime';
import {iowaFixture} from '../src/modular-audio/iowaFixture';
const module=new WebAssembly.Module(fs.readFileSync('.tmp/graph-allocation-target/wasm32-unknown-unknown/release/calmbgm_graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),results=[];
for(const id of ['flute','guitar','marimba-roll'])for(const rate of [44100,48000,96000]){
 const table=JSON.parse(fs.readFileSync(`src/library/iowaTables/${id==='marimba-roll'?'marimba':id}.json`)),p=iowaFixture(table,id,{rate,notes:Array.from({length:34},(_,i)=>({midi:60,time:.125+i/rate,duration:.5,velocity:.4}))}).patch,e=new WebAssembly.Instance(module,{}).exports,a=new ReferenceGraph(e,p,contracts,rate,512),b=new ReferenceGraph(e,p,contracts,rate,512);a.refresh();b.refresh();const memory=e.memory.buffer.byteLength;e.graph_alloc_watch(1);
 for(let frame=0;frame<rate*2;frame+=113){a.render(113);b.render(113);}
 a.reset();for(const event of p.events)a.enqueue(event);a.render(511);a.pause(true);a.render(37);a.pause(false);a.render(1);a.cancel(1);a.render(127);b.cancel(1);b.reset();b.render(128);
 const calls=e.graph_alloc_count();e.graph_alloc_watch(0);assert.equal(calls,0);assert.equal(e.memory.buffer.byteLength,memory);results.push({id,rate,allocationOrReclamationCalls:calls,memoryBytes:memory,grew:false,handles:2});a.dispose();b.dispose();
}
const report={kind:'iowa.owned-dsp-allocation',version:1,engineVersion:JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,pass:true,scope:'Wasm counting allocator; two handles share memory; prepared held/decay/roll rendering, 32-voice stealing, release, enqueue, reset, owner cancellation and partial-tick pause; no native runner.',results};fs.writeFileSync('reports/modular_audio/iowa-owned-allocation.json',JSON.stringify(report,null,2)+'\n');console.log(`${results.length} Iowa allocation audits passed: zero allocations, frees or memory growth.`);
