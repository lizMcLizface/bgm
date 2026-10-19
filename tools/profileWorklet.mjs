// Chrome tracing samples the actual AudioWorklet isolate, not the page isolate.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import {wasmCodeHash} from './wasmCodeHash.mjs';
import {summarizeWorkletTrace} from './workletTraceSummary.mjs';
const arg=(k,d)=>process.argv.find(s=>s.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const origin=process.env.SYNTH_LAB_URL??'http://localhost:5173',output=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/worklet-profile');
const mode=arg('mode','offline'),ids=arg('cases','sub-voices,sub-layers,fm-six,mixed-acoustic').split(','),repeats=Number(arg('repeats',3)),seconds=Number(arg('seconds',12));
const tier=arg('wasm-tier','default');if(!['default','baseline','optimizing'].includes(tier))throw Error('Use --wasm-tier=default|baseline|optimizing; forced tiers are diagnostic only.');
if(!['offline','live'].includes(mode)||![1,3].includes(repeats)||!Number.isFinite(seconds)||seconds<3||seconds>30)throw Error('Use --mode=offline|live, --repeats=1|3 and --seconds=3..30 (live duration).');
const kernels=['core','fm','effects','inserts'],namedBuilds=JSON.parse(await fs.readFile('.tmp/dsp-profile/builds.json','utf8'));
const production={},named={},builds={},overrides={};
for(const k of kernels){
 const normal=await fs.readFile('public/synth-lab/'+k+'.wasm'),symbols=await fs.readFile('.tmp/dsp-profile/'+k+'.wasm');
 const manifest=JSON.parse(await fs.readFile('public/synth-lab/'+(k==='core'?'build':k+'-build')+'.json','utf8'));
 if(namedBuilds[k].production.source!==manifest.source||namedBuilds[k].production.wasm!==manifest.wasm||wasmCodeHash(normal)!==wasmCodeHash(symbols))throw Error('Stale/nonidentical named kernel: '+k+'. Run npm run synth:profile-build.');
 const replacement=arg(k,'');if(replacement)overrides[k]=await fs.readFile(replacement);
 production[k]=overrides[k]??normal;named[k]=overrides[k]??symbols;
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 builds[k]={production:manifest,timedSha256:hash(production[k]),sampledSha256:hash(named[k]),codeHash:wasmCodeHash(production[k]),named:!replacement,override:replacement||null};
}
await fs.mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required',...(tier==='default'?[]:['--js-flags='+ (tier==='baseline'?'--liftoff-only':'--no-liftoff')])],protocolTimeout:600000});
const report={browser:await browser.version(),created:new Date().toISOString(),system:{cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},builds,protocol:{mode,repeats:mode==='offline'?repeats:1,seconds:mode==='live'?seconds:8,fluid:0,quality:'Requested case quality; no automatic reduction',timing:'Separate untraced production-kernel runs; one excluded warm-up for offline. Live has two warm-up seconds and one observation window. Trace is an additional graph, including preparation, never a timing run.',jit:tier==='default'?'Browser defaults; no no-inline flags.':'Diagnostic forced '+tier+' tier; not normal-browser performance.'},cases:[],errors:[],limits:'Desktop Chrome, not Pixel/Surface or thermal certification. Tracing changes cost. Offline worklets are not realtime deadlines; live clock/queue observations are not hardware underruns. Named samples have identical Wasm code sections to timed production kernels unless an explicit override is recorded. Forced compiler tiers are diagnostic, not a deployable browser policy.'};
async function open(sampled){
 const page=await browser.newPage();await page.setCacheEnabled(false);await page.setRequestInterception(true);
 page.on('request',request=>{
  const match=new URL(request.url()).pathname.match(/^\/synth-lab\/(core|fm|effects|inserts)\.wasm$/);
  const task=match?request.respond({status:200,contentType:'application/wasm',body:(sampled?named:production)[match[1]]}):request.continue();
  void task.catch(e=>report.errors.push(String(e)));
 });page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(origin+'/tools/stress.html');
 await page.evaluate(async()=>{
  const {STRESS_CASES}=await import('/src/synth-lab/stressPlan.js'),{runStressCase}=await import('/src/synth-lab/stressRunner.js'),{runStressLive}=await import('/src/synth-lab/stressLive.js');
  window.__profileGraph=async({id,mode,repeats,seconds,warmup})=>{
   const spec=STRESS_CASES.find(c=>c.id===id);if(!spec)throw Error('Unknown case '+id);
   return mode==='offline'?runStressCase(spec,{repeats,warmup}):runStressLive(spec,{seconds,warmupSeconds:2,fluidResolution:0,monitor:0});
  };
 });return page;
}
try{
 for(const id of ids){
  // Close the untraced page before sampling, so its audio context/isolate cannot
  // be mistaken for the graph under inspection or compete with that graph.
  const timed=await open(false),measurement=await timed.evaluate(opts=>__profileGraph(opts),{id,mode,repeats,seconds,warmup:true});await timed.close();
  const page=await open(true);if(mode==='offline')await page.evaluate(opts=>__profileGraph(opts),{id,mode,repeats:1,seconds,warmup:false});
  const cdp=await page.createCDPSession();
  await cdp.send('Tracing.start',{categories:'v8,v8.wasm,disabled-by-default-v8.wasm,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires,blink.user_timing,webaudio,audio',transferMode:'ReturnAsStream'});
  let traced,trace;
  try{traced=await page.evaluate(opts=>__profileGraph(opts),{id,mode,repeats:1,seconds,warmup:false});}
  finally{
   const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;let raw='';
   for(;;){const r=await cdp.send('IO.read',{handle:stream});raw+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});
   await fs.writeFile(path.join(output,id+'.trace.json'),raw);trace=JSON.parse(raw);
  }
  const result=summarizeWorkletTrace(trace),profiles=[];
  for(const [index,p]of result.profiles.entries()){
   const file=`${id}-${index}.cpuprofile`;await fs.writeFile(path.join(output,file),JSON.stringify(p.profile));
   const {profile,...summary}=p;profiles.push({...summary,file});
  }
  const worklets=profiles.filter(p=>/AudioWorklet/i.test(p.thread));
  if(!worklets.some(p=>p.summary.samples>0&&(p.kinds.wasm??0)>0)||result.orphanChunks)throw Error('No complete AudioWorklet Wasm profile: '+id);
  if(mode==='offline'&&(measurement.summary.nonFinite||measurement.summary.silent||measurement.summary.clipped||measurement.summary.late||measurement.summary.dropped||measurement.summary.steals||measurement.summary.missingStats))throw Error('Offline diagnostics failed: '+id);
  if(mode==='live'&&(measurement.status!=='complete'||measurement.errors.length||!measurement.sourceTelemetryComplete))throw Error('Live diagnostics failed: '+id);
  const row={id,measurement,traced,profiles,wasmEvents:result.wasmEvents,orphanChunks:result.orphanChunks};report.cases.push(row);
  console.log(JSON.stringify({id,untraced:mode==='offline'?measurement.summary:measurement.clock,worklets:worklets.map(p=>({thread:p.thread,kinds:p.kinds,self:p.summary.self.slice(0,8)})),wasmEvents:result.wasmEvents}));
  await fs.writeFile(path.join(output,'chrome.json'),JSON.stringify(report,null,2));await page.close();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}
finally{await fs.writeFile(path.join(output,'chrome.json'),JSON.stringify(report,null,2));await browser.close();}
