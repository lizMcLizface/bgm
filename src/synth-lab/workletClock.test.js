// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';import {initialPatch,parameterTriples} from './patch';import {initialFM,fmPacket} from './fmPatch';
function make(kind,offline=false){let Type;const scope={sampleRate:48000,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:()=>{},close:()=>{}};}},WebAssembly,registerProcessor:(_,c)=>Type=c};const file=kind==='core'?'processor.js':kind==='bank'?'fm-bank-processor.js':'fm-processor.js';vm.runInNewContext(fs.readFileSync('public/synth-lab/patch-transition.js','utf8').replace(/export /g,'')+';'+fs.readFileSync('public/synth-lab/'+file,'utf8').replace(/^import .*$/gm,''),scope);const m=new WebAssembly.Module(fs.readFileSync('public/synth-lab/'+(kind==='bank'?'fm-bank':kind)+'.wasm'));const p=new Type({processorOptions:{module:m,offline,parameters:parameterTriples(initialPatch()),patch:fmPacket(initialFM())}});if(kind==='bank')p.message({type:'add',slot:0,token:1,patch:fmPacket(initialFM()),events:[]});const outputs=Array.from({length:kind==='bank'?4:1},()=>[new Float32Array(128),new Float32Array(128)]);return {p,scope,outputs,step:()=>p.process([],outputs),event:values=>kind==='bank'?p.message({type:'events',slot:0,token:1,values}):p.port.onmessage({data:{type:'events',values}}),active:()=>kind==='core'?p.engine.engine_stat(0):kind==='bank'?p.fm.bank_stat(0,0):p.fm.fm_stat(0)};}
it.each(['core','fm','bank'])('%s recovers note scheduling after skipped realtime callbacks',kind=>{const a=make(kind);a.step();a.scope.currentFrame=48000;a.event([[0,1,48000,60,.7]]);a.step();expect(a.p.clock).toBe(48128);expect(a.p.resyncs).toBe(1);expect(a.p.skippedFrames).toBe(48000-128);expect(a.active()).toBeGreaterThan(0);a.scope.currentFrame=48128;a.step();expect(a.p.resyncs).toBe(1);});
it.each(['core','fm','bank'])('%s offline clocks ignore the browser realtime frame',kind=>{const a=make(kind,true);a.scope.currentFrame=48000;a.step();expect(a.p.clock).toBe(128);expect(a.p.resyncs).toBe(0);});

it.each(['core','fm','bank'])('%s never rewinds scheduled notes when the browser stamp repeats',kind=>{
 const a=make(kind);
 a.event([[0,1,0,60,.7],[1,1,1280,0,0],[0,2,1536,67,.6]]);
 for(let i=0;i<32;i++){
  // Captured Chrome shape: repeated stamp, then a catch-up to the real frame.
  a.scope.currentFrame=(i>=10&&i<=13?9:i)*128;
  a.step();
  expect(a.p.clock).toBe((i+1)*128);
  expect(kind==='core'?a.p.engine.engine_stat(4):kind==='bank'?a.p.fm.bank_stat(0,4):a.p.fm.fm_stat(4)).toBe(a.p.clock);
 }
 expect(a.p.resyncs).toBe(0);
 expect(a.p.skippedFrames).toBe(0);
 // A genuine forward gap still recovers after a run of repeated stamps.
 a.scope.currentFrame=48000;a.step();
 expect(a.p.clock).toBe(48128);
 expect(a.p.resyncs).toBe(1);
 expect(a.p.skippedFrames).toBe(48000-32*128);
});

it.each(['core','fm','bank'])('%s repeated timestamps preserve uninterrupted PCM and event timing',kind=>{
 const reference=make(kind),repeated=make(kind);let peak=0;
 for(const a of [reference,repeated])a.event([[0,1,0,60,.7],[1,1,1280,0,0],[0,2,1536,67,.6]]);
 for(let i=0;i<40;i++){
  reference.scope.currentFrame=i*128;
  repeated.scope.currentFrame=(i>=10&&i<=13?9:i)*128;
  reference.step();repeated.step();
  for(let slot=0;slot<reference.outputs.length;slot++)for(let c=0;c<2;c++){
   expect(Array.from(repeated.outputs[slot][c])).toEqual(Array.from(reference.outputs[slot][c]));
   for(const v of reference.outputs[slot][c])peak=Math.max(peak,Math.abs(v));
  }
 }
 expect(peak).toBeGreaterThan(0);
});
