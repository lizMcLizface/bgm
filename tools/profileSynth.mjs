// Dev-server tool; direct production-kernel timings + named-release CPU samples.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {summarizeCpuProfile} from './dspProfileSummary.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=(k,d)=>process.argv.find(s=>s.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const name=process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome',output=path.resolve(process.env.SYNTH_PROFILE_DIR||path.join(root,'.tmp/dsp-profile/results')),rate=Number(arg('rate',48000)),seconds=Number(arg('seconds',6)),repeats=Number(arg('repeats',5));
if(![44100,48000,96000].includes(rate)||!Number.isFinite(seconds)||seconds<1||seconds>20||!Number.isInteger(repeats)||repeats<1||repeats>9)throw Error('Use 44.1/48/96 kHz, 1–20 seconds and 1–9 repeats.');
const builds=JSON.parse(await fs.readFile(path.join(root,'.tmp/dsp-profile/builds.json'))),kernels=['core','fm','effects','inserts'];
for(const k of kernels){const current=JSON.parse(await fs.readFile(path.join(root,'public/synth-lab',k==='core'?'build.json':k+'-build.json')));if(current.source!==builds[k].production.source||current.wasm!==builds[k].production.wasm)throw Error('Profiling build is stale; run npm run synth:profile-build.');}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const encoded=Object.fromEntries(await Promise.all(kernels.map(async k=>{const named=await fs.readFile(path.join(root,'.tmp/dsp-profile',k+'.wasm')),normal=await fs.readFile(path.join(root,'public/synth-lab',k+'.wasm'));if(hash(named)!==builds[k].sha256||hash(normal)!==builds[k].production.wasm)throw Error('Kernel/profile artifact hash mismatch: '+k);return [k,named.toString('base64')];})));
await fs.mkdir(output,{recursive:true});
const executablePath=process.env.SYNTH_BROWSER_PATH||(name==='chrome'?'C:/Program Files/Google/Chrome/Application/chrome.exe':null);if(!executablePath)throw Error('Set SYNTH_BROWSER_PATH.');
const browser=await puppeteer.launch(name==='firefox'?{browser:'firefox',executablePath,headless:true,defaultViewport:null,protocolTimeout:600000}:{executablePath,headless:true,pipe:true,args:['--no-sandbox','--mute-audio'],protocolTimeout:600000});
const report={version:1,created:new Date().toISOString(),browser:await browser.version(),system:{platform:os.platform(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},builds,protocol:{rate,seconds,repeats,warmup:1,block:128,profileIntervalUs:500},errors:[],cases:[],profiles:[],limits:'Direct synchronous DSP microbenchmarks, not an AudioWorklet deadline/underrun measurement. Effect timings include input copies. No output copying/metrics in measured source loops. CPU sampling is separate from unprofiled production-module timings.'};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto((process.env.SYNTH_LAB_URL||'http://localhost:5173')+'/tools/stress.html');
 await page.evaluate(async({encoded,kernels})=>{
  const api=await import('/src/synth-lab/profileDsp.js');window.__dspProfile={api,production:{},named:{}};
  for(const k of kernels){const p=await fetch('/synth-lab/'+k+'.wasm');if(!p.ok)throw Error('Kernel unavailable: '+k);window.__dspProfile.production[k]=await WebAssembly.compile(await p.arrayBuffer());window.__dspProfile.named[k]=await WebAssembly.compile(Uint8Array.from(atob(encoded[k]),c=>c.charCodeAt(0)));}
 },{encoded,kernels});
 const all=await page.evaluate(()=>window.__dspProfile.api.DSP_CASES),requested=arg('cases','').split(',').filter(Boolean),cases=requested.length?all.filter(s=>requested.includes(s.id)):all;
 if(!cases.length||requested.some(id=>!all.some(c=>c.id===id)))throw Error('Unknown/empty case selection.');
 for(const spec of cases){
  const row=await page.evaluate(({spec,rate,seconds,repeats})=>{
   const {api,production,named}=window.__dspProfile,f=api.dspFixture(spec,{rate,seconds});
   const reference=api.prepareDsp(production[f.kernel],f).run({capture:true}),symbolic=api.prepareDsp(named[f.kernel],f).run({capture:true}),compatibility=api.compareDsp(reference.pcm,symbolic.pcm);
   // The captured validation pass warms code but is not timed as a measurement.
   const runs=[];for(let i=0;i<repeats;i++)runs.push(api.prepareDsp(production[f.kernel],f).run());
   const times=runs.map(r=>r.ms).sort((a,b)=>a-b),median=times.length%2?times[Math.floor(times.length/2)]:(times[times.length/2-1]+times[times.length/2])/2;
   return {id:spec.id,fixture:f,compatibility,validationStats:reference.stats,medianMs:median,minMs:times[0],maxMs:times.at(-1),audioPerRender:seconds*1000/median,runs:runs.map(({pcm,...r})=>r)};
  },{spec,rate,seconds,repeats});
  report.cases.push(row);if(row.compatibility.nonFinite||row.compatibility.maxDifference!==0||row.validationStats?.some((x,i)=>i===0?x!==row.fixture.voices:x!==0))throw Error('Named/production parity or voice diagnostics failed: '+row.id);
  console.log(JSON.stringify({id:row.id,medianMs:row.medianMs,x:row.audioPerRender,range:[row.minMs,row.maxMs],compat:row.compatibility.maxDifference}));await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));
 }
 if(name==='chrome'&&!process.argv.includes('--no-samples')){
  const session=await page.createCDPSession();await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:500});
  const selected=arg('profiles','fm-base,fm-colour,core-lanes8,core-colour,room16,insert-all').split(',').filter(Boolean),durationMs=Math.max(500,Math.min(10000,Number(arg('profile-ms',2500))));
  for(const id of selected){const spec=all.find(s=>s.id===id);if(!spec)throw Error('Unknown profile '+id);
   await page.evaluate(({spec,rate,seconds})=>{const {api,named}=window.__dspProfile,f=api.dspFixture(spec,{rate,seconds});window.__dspHot=api.prepareDsp(named[f.kernel],f);window.__dspHot.run();},{spec,rate,seconds});
   await session.send('Profiler.start');const work=await page.evaluate(ms=>{const start=performance.now();let passes=0;do{window.__dspHot.run();passes++;}while(performance.now()-start<ms);return {passes,wallMs:performance.now()-start};},durationMs);const {profile}=await session.send('Profiler.stop');
   const file=name+'-'+id+'.cpuprofile';await fs.writeFile(path.join(output,file),JSON.stringify(profile));const summary=summarizeCpuProfile(profile);report.profiles.push({id,file,work,...summary});console.log(JSON.stringify({profile:id,samples:summary.samples,self:summary.self.slice(0,7)}));
  }await session.detach();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));await browser.close();}
