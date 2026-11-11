import './reportDirectory.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ReferenceGraph} from '../src/modular-audio/runtime';
import {iowaFixture,iowaReferenceMessages} from '../src/modular-audio/iowaFixture';
import {pitchRange,settleLevels} from '../src/app/engine/iowaModel/model';
import {PATCHES} from '../src/app/engine/iowaModel/patches';
let Legacy;globalThis.AudioWorkletProcessor=class{constructor(){this.port={};}};
globalThis.registerProcessor=(name,C)=>{if(name==='iowa-voices')Legacy=C;};
await import('../src/app/engine/iowaModel/iowa.worklet.js');
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),trials=[];
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
for(const patch of PATCHES)for(const rate of [44100,48000,96000])for(const edge of [0,.5,1]){
 const table=JSON.parse(fs.readFileSync(`src/library/iowaTables/${patch.uses??patch.id}.json`)),range=pitchRange(settleLevels(structuredClone(table))),midi=Math.round(range[0]+edge*(range[1]-range[0]));
 const f=iowaFixture(table,patch.id,{rate,notes:[{midi,time:.125,duration:.45,velocity:[.12,.65,1][Math.round(edge*2)]}]}),e=new WebAssembly.Instance(module,{}).exports,g=new ReferenceGraph(e,f.patch,contracts,rate,512),frames=Math.ceil(rate*1.5/128)*128,a=new Float32Array(frames),b=new Float32Array(frames);
 globalThis.sampleRate=rate;globalThis.currentTime=0;const old=new Legacy({processorOptions:{messages:iowaReferenceMessages(f)}});let max=0,energy=0,peak=0;
 try{for(let at=0;at<frames;at+=128){globalThis.currentTime=at/rate;old.process([],[[a.subarray(at,at+128)]]);g.render(128);b.set(g.left.subarray(0,128),at);for(let i=at;i<at+128;i++){assert.ok(Number.isFinite(b[i]));const delta=a[i]-b[i];max=Math.max(max,Math.abs(delta));energy+=delta*delta;peak=Math.max(peak,Math.abs(b[i]));}}assert.ok(max<1e-6,`${patch.id}/${rate}/${midi}: ${max}`);assert.ok(peak>0,`${patch.id}/${midi} silent`);trials.push({id:patch.id,rate,midi,velocity:f.notes[0].velocity,frames,maxAbsoluteError:max,rmsError:Math.sqrt(energy/frames),peak,bitExact:max===0,referenceSha256:hash(a),rustSha256:hash(b)});}finally{g.dispose();}
}
const report={kind:'iowa.owned-dsp-compatibility',version:1,engineVersion:JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,scope:'Actual legacy worklet Held/Decay/Roll DSP vs Rust Wasm, before shared room/limiter/effects. Existing JS measurement/FFT preparation supplies both. No physical listening claim.',pass:true,patches:PATCHES.length,comparisons:trials.length,bitExact:trials.filter(t=>t.bitExact).length,maxAbsoluteError:Math.max(...trials.map(t=>t.maxAbsoluteError)),trials};
fs.writeFileSync('reports/modular_audio/iowa-owned-compatibility.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,trials:undefined}));
