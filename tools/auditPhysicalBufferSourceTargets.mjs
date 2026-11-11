import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {OwnedPhysicalBufferLive} from '../src/modular-audio/ownedPhysicalBufferLive.js';
const fixture=JSON.parse(fs.readFileSync('src/modular-audio/nativeScalarPitchFixture.json'));
export function auditPhysicalBufferSourceTargets(module){
 const cases=[];
 function create(edit={}){const p=new OwnedPhysicalBufferLive(module,48000,1);p.store(1,{frequency:440,strike:new Float32Array(144000).fill(.1)});p.parameter(0,'type','highpass');p.parameter(0,'frequency',0);p.schedule({key:1,id:1,slot:0,onset:37,gain:[[0,1],[128000,1],[128128,0]],filter:[[0,0,0,0]],pitch:300,pitchTau:48000,...edit});return p;}
 for(const c of fixture.cases){const p=create({onset:c.onset,pitch:c.amount,pitchTau:c.tau*48000});let max=0;try{for(let frame=fixture.origin;frame<=c.points.at(-1)[0];frame+=128){p.render(frame);const point=c.points.find(v=>v[0]===frame);if(point)max=Math.max(max,Math.abs(p.sourcePosition(1)-point[1]));}assert(max<=1/512,'Native scalar cursor differs beyond measurement resolution');cases.push({kind:'native-scalar-cursor',onset:c.onset,amount:c.amount,maxSamplePositionError:max,pass:true});}finally{p.dispose();}}
 const a=create(),b=create();try{for(let f=0;f<12288;f+=128){a.render(f);b.render(f);}a.render(24576);b.render(12288);assert.equal(a.sourcePosition(1),b.sourcePosition(1),'Scalar target consumed unpulled age');cases.push({kind:'scalar-pull-gap',pass:true});}finally{a.dispose();b.dispose();}
 const p=create({pitch:0}),q=create({pitch:0});try{for(const s of[p,q])for(let i=0;i<5000;i++){try{s.timelineEvent(0,'gain',0,.3,0);}catch{break;}}const before=p.stats();assert.throws(()=>p.schedule({key:1,id:2,slot:0,onset:128,gain:[[0,1],[256,0]],filter:[[0,0,0,0]]}));assert.equal(p.stats().booked,before.booked);assert.throws(()=>p.release(0,{time:128,seconds:.1}));assert.equal(p.stats().releases,0);assert.deepEqual(p.render(0),q.render(0));assert.deepEqual(p.render(128),q.render(128));cases.push({kind:'dual-ledger-admission-preserves-booking-and-pcm',pass:true});}finally{p.dispose();q.dispose();}
 return{cases,pass:true,maxNativePositionError:Math.max(...cases.filter(c=>c.kind==='native-scalar-cursor').map(c=>c.maxSamplePositionError))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const wasm=process.argv.find(v=>v.startsWith('--wasm='))?.slice(7)??'public/physical-buffer-live/buffer.wasm',module=new WebAssembly.Module(fs.readFileSync(wasm)),report={wasm,...auditPhysicalBufferSourceTargets(module)};fs.writeFileSync('reports/modular_audio/physical-buffer-source-target-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:report.cases.length,maxNativePositionError:report.maxNativePositionError,pass:report.pass}));}
