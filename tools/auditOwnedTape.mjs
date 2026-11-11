import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {OwnedTape,ownedTapeSpec,saveOwnedTapeSpec,loadOwnedTapeSpec}from '../src/modular-audio/ownedTape.js';
import {OwnedTapeShaper,tapeShaperSpec}from '../src/modular-audio/ownedTapeShaper.js';
const manifest=JSON.parse(fs.readFileSync('.tmp/owned-tape/build.json'));
const module=new WebAssembly.Module(fs.readFileSync('.tmp/owned-tape/tape-fx.wasm'));
const oldModule=new WebAssembly.Module(fs.readFileSync('.tmp/tape-primitive-proven/tape-fx.wasm'));
const oldManifest=JSON.parse(fs.readFileSync('.tmp/tape-primitive-proven/build.json'));
const sha=pcm=>crypto.createHash('sha256').update(Buffer.concat(pcm.map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)))).digest('hex');
const spec=ownedTapeSpec({wow:.73123456789,wowRate:1.123456789,flutter:.6123456789,drive:.4123456789,tone:6100.123456789},[.4123456789,.3,1,0]);
const events=[[13,0,.7123456789],[41,1,2.123456789],[513,2,.8123456789],[4001,4,3000.123456789],[4096,3,.3],[8191,0,0],[8192,3,1],[10003,2,0],[12001,1,.05],[12288,3,0]];
const signal=(frame,ch)=>Math.fround(.25*Math.sin(frame*(.071+ch*.003))+.07*Math.cos(frame*.317+ch));
function render(d,total,channels,cadence,automate=true){const pcm=[new Float32Array(total),new Float32Array(total)];let event=0;for(let frame=0,k=0;frame<total;k++){
 while(automate&&event<events.length&&events[event][0]===frame){const [,index,value]=events[event++];d.target(index,value);}
 const n=Math.min(total-frame,cadence[k%cadence.length],automate?(events[event]?.[0]??total)-frame:total-frame);for(let ch=0;ch<channels;ch++)for(let i=0;i<n;i++)d.input[ch][i]=signal(frame+i,ch);d.render(n,channels);for(let ch=0;ch<2;ch++)pcm[ch].set(d.output[ch].subarray(0,n),frame);frame+=n;
 }return pcm;}
const trials=[];
for(const rate of [8000,24000,44100,48000,96000,192000])for(const channels of [1,2]){
 const e=new WebAssembly.Instance(module,{}).exports,a=new OwnedTape(e,spec,rate),b=new OwnedTape(e,loadOwnedTapeSpec(saveOwnedTapeSpec(spec)),rate);a.refresh();b.refresh();const memory=e.memory.buffer.byteLength,total=Math.max(16001,Math.ceil(rate*.5));e.tape_owned_alloc_watch(1);
 try{const first=render(a,total,channels,[1,37,509,113]),second=render(b,total,channels,[128]);assert.equal(sha(first),sha(second));assert(first.every(a=>a.some(v=>v!==0)));const before=b.stats();a.reset();assert.deepEqual(b.stats(),before);for(const [index,value]of a.spec.parameters)assert.equal(a.value(index),value);b.reset();assert.equal(sha(render(a,total,channels,[203,509],false)),sha(render(b,total,channels,[1,127],false)));const calls=e.tape_owned_alloc_count();e.tape_owned_alloc_watch(0);assert.equal(calls,0);assert.equal(e.memory.buffer.byteLength,memory);trials.push({rate,channels,frames:total,sha256:sha(first),cadenceIndependentRawExact:true,saveReloadExact:true,latestTargetsRetained:true,independentHandles:true,preparedCurveControls:3,allocationOrReclamationCalls:calls,memoryBytes:memory,memoryGrew:false});}finally{e.tape_owned_alloc_watch(0);a.dispose();b.dispose();}
}
const primitiveRegression=[];
for(const rate of [44100,48000,96000])for(const channels of [1,2])for(const curve of ['linear','tape'])for(const drive of (curve==='linear'?[0]:[0,.3,1])){
 const old=new OwnedTapeShaper(new WebAssembly.Instance(oldModule,{}).exports,tapeShaperSpec(drive,curve),rate),now=new OwnedTapeShaper(new WebAssembly.Instance(module,{}).exports,tapeShaperSpec(drive,curve),rate),total=4097;
 try{const renderPrimitive=d=>{const pcm=[new Float32Array(total),new Float32Array(total)];for(let frame=0;frame<total;){const n=Math.min(total-frame,128);for(let ch=0;ch<channels;ch++)for(let i=0;i<n;i++)d.input[ch][i]=frame+i===0?1:signal(frame+i,ch);d.render(n,channels);for(let ch=0;ch<2;ch++)pcm[ch].set(d.output[ch].subarray(0,n),frame);frame+=n;}return pcm;};const baseline=sha(renderPrimitive(old)),current=sha(renderPrimitive(now));assert.equal(current,baseline);primitiveRegression.push({rate,channels,curve,drive,frames:total,baselineSha256:baseline,currentSha256:current,rawExact:true});}finally{old.dispose();now.dispose();}
}
const report={kind:'tape.owned-functional',version:1,pass:true,createdAtUtc:new Date().toISOString(),engineVersion:manifest.version,build:manifest,scope:'Owned Rust functional and allocator properties. Native Web Audio numerical parity and realtime deadline measurements are separate. Allocator counts exclude preparation/destruction and JS host allocations. Primitive regression compares the exact retained artifact previously validated in 72 native browser cases.',trials,primitiveBaseline:{engineVersion:oldManifest.version,wasmSha256:oldManifest.wasm},primitiveRegression};fs.writeFileSync('reports/modular_audio/owned-tape-functional.json',JSON.stringify(report,null,2)+'\n');console.log(`${trials.length} full Tape allocation/cadence/persistence cases and ${primitiveRegression.length} retained native-proven primitive regressions pass.`);
