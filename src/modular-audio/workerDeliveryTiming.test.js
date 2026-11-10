// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
import {expect,it} from 'vitest';
import {WorkerDeliveryTiming,packetProducerSnapshot} from './workerDeliveryTiming';

it('separates task readiness, pool-empty waits and slot round trips on one worker clock',()=>{
 let time=0;const d=new WorkerDeliveryTiming(2,{now:()=>time});
 d.requestTask(0);time=3;d.requestTask(0);time=5;d.beginTask();d.published(0,true,1);
 d.requestTask(0);time=7;d.beginTask();d.published(1,true,0);
 time=20;expect(d.snapshot()).toMatchObject({taskWaits:2,taskWaitMs:2,taskWaitMaxMs:5,poolEmptyAgeMs:13});
 time=30;d.recycled(0,255);d.requestTask(0);time=37;
 expect(d.snapshot()).toMatchObject({poolWaits:1,poolWaitMs:23,poolWaitMaxMs:23,recycleRttMs:25,lastRecycleConsumerFrame:255,readyTaskAgeMs:7,poolEmptyAgeMs:null});
 d.beginTask();expect(d.snapshot()).toMatchObject({taskWaits:3,taskWaitMs:7,taskWaitMaxMs:7});
 d.published(0,false,0);time=50;expect(d.snapshot().poolEmptyAgeMs).toBeNull(); // final drain is not producer starvation
});
it('does not count intentional stall waits and marks unavailable clocks instead of claiming zero time',()=>{
 let time=0;const d=new WorkerDeliveryTiming(2,{now:()=>time});d.requestTask(0);time=10;d.beginTask(true);d.requestTask(100);time=110;d.beginTask();expect(d.snapshot().taskWaits).toBe(0);
 const missing=new WorkerDeliveryTiming(2,{});missing.requestTask(0);missing.beginTask();missing.published(0,true,0);missing.recycled(0,255);expect(missing.snapshot()).toMatchObject({available:false,elapsedMs:null,taskWaitMs:null,recycleRttMs:null,poolEmptyAgeMs:null});
});
it('bounds optional producer metadata and preserves missing timing as unknown',()=>{
 expect(packetProducerSnapshot(null)).toBeNull();expect(packetProducerSnapshot({version:9})).toBeNull();
 const p=packetProducerSnapshot({version:1,available:false,frame:512,taskWaitMs:NaN,poolWaitMs:-1,recycleRttMs:Infinity,freeBuffers:{bad:true},payload:Array(10000).fill('x')});
 expect(p).toMatchObject({available:false,frame:512,taskWaitMs:null,poolWaitMs:null,recycleRttMs:null,freeBuffers:null});expect(p.payload).toBeUndefined();
});
it('observes real producer task/recycle branches without changing their bounded scheduling',()=>{
 let time=0;const pending=[],packets=[],messages=[];
 class FakeChannel{constructor(){this.port1={close(){}};this.port2={postMessage:()=>pending.push(()=>this.port1.onmessage()),close(){}};}}
 class FakeGraph{constructor(){this.outputs=new Map([[1,new Float32Array(1024)]]);this.kicks=new Map();this.frame=0;this.engine={memory:{buffer:new ArrayBuffer(65536)}};}render(n){this.frame+=n;}stats(){return {frame:this.frame};}meters(){return {};}pitchedStats(){return {};}dispose(){}}
 const ctx=vm.createContext({ReferenceGraph:FakeGraph,WebAssembly:{Instance:class{constructor(){this.exports={};}}},performance:{now:()=>time},Float32Array,Float64Array,Uint32Array,ArrayBuffer,Array,Math,Number,Object,Error,MessageChannel:FakeChannel,setTimeout:fn=>pending.push(fn),clearTimeout(){},postMessage:d=>messages.push(d),close(){}});
 vm.runInContext(fs.readFileSync('public/modular-audio/graph-worker.js','utf8').replace(/^import[^;]+;\s*$/gm,''),ctx);
 const port={postMessage:d=>packets.push(d),close(){}};ctx.onmessage({data:{type:'init',deliveryDiagnostics:true,sourceIds:[1],module:{},patch:{},contracts:{},rate:48000,endFrame:4096,options:{blockFrames:512,poolBlocks:6,scheduling:'message'},port}});
 for(let i=0;i<6;i++){time+=5;expect(pending).toHaveLength(1);pending.shift()();}
 expect(pending).toHaveLength(0);expect(packets).toHaveLength(6);expect(packets[5].producer).toMatchObject({frame:3072,blocks:6,freeBuffers:0,inFlightBuffers:6,taskWaits:6,taskWaitMaxMs:5});
 const lastAccepted=structuredClone(packets[5].producer);time=60;port.onmessage({data:{type:'recycle',generation:1,slot:packets[0].slot,buffer:packets[0].buffer,consumerFrame:511}});
 time=65;ctx.onmessage({data:{type:'stats',generation:1,request:1}});expect(messages.at(-1).deliveryTiming).toMatchObject({poolWaitMs:30,recycleRttMs:55,readyTaskAgeMs:5,lastRecycleConsumerFrame:511});
 time=70;pending.shift()();expect(packets[6].producer).toMatchObject({frame:3584,taskWaitMs:10,poolWaitMs:30});expect(packets[5].producer).toEqual(lastAccepted);
 ctx.onmessage({data:{type:'dispose'}});
});
