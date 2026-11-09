// Runs the counting allocator in Wasm; never executes a generated native binary.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {OwnedFm} from '../public/modular-audio/owned-fm.js';
import {OwnedCore} from '../public/modular-audio/owned-core.js';
import {ReferenceGraph} from '../public/modular-audio/runtime.js';
const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
const run=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--offline','--release','--target','wasm32-unknown-unknown','--manifest-path','synth-engine/graph/Cargo.toml','--features','allocation-audit','--target-dir','.tmp/graph-allocation-target'],{env,stdio:'inherit'});if(run.error)throw run.error;if(run.status)process.exit(run.status);
const module=new WebAssembly.Module(fs.readFileSync('.tmp/graph-allocation-target/wasm32-unknown-unknown/release/calmbgm_graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),results=[];
for(const fixture of ['reference-patch.json','sidechain-patch.json'])for(const rate of [44100,48000,96000]){
 const e=new WebAssembly.Instance(module,{}).exports,p=JSON.parse(fs.readFileSync('public/modular-audio/'+fixture)),g=new ReferenceGraph(e,p,contracts,rate),memory=e.memory.buffer.byteLength;
 e.graph_alloc_watch(1);
 for(let at=0;at<48000;){const n=Math.min(113,48000-at);g.render(n);at+=n;}
 g.enqueue({frame:48000,target:11,owner:1,kind:'gate',value:false});if(fixture==='sidechain-patch.json')g.enqueue({...p.events.find(e=>e.kind==='hit'),frame:48000});g.render(1);g.cancel(2);g.reset();g.render(127);
 const count=e.graph_alloc_count();e.graph_alloc_watch(0);const after=e.memory.buffer.byteLength;g.dispose();
 if(count!==0||after!==memory)throw Error(`${fixture}/${rate}: ${count} allocation/reclamation operations; memory ${memory} -> ${after}`);
 results.push({fixture,rate,allocationOrReclamationCalls:count,memoryBytes:memory,grew:false});
}
for(const rate of [44100,48000,96000]){
 const p={version:1,modules:[{id:201,type:'host.audio',version:1,parameters:{}},{id:202,type:'host.audio',version:1,parameters:{}},{id:203,type:'graph.compressor',version:1,parameters:{}},{id:204,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:201,port:'audio.out'},to:{module:203,port:'program.in'}},{id:2,kind:'audio',from:{module:202,port:'audio.out'},to:{module:203,port:'detector.in'}},{id:3,kind:'audio',from:{module:203,port:'audio.out'},to:{module:204,port:'program.in'}}],events:[]};
 const e=new WebAssembly.Instance(module,{}).exports,g=new ReferenceGraph(e,p,contracts,rate),memory=e.memory.buffer.byteLength,program=g.inputs.get(201),key=g.inputs.get(202);e.graph_alloc_watch(1);
 g.enqueue({frame:1003,target:203,owner:1,kind:'connection',edge:2,value:false});g.enqueue({frame:2017,target:203,owner:1,kind:'connection',edge:2,value:true});
 for(let at=0;at<48000;){const n=Math.min(127,48000-at);for(let i=0;i<n;i++){program[i*2]=.2;program[i*2+1]=-.1;key[i*2]=1;key[i*2+1]=-1;}g.render(n);at+=n;}g.reset();g.render(128);
 const count=e.graph_alloc_count();e.graph_alloc_watch(0);if(count||e.memory.buffer.byteLength!==memory)throw Error('Host input processing allocated/grew');g.dispose();results.push({fixture:'external-program-key-host',rate,allocationOrReclamationCalls:count,memoryBytes:memory,grew:false});
}
for(const rate of [44100,48000,96000]){
 const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),e=new WebAssembly.Instance(module,{}).exports;
 const dsps=fixture.parts.filter(p=>p.kind==='fm').map(p=>{const at=t=>Math.round((fixture.preroll+t/fixture.ppq*60/fixture.bpm)*rate);return new OwnedFm(e,{version:1,patch:p.packet,performance:p.performance,edits:[],events:[...p.notes.flatMap(n=>[[0,n.id,at(n.tick),n.midi,n.velocity],[1,n.id,at(n.tick+n.length),0,0]]),...p.controls.map(c=>[c.kind,0,at(c.tick),c.value,0])]},rate);});
 dsps.forEach(d=>d.refresh());const memory=e.memory.buffer.byteLength;e.graph_alloc_watch(1);
 for(let at=0;at<48000;at+=127)for(const d of dsps)d.render(Math.min(127,48000-at));
 for(const d of dsps){e.fm_owned_event(d.handle,0,999,48000,60,.7);d.render(1);d.panic();d.reset();d.render(128);}
 const count=e.graph_alloc_count();e.graph_alloc_watch(0);if(count||e.memory.buffer.byteLength!==memory)throw Error('Owned FM processing allocated/grew');dsps.forEach(d=>d.dispose());results.push({fixture:'two-owned-fm-handles',rate,allocationOrReclamationCalls:count,memoryBytes:memory,grew:false});
}
for(const mixed of [false,true])for(const rate of [44100,48000,96000]){
 const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),e=new WebAssembly.Instance(module,{}).exports,at=t=>Math.round((fixture.preroll+t/fixture.ppq*60/fixture.bpm)*rate);
 const dsps=fixture.parts.filter(p=>p.kind==='core'||mixed&&p.kind==='fm').map(p=>new (p.kind==='core'?OwnedCore:OwnedFm)(e,{version:1,patch:p.packet,performance:p.performance,edits:p.edits.map(edit=>({patch:edit.packet,performance:p.performance,frame:at(edit.tick),seconds:edit.seconds})),events:[...p.notes.flatMap(n=>[[0,n.id,at(n.tick),n.midi,n.velocity],[1,n.id,at(n.tick+n.length),0,0]]),...p.controls.map(c=>[c.kind,0,at(c.tick),c.value,0])]},rate));
 let g;
 if(mixed){const drums=fixture.parts.find(p=>p.kind==='percussion');g=new ReferenceGraph(e,{version:1,modules:[{id:101,type:'legacy.percussion',version:1,parameters:{}},{id:102,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:101,port:'audio.out'},to:{module:102,port:'program.in'}}],events:drums.hits.map(h=>({frame:at(h.tick),target:101,owner:6,kind:'hit',drum:h.drum,velocity:h.velocity,duration:h.duration,vary:h.vary,tone:h.tone,decay:h.decay,hit:h.id,model:h.model}))},contracts,rate);}
 dsps.forEach(d=>d.refresh());g?.refresh();const memory=e.memory.buffer.byteLength;e.graph_alloc_watch(1);
 for(let pos=0;pos<Math.round(fixture.totalSeconds*rate);){const n=Math.min(127,Math.round(fixture.totalSeconds*rate)-pos);for(const d of dsps)d.render(n);g?.render(n);pos+=n;}
 for(const d of dsps){d.panic();d.reset();d.render(128);}g?.cancel(6);g?.reset();g?.render(128);
 const count=e.graph_alloc_count();e.graph_alloc_watch(0);if(count||e.memory.buffer.byteLength!==memory)throw Error('Owned core/six-source processing allocated/grew');dsps.forEach(d=>d.dispose());g?.dispose();results.push({fixture:mixed?'six-owned-sources-one-wasm':'three-owned-core-handles',rate,allocationOrReclamationCalls:count,memoryBytes:memory,grew:false});
}
fs.writeFileSync('.tmp/modular-audio-allocation-wasm.json',JSON.stringify({pass:true,scope:'Rust enqueue/render/cancel/reset after preparation, including external host I/O, owned FM/core and six owned sources sharing Wasm; Wasm counting allocator, not native runner',results},null,2)+'\n');console.log(`${results.length} Wasm allocation audits passed: zero allocation/reclamation calls or memory growth.`);
