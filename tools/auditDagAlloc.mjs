import './reportDirectory.mjs';
// Run after graph:audit-alloc has built the current instrumented Wasm.
import fs from 'node:fs';import {ReferenceGraph} from '../public/modular-audio/runtime.js';
import {sixSourceDag} from '../src/modular-audio/pitchedFixture.js';
const f=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),module=new WebAssembly.Module(fs.readFileSync('.tmp/graph-allocation-target/wasm32-unknown-unknown/release/calmbgm_graph.wasm')),results=[];
for(const rate of [44100,48000,96000]){
 const e=new WebAssembly.Instance(module,{}).exports,p=sixSourceDag(f,rate),g=new ReferenceGraph(e,p,contracts,rate),memory=e.memory.buffer.byteLength;e.graph_alloc_watch(1);
 for(let at=0;at<Math.round(f.totalSeconds*rate);){const n=Math.min(127,Math.round(f.totalSeconds*rate)-at);g.render(n);at+=n;}
 g.enqueue({kind:'note',frame:g.stats().frame,target:1,owner:77,event:0,note:999,a:60,b:.7});g.render(31);g.cancel(77);g.render(127);g.reset();for(const event of p.events)g.enqueue(event);g.render(128);g.pause(true);g.render(128);g.pause(false);g.render(128);
 const calls=e.graph_alloc_count();e.graph_alloc_watch(0);if(calls||e.memory.buffer.byteLength!==memory)throw Error('Pitched DAG allocated/reclaimed/grew after preparation');results.push({fixture:'six-source-pitched-dag',rate,allocationOrReclamationCalls:calls,memoryBytes:memory,grew:false});g.dispose();
}
const previous=JSON.parse(fs.readFileSync('.tmp/modular-audio-allocation-wasm.json')),report={pass:true,graphVersion:JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,scope:'Rust only, prepared six-source DAG render/transitions/live enqueue/owner cancellation/reset/pause/replay, plus previous audits',results:[...previous.results,...results]};fs.writeFileSync('reports/modular_audio/m3d-allocation.json',JSON.stringify(report,null,2)+'\n');console.log(`${report.results.length} allocation audits passed including three pitched DAG rates.`);
