import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import {summarizeWorkletTrace} from './workletTraceSummary.mjs';
import {wasmCodeHash} from './wasmCodeHash.mjs';
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',output=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/playback-profile');
const comparePool=process.argv.includes('--compare-pool');
const sharedRooms=arg('shared','0')==='1',oldSources=arg('old-sources','');
const seed=Number(arg('seed',42));
const seconds=Number(arg('seconds',24)),repeats=Number(arg('repeats',3)),presets=arg('presets','glass-conservatory,tine-and-tide,lantern-circuit').split(','),modes=arg('modes','full,no-colour,linear-envelopes,no-rooms,no-inserts,dry').split(',');
if(seconds<8||seconds>60||!Number.isFinite(seconds)||!Number.isInteger(seed)||seed<1||seed>2147483647||![1,3,5].includes(repeats)||presets.some(x=>!['glass-conservatory','tine-and-tide','lantern-circuit'].includes(x))||modes.some(x=>!['full','no-colour','linear-envelopes','no-rooms','no-inserts','dry'].includes(x)))throw Error('Invalid preset, mode, seed or duration/repetition count.');
if(comparePool&&(!oldSources||!sharedRooms))throw Error('Pool comparison requires --shared=1 and captured --old-sources.');
await fs.mkdir(output,{recursive:true});
const builds={},named={};for(const k of ['core','fm','effects','inserts']){const normal=await fs.readFile('public/synth-lab/'+k+'.wasm');builds[k]=JSON.parse(await fs.readFile('public/synth-lab/'+(k==='core'?'build':k+'-build')+'.json'));if(process.argv.includes('--trace')){named[k]=await fs.readFile('.tmp/dsp-profile/'+k+'.wasm');if(wasmCodeHash(normal)!==wasmCodeHash(named[k]))throw Error('Rebuild named artifacts: '+k);}}
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:600000});
const report={created:new Date().toISOString(),browser:await browser.version(),cpu:os.cpus()[0]?.model,builds,protocol:{seconds,repeats,seed,modes,sharedRooms,oldSources,comparePool,warmup:1,fluid:0,quality:'Full synthesis and full rooms. Ablations are diagnostic changes to the sound, not production recommendations.',timing:'Main-page offline exports including planning, graph creation, DSP, PCM packing; sequential modes, rotating order. Sampling is a separate page/run.'},rows:[],profiles:[],errors:[],limits:'Desktop offline wall time and active V8 sampled weights. Not physical Pixel/Surface, thermal, hardware deadline or locked-screen certification. Native Web Audio DSP is not resolved by V8 profiles.'};
async function open(preset,sampled=false,original=Boolean(oldSources)){
 const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
 if(sampled||(oldSources&&original)){await p.setRequestInterception(true);p.on('request',r=>{const pathname=new URL(r.url()).pathname;
  const originals={'/src/labs/voice.js':'src_labs_voice.js','/src/app/engine/wasminstrument.js':'src_app_engine_wasmInstrument.js','/src/app/generator.js':'src_app_Generator.js','/src/app/engine/render.js':'src_app_engine_render.js'};
  const oldFile=original&&oldSources&&originals[pathname.toLowerCase()];if(oldFile){void fs.readFile(path.join(oldSources,oldFile)).then(body=>r.respond({status:200,contentType:'application/javascript',body}));return;}
  const m=sampled&&new URL(r.url()).pathname.match(/^\/synth-lab\/(core|fm|effects|inserts)\.wasm$/);void(m?r.respond({status:200,contentType:'application/wasm',body:named[m[1]]}):r.continue());});}
 await p.evaluateOnNewDocument(sharedRooms=>{
  localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');localStorage.setItem('bgm-wasm-performance','full');localStorage.setItem('bgm-performance',JSON.stringify({reverb:'full',sharedReverb:sharedRooms}));
  window.__nodes=[];const Native=window.AudioWorkletNode;window.AudioWorkletNode=class extends Native{
   constructor(c,name,options){if(options?.processorOptions&&/calmbgm-(fm|subtractive)/.test(name))options={...options,processorOptions:{...options.processorOptions,auditStats:true}};super(c,name,options);const o=options?.processorOptions??{},record={name,offline:Number.isFinite(c.length),sampleRate:c.sampleRate,contextFrames:c.length,events:o.events,parameters:o.parameters,patch:o.patch,stats:[],errors:[]};window.__nodes.push(record);this.port.addEventListener('message',({data})=>{if(data.type==='stats')record.stats.push(data);if(data.type==='error')record.errors.push(data);});this.port.start();}
  };
 },sharedRooms);
 await p.goto(origin+'/?preset='+preset+'&wasm=1&intro=short');await p.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady&&['lead','pad','counter','bass'].every(r=>__generator.roles[r].instrument.voice),{timeout:60000});
 await p.evaluate(async seed=>{
  const g=__generator;g.set('seed',seed);await g.AC.suspend();const {WASM_VOICES}=await import('/src/synth-lab/voiceLibrary.js'),{renderPcm}=await import('/src/app/engine/render.js'),{defaultInserts}=await import('/src/synth-lab/insertsConfig.js');const saved=WASM_VOICES.map(v=>structuredClone(v.patch));
  window.__exportProfile=async(mode,seconds)=>{
   for(let i=0;i<WASM_VOICES.length;i++){const v=WASM_VOICES[i];v.patch=structuredClone(saved[i]);const p=v.patch,lanes=v.kind==='fm'?[p.global]:p.layers;
    if(mode==='no-colour')for(const l of lanes)Object.assign(l,{breath:0,bow:0,formant:0,body:0});
    if(mode==='no-rooms')Object.assign(p.effects,{reverb:0,delayToReverb:0});
    if(mode==='dry')Object.assign(p.effects,{dry:1,reverb:0,delay:0,delayToReverb:0,bypass:1});
    if(mode==='no-inserts'||mode==='dry')p.inserts=defaultInserts();
    if(mode==='linear-envelopes'){if(v.kind==='fm')for(const o of p.operators)Object.assign(o,{attackCurve:1,decayCurve:1,releaseCurve:1});else for(const l of p.layers)for(const k of Object.keys(l))if(/Curve$/.test(k))l[k]=1;}
   }
   const from=__nodes.length;let sum=0,count=0,peak=0;const start=performance.now(),info=await renderPcm(g,seconds,{onChunk:a=>{for(const x of a){sum+=x*x;count++;peak=Math.max(peak,Math.abs(x));}}}),ms=performance.now()-start;await new Promise(r=>setTimeout(r,25));
   return {mode,ms,frames:info.frames,rate:info.sampleRate,peak:peak/32767,rms:Math.sqrt(sum/count)/32767,nodes:__nodes.slice(from).filter(n=>n.offline),settings:{quickIntro:g.quickIntro,sections:g.settings.sections,muted:g.settings.muted},roles:Object.fromEntries(Object.entries(g.roles).map(([k,r])=>[k,{name:r.presetName,polyphony:r.instrument.polyphony}]))};
  };
 },seed);return p;
}
async function save(){await fs.writeFile(path.join(output,'chrome.json'),JSON.stringify(report,null,2));}
try{for(const preset of presets){
 if(comparePool){
  const pages=[await open(preset,false,true),await open(preset,false,false)],runs=[[],[]];
  for(const p of pages){await p.bringToFront();await p.evaluate(s=>__exportProfile('full',s),seconds);}
  for(let repeat=0;repeat<repeats;repeat++)for(const k of repeat%2?[1,0]:[0,1]){await pages[k].bringToFront();const r=await pages[k].evaluate(s=>__exportProfile('full',s),seconds);if(!Number.isFinite(r.rms)||r.rms<=0||r.peak>=.99||r.nodes.some(n=>n.errors.length))throw Error('Bad comparison output');runs[k].push(r);console.log(JSON.stringify({preset,repeat,version:k?'pooled':'previous',ms:r.ms,rooms:r.nodes.filter(n=>n.name==='calmbgm-effects').length,rms:r.rms,peak:r.peak}));}
  const median=a=>a.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(a.length/2)],before=median(runs[0]),after=median(runs[1]);
  report.rows.push({preset,before,after,reduction:1-after/before,runs});await save();console.log(JSON.stringify({preset,before,after,reduction:1-after/before}));for(const p of pages)await p.close();continue;
 }
 const p=await open(preset),rows=[];for(const mode of modes)await p.evaluate(({mode,seconds})=>__exportProfile(mode,seconds),{mode,seconds});
 for(let repeat=0;repeat<repeats;repeat++)for(const mode of [...modes.slice(repeat%modes.length),...modes.slice(0,repeat%modes.length)]){const r=await p.evaluate(({mode,seconds})=>__exportProfile(mode,seconds),{mode,seconds});if(!Number.isFinite(r.rms)||r.rms<=0||r.peak>=.99||r.nodes.some(n=>n.errors.length))throw Error('Bad graph output');rows.push(r);console.log(JSON.stringify({preset,repeat,mode,ms:r.ms,nodes:r.nodes.map(n=>({name:n.name,peakActive:Math.max(0,...n.stats.map(s=>s.peakActive??s.active??0))}))}));}
 const summary=Object.fromEntries(modes.map(mode=>{const times=rows.filter(r=>r.mode===mode).map(r=>r.ms).sort((a,b)=>a-b);return [mode,times[Math.floor(times.length/2)]];}));report.rows.push({preset,summary,runs:rows});await save();await p.close();console.log(JSON.stringify({preset,summary}));
 if(process.argv.includes('--trace')){const q=await open(preset,true);await q.evaluate(s=>__exportProfile('full',s),seconds);const cdp=await q.createCDPSession();await cdp.send('Tracing.start',{categories:'v8,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires,webaudio,audio',transferMode:'ReturnAsStream'});let measurement,raw='';try{measurement=await q.evaluate(s=>__exportProfile('full',s),seconds);}finally{const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;for(;;){const r=await cdp.send('IO.read',{handle:stream});raw+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});}await fs.writeFile(path.join(output,preset+'.trace.json'),raw);const summary=summarizeWorkletTrace(JSON.parse(raw)),profiles=[];for(const [i,p]of summary.profiles.entries()){const {profile,...info}=p;const file=preset+'-'+i+'.cpuprofile';await fs.writeFile(path.join(output,file),JSON.stringify(profile));profiles.push({...info,file});}report.profiles.push({preset,measurement,profiles});await save();await q.close();}
 }if(report.errors.length)throw Error(report.errors.join('\n'));}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await save();await browser.close();}
