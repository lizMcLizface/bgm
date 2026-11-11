import fs from 'node:fs';
import os from 'node:os';
import {performance}from 'node:perf_hooks';
import {OwnedTape,ownedTapeSpec}from '../src/modular-audio/ownedTape.js';
const module=new WebAssembly.Module(fs.readFileSync('.tmp/owned-tape/tape-fx.wasm')),manifest=JSON.parse(fs.readFileSync('.tmp/owned-tape/build.json')),trials=[];
const quantile=(values,q)=>values[Math.min(values.length-1,Math.floor(q*(values.length-1)))];
for(const rate of [8000,24000,44100,48000,96000,192000]){
 const e=new WebAssembly.Instance(module,{}).exports,d=new OwnedTape(e,ownedTapeSpec({wow:1,wowRate:5,flutter:1,drive:1,tone:20000},[0,.3,1]),rate);
 try{for(let ch=0;ch<2;ch++)for(let i=0;i<128;i++)d.input[ch][i]=Math.fround(.3*Math.sin(i*(.051+ch*.01)));for(let block=0;block<256;block++)d.render(128,2);d.reset();const steady=[],curve=[],total=Math.max(256,Math.ceil(rate/128));for(let block=0;block<total;block++){
  if(block%32===0){const start=performance.now();if(!e.tape_owned_param(d.handle,3,[0,.3,1][(block/32)%3]))throw Error('Prepared curve selection failed');d.render(128,2);curve.push(performance.now()-start);}
  else{const start=performance.now();d.render(128,2);steady.push(performance.now()-start);}
 }steady.sort((a,b)=>a-b);curve.sort((a,b)=>a-b);const periodMs=128/rate*1000;trials.push({rate,channels:2,framesPerCall:128,quantumPeriodMs:periodMs,steady:{calls:steady.length,medianMs:quantile(steady,.5),p99Ms:quantile(steady,.99),maxMs:steady.at(-1),overQuantumPeriod:steady.filter(v=>v>periodMs).length},preparedCurvePlusRender:{calls:curve.length,medianMs:quantile(curve,.5),maxMs:curve.at(-1),overQuantumPeriod:curve.filter(v=>v>periodMs).length}});}finally{d.dispose();}
}
const report={kind:'tape.owned-desktop-cost',version:1,createdAtUtc:new Date().toISOString(),engineVersion:manifest.version,wasmSha256:manifest.wasm,hardware:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version},scope:'Single-threaded warmed desktop Node Wasm wall time, including JS call/preemption; standalone stereo128-frame render with all modulation/drive enabled and native cold tone ramp. This is not browser callback scheduling, phone CPU, device output or realtime deadline certification. Prepared-curve measurements include bounded8196-byte curve selection plus render; preparation excluded.',trials};fs.writeFileSync('reports/modular_audio/owned-tape-desktop-cost.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
