import fs from 'node:fs';import os from 'node:os';import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {LegacyRoleKernel,distribution,configureLegacyTransitions} from '../src/modular-audio/sixRoleKernels.js';
import * as transitions from '../public/synth-lab/patch-transition.js';
import {validateSixFixture} from '../src/modular-audio/sixRoleFixture.js';
const raw=fs.readFileSync('public/modular-audio/six-role-fixture.json'),fixture=validateSixFixture(JSON.parse(raw));
configureLegacyTransitions(transitions);
const files={core:'core',fm:'fm',percussion:'percussion',inserts:'inserts'},modules={},hashes={};for(const [id,name]of Object.entries(files)){const b=fs.readFileSync(`public/synth-lab/${name}.wasm`);modules[id]=new WebAssembly.Module(b);hashes[id]=crypto.createHash('sha256').update(b).digest('hex');}
const repeats=Number(process.argv.find(a=>a.startsWith('--repeats='))?.split('=')[1]??3);if(![1,3].includes(repeats))throw Error('Use --repeats=1|3');
const results=[];
for(const rate of [44100,48000,96000]){
 const runs=[];let expected;
 for(let iteration=-1;iteration<repeats;iteration++){
  const start=performance.now(),roles=fixture.parts.map(p=>new LegacyRoleKernel(modules,fixture,p,rate)),prepared=performance.now(),count=Math.round(fixture.totalSeconds*rate),timings=roles.map(()=>[]),totals=[],digest=roles.map(()=>crypto.createHash('sha256')),peaks=roles.map(()=>0),energy=roles.map(()=>[0,0]);
  for(let at=0;at<count;){const n=Math.min(128,count-at);let total=0;for(let role=0;role<roles.length;role++){const g=roles[role],before=performance.now();g.render(n);const elapsed=performance.now()-before;total+=elapsed;if(iteration>=0)timings[role].push(elapsed);
    for(let ch=0;ch<2;ch++){const pcm=(ch===0?g.left:g.right).subarray(0,n);digest[role].update(new Uint8Array(pcm.buffer,pcm.byteOffset,pcm.byteLength));for(const v of pcm){if(!Number.isFinite(v))throw Error('Nonfinite source PCM');peaks[role]=Math.max(peaks[role],Math.abs(v));energy[role][ch]+=v*v;}}
   }if(iteration>=0)totals.push(total);at+=n;
  }
  const finished=performance.now(),pcmHashes=digest.map(h=>h.digest('hex'));
  if(!expected)expected=pcmHashes;else if(JSON.stringify(expected)!==JSON.stringify(pcmHashes))throw Error('Non-deterministic warmed/repeated source PCM');
  if(iteration<0)continue;
  const stats=roles.map(r=>r.stats());if(stats.some(s=>s.dropped||s.late))throw Error('Fixture dropped/late events');
  runs.push({iteration,prepareMs:prepared-start,elapsedMs:finished-prepared,sourceBlockSumMs:distribution(totals),offlineBlocksOverAudioDuration:totals.filter(t=>t>128/rate*1000).length,roles:roles.map((r,i)=>({role:fixture.parts[i].role,kind:fixture.parts[i].kind,blockMs:distribution(timings[i]),pcmSha256InterleavedBlocksLR:pcmHashes[i],peak:peaks[i],rms:energy[i].map(v=>Math.sqrt(v/count)),...stats[i]}))});
 }
 results.push({rate,frames:Math.round(fixture.totalSeconds*rate),blockFrames:128,warmupFullRuns:1,runs});console.log(`Measured six actual roles at ${rate} Hz, ${repeats} repeats after warmup.`);
}
const overhead=[];for(let i=0;i<2000;i++){const t=performance.now();overhead.push(performance.now()-t);}
const report={version:1,fixtureId:fixture.id,fixtureSha256:crypto.createHash('sha256').update(raw).digest('hex'),method:'Direct serial legacy source kernels plus active local inserts; excludes Web Audio mixer/filters/master/limiter and scheduling. Offline block observations are not callback deadlines.',node:process.version,platform:process.platform,os:os.release(),arch:process.arch,cpu:os.cpus()[0].model.trim(),logicalCPUs:os.cpus().length,timerPairMs:distribution(overhead),hashes,results};
fs.mkdirSync('reports/modular_audio',{recursive:true});fs.writeFileSync('reports/modular_audio/six-role-kernel-baseline.json',JSON.stringify(report,null,2)+'\n');console.log('Saved reports/modular_audio/six-role-kernel-baseline.json');
