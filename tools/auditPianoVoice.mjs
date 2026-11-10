// Run after graph:audit-alloc builds the instrumented Wasm. Never runs native binaries.
import fs from 'node:fs';
import {ReferenceGraph,savePatch,loadPatch} from '../src/modular-audio/runtime.js';
import {pianoFixture} from '../src/modular-audio/pianoFixture.js';
const module=new WebAssembly.Module(fs.readFileSync('.tmp/graph-allocation-target/wasm32-unknown-unknown/release/calmbgm_graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),results=[];
for(const type of ['felt','electric','grand','felted','upright']){
 const e=new WebAssembly.Instance(module,{}).exports,p=pianoFixture(type,2),saved=savePatch(p,contracts),a=new ReferenceGraph(e,p,contracts,48000,512),b=new ReferenceGraph(e,loadPatch(saved,contracts),contracts,48000,512);a.refresh();b.refresh();
 const memory=e.memory.buffer.byteLength;let exact=true,peak=0;e.graph_alloc_watch(1);
 for(let at=0;at<60000;){const n=Math.min(127,60000-at);a.render(n);b.render(n);for(let i=0;i<n;i++){exact&&=a.left[i]===b.left[i];peak=Math.max(peak,Math.abs(a.left[i]));}at+=n;}
 a.reset();for(const event of p.events)a.enqueue(event);a.render(512);a.cancel(1);a.render(127);a.pause(true);a.render(128);a.pause(false);a.render(128);
 const calls=e.graph_alloc_count();e.graph_alloc_watch(0);if(calls||e.memory.buffer.byteLength!==memory||!exact||peak===0)throw Error('Piano owned-state/allocation audit failed');
 results.push({type,sampleRate:48000,frames:60000,peak,saveReloadExact:exact,independentHandles:2,allocationOrReclamationCalls:calls,memoryBytes:memory,grew:false});a.dispose();b.dispose();
}
const report={kind:'piano.owned-voice-allocation',version:1,pass:true,graphVersion:JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,scope:'Prepared finite Rust piano render, independent handles, save/reload, reset, enqueue, owner cancellation and pause. Excludes preparation and host JS/browser deadlines.',results};fs.writeFileSync('reports/modular_audio/piano-owned-voice-allocation.json',JSON.stringify(report,null,2)+'\n');console.log('Five piano variants: exact save/reload, independent handles, zero render allocations/reclamations or memory growth.');
