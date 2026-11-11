import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ReferenceGraph,savePatch,loadPatch} from '../src/modular-audio/runtime.js';
import {verifyPool} from '../src/modular-audio/poolVerification.js';
import {verifyWorker} from '../src/modular-audio/workerVerification.js';
import {poolEffectsFixture} from '../src/modular-audio/poolEffectsFixture.js';
import {sixSourceDag} from '../src/modular-audio/pitchedFixture.js';
import {BrowserThreadWorker,MessageChannel} from './workerNodeAdapter.mjs';
globalThis.MessageChannel=MessageChannel;
const manifest=JSON.parse(fs.readFileSync('public/modular-audio/build.json')),assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}},results=[];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const equalFractionalFm of [false,true])for(const rate of equalFractionalFm?[48000]:[44100,48000,96000]){
  const patch=loadPatch(savePatch(poolEffectsFixture(assets.fixture,rate,{equalFractionalFm}),assets.contracts),assets.contracts),g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,512),sourceLatencies=Object.fromEntries([1,2,3,4,5,6].map(id=>[id,g.latency(id)])),outputLatency=g.latency(18);g.dispose();
  for(const blockFrames of equalFractionalFm?[512]:[512,1024]){
    const options={blockFrames,poolBlocks:4,scheduling:'message'},pool=await verifyPool(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()}),worker=await verifyWorker(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});
    assert(pool.pass&&worker.pass);assert.deepEqual(pool.sourceLatencies,sourceLatencies);assert.deepEqual(worker.worker.sourceLatencies,sourceLatencies);assert.equal(pool.sameCadenceMaxAbs,0);assert.equal(worker.sameCadenceMaxAbs,0);assert(pool.peaksByBus.every(peak=>peak>0));assert.equal(pool.master.applied+pool.workers.reduce((n,w)=>n+w.graph.applied,0),pool.serial.applied);
    results.push({equalFractionalFm,rate,blockFrames,sourceLatencies,outputLatency,pool,worker});console.log(`${rate} Hz, ${blockFrames} frames, ${equalFractionalFm?'equal fractional FM':'integer core'}: exact one/three-worker PCM`);
  }
}
for(const rate of [48000,96000]){
  const patch=loadPatch(savePatch(poolEffectsFixture(assets.fixture,rate,{extendedMaster:true}),assets.contracts),assets.contracts),g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,512),sourceLatencies=Object.fromEntries([1,2,3,4,5,6].map(id=>[id,g.latency(id)])),outputLatency=g.latency(18);g.dispose();assert.equal(outputLatency,512);
  const options={blockFrames:512,poolBlocks:4,scheduling:'message'},pool=await verifyPool(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()}),worker=await verifyWorker(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});assert(pool.pass&&worker.pass);assert.equal(pool.sameCadenceMaxAbs,0);assert.equal(worker.sameCadenceMaxAbs,0);assert.deepEqual(pool.sourceLatencies,sourceLatencies);assert(pool.peaksByBus.every(peak=>peak>0));assert.equal(pool.master.applied,5);
  results.push({extendedMaster:true,equalFractionalFm:false,rate,blockFrames:512,sourceLatencies,outputLatency,pool,worker});console.log(`${rate} Hz, 512 frames, rack pitch/Shimmer dependent master: exact one/three-worker PCM`);
}
let mixedFractionalRejection=null,threadsStarted=0;
try{await verifyPool(assets,48000,{patch:{...sixSourceDag(assets.fixture,48000),latencyCompensation:true},makeWorker:()=>{threadsStarted++;return new BrowserThreadWorker();}});}catch(e){mixedFractionalRejection=String(e);}
assert.match(mixedFractionalRejection,/fractional differences/);assert.equal(threadsStarted,0);
await assert.rejects(verifyWorker(assets,48000,{patch:{...sixSourceDag(assets.fixture,48000),latencyCompensation:true},makeWorker:()=>{threadsStarted++;return new BrowserThreadWorker();}}),/fractional differences/);assert.equal(threadsStarted,0);
assert.equal(JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,manifest.version,'Graph assets changed during audit; rerun against one build');
const report={version:1,pass:true,createdAtUtc:new Date().toISOString(),graphVersion:manifest.version,graphSha256:sha('public/modular-audio/graph.wasm'),sources:Object.fromEntries(['src/modular-audio/poolPlan.js','src/modular-audio/graphWorker.js','src/modular-audio/poolBrowser.js','src/modular-audio/poolVerification.js','src/modular-audio/workerVerification.js','src/modular-audio/poolEffectsFixture.js'].map(file=>[file,sha(file)])),scope:'Consumer-paced real Node worker threads and prepared Rust Wasm graphs. Eight source/key/master buses; matching-cadence exactness, actual prepared f64 latency metadata, integer path-difference compensation, branch inserts/send FX/delay, rack pitch/Shimmer, save/reload, source cancellation and prebooked master controls. No physical listening, realtime deadline, throughput or speedup claim.',limitations:['Six fixed source IDs and original source cut only; dependent FX remain on the realtime master.','Fractional absolute latency is retained; unequal fractional path differences reject rather than round.','Rack Pitch reports128 frames of adapter latency only; its native wet pitch delay remains time-varying, not compensated.','Master events are prebooked; live pool enqueue remains source-owned.','No worker-only effects in the dependent realtime master.'],mixedFractionalRejection,threadsStarted,results};
fs.writeFileSync('reports/modular_audio/pool-effects-latency-parity.json',JSON.stringify(report,null,2)+'\n');
