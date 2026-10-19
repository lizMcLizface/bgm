// Explicit SIMD voice-batching experiment. Never replaces public kernels.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
const arg=(k,d)=>process.argv.find(s=>s.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const browserName=process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome',origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',output=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/dsp-simd/results');
const scope=arg('scope','kernels'),seconds=Number(arg('seconds',scope==='playback'?24:4)),repeats=Number(arg('repeats',3)),rate=Number(arg('rate',48000)),seed=Number(arg('seed',42));
if(!['kernels','graphs','playback'].includes(scope)||![1,3,5].includes(repeats)||![44100,48000,96000].includes(rate)||!Number.isFinite(seconds)||seconds<1||seconds>60||!Number.isInteger(seed)||seed<1||seed>2147483647)throw Error('Invalid scope, repetitions, rate, seed or duration.');
const artifacts=path.resolve(arg('artifacts','.tmp/dsp-simd'));
const fmOnly=process.argv.includes('--fm-only');
const builds=JSON.parse(await fs.readFile(path.join(artifacts,'builds.json'),'utf8')),normal={},candidate={};
for(const k of ['core','fm']){
 normal[k]=await fs.readFile('public/synth-lab/'+k+'.wasm');candidate[k]=await fs.readFile(path.join(artifacts,k+'.wasm'));const current=JSON.parse(await fs.readFile('public/synth-lab/'+(k==='core'?'build':k+'-build')+'.json','utf8'));
 if(!builds[k].simd||current.source!==builds[k].production.source||current.wasm!==builds[k].production.wasm||crypto.createHash('sha256').update(candidate[k]).digest('hex')!==builds[k].sha256)throw Error('Stale SIMD artifacts. Run node tools/buildSynthProfile.mjs --simd.');
}
if(fmOnly){if(scope==='kernels')throw Error('--fm-only is for graphs/playback.');candidate.core=normal.core;}
const scalarOnly=process.argv.includes('--scalar-only'),baselineFm=arg('baseline-fm','');
if(scalarOnly)candidate.fm=normal.fm;
const baseline=baselineFm?{path:baselineFm,sha256:crypto.createHash('sha256').update(await fs.readFile(baselineFm)).digest('hex')}:null;
if(baselineFm)normal.fm=await fs.readFile(baselineFm);
await fs.mkdir(output,{recursive:true});
const report={created:new Date().toISOString(),browser:null,cpu:os.cpus()[0]?.model,builds,protocol:{scope,fmOnly,scalarOnly,baseline,seconds:scope==='graphs'?8:seconds,repeats,rate:scope==='playback'?'AudioContext native rate, recorded per run':rate,seed,warmup:1,order:'Alternating scalar/SIMD; one foreground page at a time',quality:'Full synthesis, 2x FM where requested, no tail or patch changes',fluid:0},rows:[],errors:[],limits:'Desktop direct kernels/offline graphs. No hardware deadline, physical Pixel/Surface, locked-screen, thermal or cross-platform SIMD speedup certification. Sparse openings do not exercise all musical voices.'};
const browser=await puppeteer.launch({browser:browserName,executablePath:process.env.SYNTH_BROWSER_PATH??(browserName==='chrome'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'.tmp/browsers/firefox/win64-stable_158.0/core/firefox.exe'),headless:true,args:browserName==='chrome'?['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']:[],protocolTimeout:600000});report.browser=await browser.version();
const median=a=>{const sorted=a.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
async function save(){await fs.writeFile(path.join(output,browserName+'-'+scope+'.json'),JSON.stringify(report,null,2));}
async function page(version,url){
 const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(String(e)));await p.setRequestInterception(true);p.on('request',r=>{const match=new URL(r.url()).pathname.match(/^\/synth-lab\/(core|fm)\.wasm$/);void(match?r.respond({status:200,contentType:'application/wasm',body:(version?candidate:normal)[match[1]]}):r.continue()).catch(e=>report.errors.push(String(e)));});
 await p.evaluateOnNewDocument(()=>{window.__simdSources=[];const Native=AudioWorkletNode;window.AudioWorkletNode=class extends Native{constructor(context,name,options){const source=/calmbgm-(fm|subtractive)/.test(name);if(source)options={...options,processorOptions:{...options.processorOptions,auditStats:true}};super(context,name,options);if(source){const record={name,offline:Number.isFinite(context.length),frames:context.length,stats:[]};__simdSources.push(record);this.port.addEventListener('message',({data})=>{if(data.type==='stats')record.stats.push(data);});this.port.start();}}};localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');localStorage.setItem('bgm-wasm-performance','full');localStorage.setItem('bgm-performance',JSON.stringify({sharedReverb:true,reverb:'full'}));});await p.goto(origin+url);return p;
}
try{
 if(scope==='kernels'){
  const p=await page(0,'/tools/synth-lab.html');await p.exposeFunction('__simdProgress',row=>console.log(JSON.stringify(row)));
  const rows=await p.evaluate(async({normal,candidate,seconds,repeats,rate,requested})=>{
   const api=await import('/src/synth-lab/profileDsp.js'),modules={};for(const k of ['core','fm'])modules[k]=await Promise.all([normal[k],candidate[k]].map(x=>WebAssembly.compile(Uint8Array.from(atob(x),c=>c.charCodeAt(0)))));
   const all=api.DSP_CASES.filter(c=>['core','fm'].includes(c.kernel)),cases=requested.length?all.filter(c=>requested.includes(c.id)):all;if(!cases.length||requested.some(id=>!all.some(c=>c.id===id)))throw Error('Unknown source fixture');const rows=[];
   for(const spec of cases){const f=api.dspFixture(spec,{rate,seconds}),validation=modules[f.kernel].map(m=>{const runner=api.prepareDsp(m,f),r=runner.run({capture:true});return {...r,simdFrames:runner.simdFrames()};}),parity=api.compareDsp(validation[0].pcm,validation[1].pcm),runs=[[],[]];
    if(parity.nonFinite||parity.maxDifference!==0||JSON.stringify(validation[0].stats)!==JSON.stringify(validation[1].stats))throw Error('PCM/state mismatch: '+spec.id);
    for(let repeat=0;repeat<repeats;repeat++)for(const k of repeat%2?[1,0]:[0,1])runs[k].push(api.prepareDsp(modules[f.kernel][k],f).run().ms);
    const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],[before,after]=runs.map(median),row={id:spec.id,kernel:f.kernel,fixture:f,before,after,reduction:1-after/before,runs,parity,simdFrames:validation[1].simdFrames,stats:validation[1].stats};rows.push(row);await __simdProgress({id:row.id,before,after,reduction:row.reduction,simdFrames:row.simdFrames});
   }return rows;
  },{normal:Object.fromEntries(Object.entries(normal).map(([k,b])=>[k,b.toString('base64')])),candidate:Object.fromEntries(Object.entries(candidate).map(([k,b])=>[k,b.toString('base64')])),seconds,repeats,rate,requested:arg('cases','').split(',').filter(Boolean)});report.rows=rows;await p.close();
 }else{
  const ids=arg('cases',scope==='graphs'?'sub-voices,sub-layers,fm-six,mixed-acoustic':'glass-conservatory,tine-and-tide,lantern-circuit').split(','),pages=[];
  for(let version=0;version<2;version++){
   const p=await page(version,scope==='graphs'?'/tools/stress.html':'/?preset='+ids[0]+'&wasm=1&intro=short');pages.push(p);
  }
  for(const id of ids){
   for(const p of pages){
    await p.bringToFront();
    if(scope==='graphs')await p.evaluate(async rate=>{const {STRESS_CASES}=await import('/src/synth-lab/stressPlan.js'),{runStressCase}=await import('/src/synth-lab/stressRunner.js');window.__simdRun=async id=>{const spec=STRESS_CASES.find(c=>c.id===id);if(!spec)throw Error('Unknown graph '+id);const r=await runStressCase({...spec,config:{...spec.config,rate}},{repeats:1,warmup:false});if(r.summary.nonFinite||r.summary.silent||r.summary.clipped||r.summary.late||r.summary.dropped||r.summary.missingStats)throw Error('Invalid graph output '+id);return {ms:r.summary.renderMs,summary:r.summary,manifest:r.manifest};};},rate);
    else{
     await p.goto(origin+'/?preset='+encodeURIComponent(id)+'&wasm=1&intro=short');await p.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady&&['lead','counter','pad','bass'].every(r=>__generator.roles[r].instrument.voice),{timeout:60000});
     await p.evaluate(async({seconds,seed})=>{const g=__generator;g.set('seed',seed);await g.AC.suspend();const {renderPcm,planNotes}=await import('/src/app/engine/render.js');window.__simdRun=async()=>{const sourceFrom=__simdSources.length;let sum=0,count=0,peak=0;const started=performance.now(),r=await renderPcm(g,seconds,{onChunk:a=>{for(const x of a){sum+=x*x;count++;peak=Math.max(peak,Math.abs(x));}}}),ms=performance.now()-started;await new Promise(r=>setTimeout(r,25));if(!count||!Number.isFinite(sum)||sum===0||peak>=32766)throw Error('Invalid playback PCM');return {ms,sourceStats:__simdSources.slice(sourceFrom).filter(n=>n.offline),frames:r.frames,rate:r.sampleRate,rms:Math.sqrt(sum/count)/32767,peak:peak/32767,noteCounts:planNotes(g,Object.fromEntries(Object.keys(g.roles).map(k=>[k,true])),seconds,false).notes.reduce((m,n)=>(m[n.role]=(m[n.role]??0)+1,m),{})};};},{seconds,seed});
    }
   }
   for(const p of pages){await p.bringToFront();await p.evaluate(id=>__simdRun(id),id);}const runs=[[],[]];
   for(let repeat=0;repeat<repeats;repeat++)for(const k of repeat%2?[1,0]:[0,1]){await pages[k].bringToFront();runs[k].push(await pages[k].evaluate(id=>__simdRun(id),id));}
   const [before,after]=runs.map(a=>median(a.map(r=>r.ms))),row={id,before,after,reduction:1-after/before,runs};report.rows.push(row);await save();console.log(JSON.stringify({id,before,after,reduction:row.reduction}));
  }for(const p of pages)await p.close();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await save();await browser.close();}
