// Compare a retained pre-change inserts.wasm with the current kernel, including
// parameter changes, reset and arbitrary block sizes. Run from the repo root:
// node tools/auditWorkbenchInserts.mjs .tmp/inserts-before-workbench.wasm
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const baseline=process.argv[2];
if(!baseline)throw Error('Pass the path of the pre-change inserts.wasm artifact.');
const modules=[baseline,'public/synth-lab/inserts.wasm'].map(path=>new WebAssembly.Module(fs.readFileSync(path)));
const presets=[[[3,6]],[[20,.65]],[[10,.7],[14,.6]],[[15,.7],[19,-.7]],[[1,.5],[2,12],[3,3],[5,-2],[8,1],[10,.7],[15,.4],[20,.5]]];
let maximumDifference=0;
for(const rate of [44100,48000,96000])for(const settings of presets){
 const engines=modules.map(module=>new WebAssembly.Instance(module,{}).exports);
 for(const e of engines){e.inserts_init(rate);settings.forEach(([key,value])=>e.inserts_param(key,value));e.inserts_settle();}
 let at=0;
 for(let block=0;block<500;block++){
  const n=[128,257,17,2048][block%4];
  if(block===100||block===300)for(const e of engines){e.inserts_param(3,block===100?-3:6);e.inserts_param(23,block===100?-6:0);}
  if(block===200)for(const e of engines)e.inserts_clear();
  for(const e of engines){for(let ch=0;ch<2;ch++){const x=new Float32Array(e.memory.buffer,e.inserts_input(ch),n);for(let i=0;i<n;i++)x[i]=.06*Math.sin(2*Math.PI*(ch?613:997)*(at+i)/rate);}e.inserts_render(n);}
  for(let ch=0;ch<2;ch++){
   const pcm=engines.map(e=>new Float32Array(e.memory.buffer,e.inserts_output(ch),n));
   for(let i=0;i<n;i++)maximumDifference=Math.max(maximumDifference,Math.abs(pcm[0][i]-pcm[1][i]));
  }
  at+=n;
 }
}
if(maximumDifference!==0)throw Error(`PCM changed: maximum absolute difference ${maximumDifference}`);
const timings=presets.map(settings=>{
 const runs=modules.map(module=>new WebAssembly.Instance(module,{}).exports),samples=[[],[]];
 for(const e of runs){e.inserts_init(48000);settings.forEach(([key,value])=>e.inserts_param(key,value));e.inserts_settle();for(let ch=0;ch<2;ch++)new Float32Array(e.memory.buffer,e.inserts_input(ch),128).fill(.03);for(let i=0;i<1000;i++)e.inserts_render(128);}
 for(let run=0;run<7;run++)for(const k of run%2?[1,0]:[0,1]){const start=performance.now();for(let i=0;i<12000;i++)runs[k].inserts_render(128);samples[k].push(performance.now()-start);}
 const median=values=>values.sort((a,b)=>a-b)[3],before=median(samples[0]),after=median(samples[1]);
 return {settings,beforeMs:+before.toFixed(2),afterMs:+after.toFixed(2),speedup:+(before/after).toFixed(3)};
});
console.log(JSON.stringify({sampleRates:[44100,48000,96000],maximumDifference,timings},null,2));
