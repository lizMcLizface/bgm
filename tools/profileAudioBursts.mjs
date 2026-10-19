// Native render-burst attribution for the actual main-page graph. No runtime source mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const seconds=Number(arg('seconds',10)),repeats=Number(arg('repeats',3)),seed=Number(arg('seed',293169949));
const modes=arg('modes','full,no-perc-room,no-perc').split(','),room=arg('reverb','full');
const lookahead=arg('lookahead',null)===null?null:Number(arg('lookahead'));
if(lookahead!==null&&(!Number.isFinite(lookahead)||lookahead<.1||lookahead>45))throw Error('Invalid diagnostic lookahead');
if(!Number.isFinite(seconds)||seconds<5||seconds>60||![1,3,5].includes(repeats)||!Number.isInteger(seed)||seed<1||seed>2147483647||!['full','light'].includes(room)||modes.some(v=>!['full','no-perc-room','no-perc','wasm-perc','808-perc'].includes(v)))throw Error('Invalid attribution protocol');
const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',params=new URLSearchParams(arg('query','preset='+encodeURIComponent(arg('preset','tine-and-tide'))));
for(const key of ['wasm','perf','mediaHelper'])params.set(key,'1');const query=params.toString();
if(process.argv.includes('--help')){console.log('Actual-graph native audio burst attribution. --preset=tine-and-tide --seed=293169949 --seconds=10 --repeats=1|3|5 --reverb=full|light --modes=full,no-perc-room,no-perc,wasm-perc,808-perc; optional --query=ENCODED_QUERY --lookahead=0.4..45. Requires dev server (__generator). Diagnostic removals change sound; a short fixed lookahead is NOT a locked-playback recommendation.');process.exit(0);}
const dir=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/audio-burst-attribution');await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const report={created:new Date().toISOString(),protocol:{seconds,repeats,seed,modes,room,origin,query,phonePolicy:true,lookahead,requestedBuffer:.1,warmupSeconds:6,synthesis:'Full/2x; Perf; helper on by default; diagnostic removals are not proposed production settings'},versions:JSON.parse(await fs.readFile('src/synth-lab/kernelVersions.json','utf8')),errors:[],rows:[],limits:'Exploratory desktop native render spans on actual graph. Diagnostic removal changes sound, not proposed production settings. Audio thread CPU spans with trace overhead; no physical Android deadline certification.'};
try{
 for(let repeat=0;repeat<repeats;repeat++)for(const mode of [...modes.slice(repeat%modes.length),...modes.slice(0,repeat%modes.length)]){
  const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
  await p.evaluateOnNewDocument(room=>{
   Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (Linux; Android 17; Pixel 8) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
   localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');localStorage.setItem('bgm-wasm-performance','full');localStorage.setItem('bgm-performance',JSON.stringify({sharedReverb:true,reverb:room}));localStorage.setItem('bgm-audio-buffer','0.1');
  },room);
  const testParams=new URLSearchParams(query);if(mode==='wasm-perc'||mode==='808-perc')testParams.set('perc',mode==='wasm-perc'?'wasm':'808');else testParams.delete('perc');
  await p.goto(origin+'/?'+testParams);
  await p.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady&&['lead','counter','pad','bass'].every(r=>__generator.roles[r].instrument.voice),{timeout:60000});
  await p.evaluate(({mode,seed,lookahead})=>{
   const g=__generator;g.set('seed',seed);
   if(lookahead!==null)Object.defineProperty(g.transport,'lookahead',{get:()=>lookahead});
   if(mode==='no-perc-room'||mode==='no-perc'){const d=g.roles.perc.instrument,kit=structuredClone(d.kit);kit.room=0;if(mode==='no-perc')for(const v of Object.values(kit))if(v&&typeof v==='object'&&'on'in v)v.on=false;d.setKit(kit);}
  },{mode,seed,lookahead});
  await p.click('.gen-play');await new Promise(r=>setTimeout(r,5000));const blank=await browser.newPage();await blank.goto('about:blank');await blank.bringToFront();await new Promise(r=>setTimeout(r,1000));
  const cdp=await p.createCDPSession();await cdp.send('Tracing.start',{categories:'audio,webaudio',transferMode:'ReturnAsStream'});
  const before=await p.evaluate(()=>({wall:Date.now(),audio:__generator.AC.currentTime}));await new Promise(r=>setTimeout(r,seconds*1000));const after=await p.evaluate(()=>({wall:Date.now(),audio:__generator.AC.currentTime}));
  const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;let raw='';for(;;){const r=await cdp.send('IO.read',{handle:stream});raw+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});await fs.writeFile(dir+'/'+mode+'-'+repeat+'.trace.json',raw);
  const events=JSON.parse(raw).traceEvents,spans=events.filter(e=>e.ph==='X'&&e.name==='AudioDestination::RequestRender');const durations=spans.map(e=>e.dur/1000).sort((a,b)=>a-b);
  if(!spans.length||spans.some(e=>!Number.isFinite(e.tdur)))throw Error('Missing native render CPU spans');
  const row={mode,repeat,before,after,count:spans.length,cpuMs:spans.reduce((a,e)=>a+(e.tdur??0)/1000,0),wallMs:durations.reduce((a,b)=>a+b,0),p99:durations[Math.floor(durations.length*.99)],max:durations.at(-1),graph:await p.evaluate(()=>({settings:__generator.settings,baseLatency:__generator.AC.baseLatency,roleNames:Object.fromEntries(Object.entries(__generator.roles).map(([k,r])=>[k,r.presetName])),kit:__generator.roles.perc.instrument.kit,sources:__generator.roles.perc.instrument.sources.size,percussionEngine:__generator.percussionEngine,percussionStats:__generator.roles.perc.instrument.stats,rooms:__generator.wasmRoomPool.diagnostics,transport:__generator.transport.diagnostics}))};report.rows.push(row);console.log(JSON.stringify({mode,repeat,count:row.count,cpuMs:row.cpuMs,wallMs:row.wallMs,p99:row.p99,max:row.max}));await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await p.close();await blank.close();
 }
 const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];report.medians=Object.fromEntries(modes.map(mode=>[mode,median(report.rows.filter(r=>r.mode===mode).map(r=>r.cpuMs/(r.after.audio-r.before.audio)))]));
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
