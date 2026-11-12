// Actual bank host/worklet/worker fixture adapted from the accepted protocol tests.
// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';import{vi}from'vitest';

import{OwnedAmbienceBank}from'./ownedAmbienceBank.js';import{HostRenderClock}from'./hostRenderClock.js';import{prepareAmbienceBankPool}from'./ambienceBankNode.js';import{OwnedAmbienceLoop,validateAmbienceLoopSpec,loadAmbienceLoopSpec,saveAmbienceLoopSpec,ambienceLoopSpec}from'./ownedAmbienceLoops.js';import{OwnedAmbiencePlayback}from'./ownedAmbiencePlayback.js';
const module=new WebAssembly.Module(fs.readFileSync('public/ambience-bank/pool.wasm')),loopModule=new WebAssembly.Module(fs.readFileSync('public/ambience-loops/loops.wasm')),loopManifest=JSON.parse(fs.readFileSync('public/ambience-loops/build.json','utf8')),assets={module,manifest:{version:'protocol-fixture'},loops:{module:loopModule,manifest:loopManifest}},reference=new WebAssembly.Module(fs.readFileSync('public/ambience-playback/reader.wasm'));
function context(){const listeners=new Set(),c={state:'suspended',currentTime:0,sampleRate:8000,audioWorklet:{addModule:vi.fn(async()=>{})},resume:vi.fn(async()=>{c.state='running';for(const fn of listeners)fn();}),suspend:vi.fn(async()=>{c.state='suspended';for(const fn of listeners)fn();}),addEventListener:(_name,fn)=>listeners.add(fn),removeEventListener:(_name,fn)=>listeners.delete(fn)};return c;}
class Node{
 constructor(c,_name,options){this.c=c;const initial=[],s={sampleRate:c.sampleRate,currentFrame:Math.round(c.currentTime*c.sampleRate),OwnedAmbienceBank,HostRenderClock,Float32Array,Uint32Array,Uint8Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>initial.push(d)};}},registerProcessor:(_,C)=>s.C=C};vm.runInNewContext(fs.readFileSync('src/modular-audio/ambienceBank.worklet.js','utf8').replace(/^import[^\n]*\n/gm,''),s);this.s=s;this.processor=new s.C(options);this.parameters=new Map(Array.from({length:16},(_,i)=>{const p={value:0,setValueAtTime:vi.fn(v=>p.value=v)};return['demand'+i,p];}));this.port={onmessage:null,postMessage:(d,transfer=[])=>this.processor.message(structuredClone(d,{transfer})),close:vi.fn()};this.processor.port.postMessage=d=>queueMicrotask(()=>this.port.onmessage?.({data:structuredClone(d)}));initial.forEach(d=>queueMicrotask(()=>this.port.onmessage?.({data:structuredClone(d)})));this.connect=vi.fn();this.disconnect=vi.fn();}
 render(frame){this.s.currentFrame=frame;const output=Array.from({length:16},()=>[new Float32Array(128),new Float32Array(128)]),params=Object.fromEntries([...this.parameters].map(([key,p])=>[key,Float32Array.of(p.value)]));this.result=this.processor.process([],output,params);this.c.currentTime=(frame+128)/this.c.sampleRate;return output;}
}
class Worker{
 constructor(){this.terminated=false;const self={},s={self,OwnedAmbienceLoop,validateAmbienceLoopSpec,loadAmbienceLoopSpec,saveAmbienceLoopSpec,Float32Array,Uint8Array,TextEncoder,WebAssembly,performance,crypto,postMessage:d=>queueMicrotask(()=>{if(!this.terminated)this.onmessage?.({data:structuredClone(d)});}),close:()=>this.terminated=true};vm.runInNewContext(fs.readFileSync('src/modular-audio/ambienceBank.worker.js','utf8').replace(/^import[^\n]*\n/gm,''),s);this.s=s;}
 postMessage(d,transfer=[]){const data=structuredClone(d,{transfer});if(data.kind==='init')this.port=data.port;queueMicrotask(()=>{if(!this.terminated)this.s.self.onmessage({data});});}
 terminate(){this.terminated=true;this.port?.close();}
}
const make=c=>prepareAmbienceBankPool(c,{load:async()=>assets,Node,WorkerClass:Worker,Channel:MessageChannel}),tick=()=>new Promise(resolve=>setImmediate(resolve)),bits=a=>Array.from(new Uint32Array(a.buffer,a.byteOffset,a.length));
async function completed(promise,step,max=3000){let done=false,result,error;promise.then(v=>{done=true;result=v;},e=>{done=true;error=e;});for(let i=0;!done&&i<max;i++){step?.();await tick();}if(!done)throw Error('Protocol did not finish within bounded test steps');if(error)throw error;return result;}

export const prepareAmbienceBankFixture=make;

export const bankPlaybackReferenceModule=reference;
export const prepareOriginalFixtureLoop=(kind,rate)=>new OwnedAmbienceLoop(new WebAssembly.Instance(loopModule,{}).exports,ambienceLoopSpec(kind,rate));
