import './reportDirectory.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ownedRackFxSpec} from '../src/modular-audio/ownedRackFx.js';
import {ownedVoiceFxSpec} from '../src/modular-audio/ownedVoiceFx.js';
const wasm=fs.readFileSync('.tmp/graph-fx-adapter-probe/probe.wasm'),module=new WebAssembly.Module(wasm),manifest=JSON.parse(fs.readFileSync('.tmp/graph-fx-adapter-probe/build.json')),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),kinds={crusher:1,pitch:2,zplane:3,shimmer:4,freeze:5},rates=[8000,24000,44100,48000,96000,192000],trials=[],independent=[];
const custom={a:Array.from({length:12},(_,i)=>[70*1.5**i,30+i*110,i%2?-14:9]),b:Array.from({length:12},(_,i)=>[90*1.45**i,80+i*90,i%3?7:-12])};
const specFor=kind=>{
  const s=kind==='crusher'?ownedRackFxSpec(kind,{bits:5.543210987,divide:7.321098765,mix:.6123456789}):kind==='pitch'?ownedRackFxSpec(kind,{semitones:7.32109876,cents:37.0123456,mix:.6312345678}):kind==='zplane'?ownedRackFxSpec(kind,{a:12,b:4,morph:.3712345678,shift:-.23456789,q:.7123456789,mix:.8123456789}):kind==='shimmer'?ownedVoiceFxSpec(kind,{mix:.437891234567,decay:6.123456789,semitones:12.000000001,climb:.45123456789,tone:6900.123456789},109):ownedVoiceFxSpec(kind,{mix:.734561234567,hold:false,length:.253456789,fade:.426789012345},109);
  if(kind==='zplane')s.custom=custom;return s;
};
function create(e,kind,rate,s,direct=false){
  const handle=e.probe_new(kinds[kind],rate,s.seed??109,Number(direct));assert(handle,`${kind} construction failed`);
  for(const [i,value]of s.parameters)assert.equal(e.probe_initial(handle,i,value),1);
  if(kind==='zplane'){
    assert.equal(e.probe_shape_count(handle,s.shapes.length),1);
    for(const [shape,rows]of [...s.shapes.entries(),[64,s.custom.a],[65,s.custom.b]])for(const [section,row]of rows.entries())assert.equal(e.probe_shape_row(handle,shape,section,...row),1);
  }
  assert.equal(e.probe_prepare(handle),1);
  return {handle,input:[],output:[],refresh(){this.input=[0,1].map(ch=>new Float32Array(e.memory.buffer,e.probe_input(handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(e.memory.buffer,e.probe_output(handle,ch),2048));}};
}
const q=(seconds,rate)=>Math.ceil(seconds*rate/128)*128;
function eventsFor(kind,rate){
  if(kind==='crusher')return [[384,0,9.23456789],[1024,1,15.7123456],[2048,2,.33123456789]];
  if(kind==='pitch')return [[384,0,-12.23456789],[1024,2,.2123456789],[2048,1,-13.2123456]];
  if(kind==='zplane')return [[384,0,5],[384,1,12],[1024,2,.7123456789],[2048,4,.3123456789]];
  if(kind==='shimmer')return [[384,0,.3123456789123],[4096,3,.29123456789],[8192,4,5100.123456789]];
  return [[q(.4,rate),1,1],[q(.75,rate),1,0],[q(.95,rate),2,.40123456789],[q(.95,rate),1,1],[q(1.35,rate),1,0],[q(1.55,rate),2,.30123456789],[q(1.55,rate),1,1]];
}
const signal=(at,ch,rate,kind)=>at<rate*(kind==='freeze'?2:.2)?Math.fround(.12*Math.sin(at*(.013+ch*.006))+.03*Math.cos(at*.047+ch)):0;
function render(e,p,kind,rate,total,events,cadence,direct=false){
  const out=[new Float32Array(total),new Float32Array(total)];let event=0,at=0,call=0;
  while(at<total){
    while(event<events.length&&events[event][0]===at){const [,index,value]=events[event++];assert.equal(e.probe_param(p.handle,index,value),1);}
    const next=events[event]?.[0]??total,n=Math.min(cadence[call++%cadence.length],total-at,next-at);assert(n>0);
    for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++)p.input[ch][i]=signal(at+i,ch,rate,kind);
    assert.equal(e.probe_render(p.handle,n),1);
    const offset=at+(direct?128:0);if(offset<total)for(let ch=0;ch<2;ch++)out[ch].set(p.output[ch].subarray(0,Math.min(n,total-offset)),offset);
    at+=n;
  }
  return out;
}
function compare(a,b){let maxAbsoluteError=0,peak=0,nonFinite=0;for(let ch=0;ch<2;ch++)for(let i=0;i<a[ch].length;i++){maxAbsoluteError=Math.max(maxAbsoluteError,Math.abs(a[ch][i]-b[ch][i]));peak=Math.max(peak,Math.abs(a[ch][i]));if(!Number.isFinite(a[ch][i])||!Number.isFinite(b[ch][i]))nonFinite++;}const pcmHash=x=>sha(Buffer.concat(x.map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)))),actualSha256=pcmHash(a),referenceSha256=pcmHash(b);assert.equal(nonFinite,0);assert.equal(maxAbsoluteError,0);assert.equal(actualSha256,referenceSha256);return {maxAbsoluteError,peak,nonFinite,actualSha256,referenceSha256,bitExact:true};}
for(const rate of rates)for(const kind of Object.keys(kinds)){
  const e=new WebAssembly.Instance(module,{}).exports,s=specFor(kind),a=create(e,kind,rate,s),b=create(e,kind,rate,s,true);a.refresh();b.refresh();
  assert.equal(e.probe_kind(a.handle),kinds[kind]);assert.equal(e.probe_stat(a.handle,16),128);assert.equal(e.probe_stat(a.handle,19),1);assert.equal(e.probe_prepare(a.handle),0);assert.equal(e.probe_initial(a.handle,0,s.parameters[0][1]),0);
  for(const [index,value]of s.parameters)assert.equal(e.probe_target(a.handle,index),value);
  assert.equal(e.probe_shape_row(a.handle,64,0,100,100,1),0);
  const memory=e.memory.buffer.byteLength,total=q(kind==='freeze'?2.3:kind==='shimmer'?.9:.35,rate)+128,events=eventsFor(kind,rate).filter(event=>event[0]<total);e.probe_alloc_watch(1);
  try{
    const reference=render(e,b,kind,rate,total,events,[128],true),actual=render(e,a,kind,rate,total,events,[1,37,509,113,203,127,2048]),comparison=compare(actual,reference),nativeStats=Array.from({length:7},(_,i)=>e.probe_stat(a.handle,i));
    for(let i=0;i<7;i++)assert.equal(nativeStats[i],e.probe_stat(b.handle,i));
    assert.equal(e.probe_stat(a.handle,17),0);assert.equal(e.probe_stat(a.handle,18),total);
    const latest=s.parameters.map(([i])=>[i,e.probe_target(a.handle,i)]);for(const [,index,value]of events)assert.equal(e.probe_target(a.handle,index),events.filter(x=>x[1]===index).at(-1)[2]);
    // Fail-closed noncanonical control: neither kernel nor exact ledger changes.
    a.input[0].fill(0,0,13);a.input[1].fill(0,0,13);assert.equal(e.probe_render(a.handle,13),1);assert.equal(e.probe_param(a.handle,0,.123456789),0);assert.deepEqual(s.parameters.map(([i])=>[i,e.probe_target(a.handle,i)]),latest);
    e.probe_reset(a.handle);e.probe_reset(b.handle);assert.equal(e.probe_stat(a.handle,17),0);assert.equal(e.probe_stat(a.handle,18),0);if(kind==='freeze')assert.equal(e.probe_stat(a.handle,6),s.seed);
    assert.deepEqual(s.parameters.map(([i])=>[i,e.probe_target(a.handle,i)]),latest);
    const resetFrames=q(.4,rate)+128,reset=compare(render(e,a,kind,rate,resetFrames,[],[17,101,1,389]),render(e,b,kind,rate,resetFrames,[],[128],true));
    const allocationOrReclamationCalls=e.probe_alloc_count();e.probe_alloc_watch(0);assert.equal(allocationOrReclamationCalls,0);assert.equal(e.memory.buffer.byteLength,memory);
    trials.push({kind,rate,frames:total,comparison,reset,nativeStats,latestTargets:latest,allocationOrReclamationCalls,memoryBytes:memory,memoryGrew:false,arbitrarySplits:[1,37,509,113,203,127,2048],noncanonicalParameterRejected:true,preparedShapeEditsRejected:true});
  }finally{e.probe_alloc_watch(0);e.probe_free(a.handle);e.probe_free(b.handle);}
}
for(const kind of Object.keys(kinds)){
  const rate=48000,e=new WebAssembly.Instance(module,{}).exports,s=specFor(kind),a=create(e,kind,rate,s),b=create(e,kind,rate,s);a.refresh();b.refresh();const frames=q(.4,rate),left=render(e,a,kind,rate,frames,[],[1,37,509]),right=render(e,b,kind,rate,frames,[],[128]);compare(left,right);const frame=e.probe_stat(b.handle,18),rng=e.probe_stat(b.handle,6);e.probe_alloc_watch(1);e.probe_reset(a.handle);assert.equal(e.probe_param(a.handle,0,kind==='crusher'?10:.3),1);assert.equal(e.probe_stat(b.handle,18),frame);assert.equal(e.probe_stat(b.handle,6),rng);assert.equal(e.probe_alloc_count(),0);e.probe_alloc_watch(0);independent.push({kind,rate,sharedMemoryHandles:2,independentReset:true,allocationOrReclamationCalls:0});e.probe_free(a.handle);e.probe_free(b.handle);
}
const report={kind:'graph.fx-adapters.compatibility',version:1,pass:true,privateProbe:manifest,probeSha256:sha(wasm),scope:'Actual owned Rust kernels at fixed128 cadence versus canonical graph helper adapters, with exactly128-frame output shift. These owned kernels have separate original-JS worklet PCM parity evidence. No production graph wiring, physical listening, throughput or realtime deadline claim.',limitations:['Freeze remains worker-only: canonical adaptation does not remove synchronous capture/energy-scan deadline spikes.','Graph V1 built-in/custom ZPlane shape rows are immutable after preparation.','Rack k-rate DSP controls retain native f32 conversion; exact requested f64 targets are retained separately.','Voice message controls and seeded RNG remain f64/xorshift32-v1, respectively.'],comparisons:trials.length,bitExact:trials.length,maxAbsoluteError:0,allocationCases:trials.length,independent,trials};
fs.writeFileSync('reports/modular_audio/graph-fx-adapter-parity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,trials:undefined}));
