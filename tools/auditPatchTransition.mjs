import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {RustPatchTransition} from '../src/modular-audio/rustPatchTransition.js';
const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};
env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
const target='.tmp/patch-transition-audit-target',result=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--release','--offline','--target','wasm32-unknown-unknown','--features','allocation-audit','--manifest-path','synth-engine/graph/Cargo.toml','--target-dir',target],{env,stdio:'inherit'});
if(result.error)throw result.error;if(result.status)process.exit(result.status);
const module=new WebAssembly.Module(fs.readFileSync(`${target}/wasm32-unknown-unknown/release/calmbgm_graph.wasm`)),cases=[];
for(const fm of [false,true])for(const rate of [8000,44100,48000,88200,96000,192000]){
 const e=new WebAssembly.Instance(module,{}).exports,home={mode:0,portamento:0,glide:'overlap'},rows=fm?[...Array.from({length:60},(_,i)=>[0,i,i+1]),...Array.from({length:8},(_,op)=>Array.from({length:22},(_,i)=>[1,op*32+i,i+1])).flat(),...Array.from({length:64},(_,i)=>[2,i,i/8<i%8?.2:0]),...Array.from({length:8},(_,i)=>[3,i,.2])]:[...Array.from({length:12},(_,i)=>[0,i,i+1]),...Array.from({length:2},(_,s)=>Array.from({length:116},(_,i)=>[s+1,i,i+1])).flat()];
 const changed=rows.map(([s,i,v])=>[s,i,v*.5]),unit=new RustPatchTransition(e,rows,home,()=>{},()=>{},fm,rate),left=new Float32Array(2048),right=new Float32Array(2048),input=Float32Array.from({length:2048},(_,i)=>Math.sin(i*.1)*.3),bytes=e.memory.buffer.byteLength;
 try{e.graph_alloc_watch(1);for(let batch=0;batch<3;batch++){for(let j=0;j<32;j++)unit.schedule(batch%2?rows:changed,home,batch*12000+j*137,j%3===0?0:.016);for(let frame=batch*12000;frame<(batch+1)*12000;){unit.tick(frame);const n=unit.span(frame,Math.min(128,(batch+1)*12000-frame));unit.mix(input,input,left,right,0,n,frame);frame+=n;}unit.clear();}const operations=e.graph_alloc_count(),after=e.memory.buffer.byteLength;e.graph_alloc_watch(0);if(operations!==0||after!==bytes)throw Error(`Transition allocation/growth ${fm}/${rate}: ${operations}/${after-bytes}`);cases.push({kind:fm?'fm':'core',rate,rows:rows.length,scheduledPackets:96,allocationsOrFrees:operations,memoryGrowthBytes:after-bytes});}finally{e.graph_alloc_watch(0);unit.dispose();}
}
fs.mkdirSync('reports/modular_audio',{recursive:true});fs.writeFileSync('reports/modular_audio/patch-transition-allocation.json',JSON.stringify({kind:'rust.patch-transition.allocation',cases,pass:true},null,2)+'\n');console.log(`Rust transition allocation audit passed ${cases.length} cases.`);
