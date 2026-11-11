import './reportDirectory.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {OwnedMixerUnit} from '../src/modular-audio/mixerOwned.js';
import {saveMixerConfig,loadMixerConfig} from '../src/modular-audio/mixerConfig.js';
const wasm=new WebAssembly.Module(fs.readFileSync('.tmp/mixer-owned-allocation/mixer.wasm')),manifest=JSON.parse(fs.readFileSync('.tmp/mixer-owned-allocation/build.json')),results=[];
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
for(const rate of [44100,48000,96000])for(const kind of ['strip','matrix','fader']){
 const params=kind==='strip'?[1,80,rate*.4,3,-2,4,-.2,.75]:kind==='matrix'?[1.2,.2]:[.8],config={version:1,kind,sampleRate:rate,settled:false,parameters:params,events:[{frame:37,owner:1,parameter:0,value:.4},{frame:1003,owner:2,parameter:0,value:.9},{frame:11701,owner:3,parameter:kind==='strip'?6:0,value:kind==='strip'?-.75:.2}]},e=new WebAssembly.Instance(wasm,{}).exports,a=new OwnedMixerUnit(e,config,512),b=new OwnedMixerUnit(e,loadMixerConfig(saveMixerConfig(config)),512);a.refresh();b.refresh();const memory=e.memory.buffer.byteLength,total=Math.ceil(rate*.5),left=new Float32Array(total),right=new Float32Array(total);e.mixer_alloc_watch(1);
 for(let at=0;at<total;){const n=Math.min(113,total-at);for(let c=0;c<2;c++)for(let i=0;i<n;i++)a.input[c][i]=b.input[c][i]=Math.sin((at+i)*.17+c*.3)*.1;a.render(n);b.render(n);for(let c=0;c<2;c++)for(let i=0;i<n;i++){assert.ok(Number.isFinite(a.output[c][i]));assert.equal(a.output[c][i],b.output[c][i]);}left.set(a.output[0].subarray(0,n),at);right.set(a.output[1].subarray(0,n),at);at+=n;}
 a.pause(true);a.render(127);a.pause(false);a.cancel(1);a.reset();a.render(1);a.cancel(0);b.enqueue({frame:0,owner:1,parameter:0,value:.5});b.render(127);const calls=e.mixer_alloc_count();e.mixer_alloc_watch(0);assert.equal(calls,0);assert.equal(e.memory.buffer.byteLength,memory);results.push({kind,rate,frames:total,allocationOrReclamationCalls:calls,memoryBytes:memory,grew:false,saveReloadExact:true,independentHandles:2,leftSha256:hash(left),rightSha256:hash(right)});a.dispose();b.dispose();
}
const report={kind:'mixer.owned-allocation-persistence',version:1,engine:manifest,pass:true,scope:'Wasm-only owned strip/matrix/fader: same-memory handles, deterministic save/reload, 12ms smoothing/events, pause/cancel/reset; no native Web Audio parity claim.',results};fs.writeFileSync('reports/modular_audio/mixer-owned-allocation.json',JSON.stringify(report,null,2)+'\n');console.log(`${results.length} owned mixer audits passed with zero allocations/frees/growth.`);
