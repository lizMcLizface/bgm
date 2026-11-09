import {loadSixAssets} from './sixRoleBrowser';
import {sixSourceDag} from './pitchedFixture';
import {validateSixFixture} from './sixRoleFixture';
import {createWorkerRoute} from './workerBrowser';
import {verifyWorker} from './workerVerification';
import {createPoolRoute} from './poolBrowser';
import {verifyPool} from './poolVerification';
const $=id=>document.getElementById(id),storageKey='bgm.modular-worker.fixture.v1';
let assets,live,report,busy=false,comparing=false,comparisonCancelled=false;
const status=s=>$('state').textContent=s;
const json=x=>JSON.stringify(x,null,2)+'\n';
function controls(){for(const id of ['worker','serial','fallback','verify','pool','poolfallback','poolverify','compare','save','load','rate'])$(id).disabled=!assets||busy||comparing||!!live;$('stop').disabled=!live;$('stall').disabled=!live||!['worker','pool'].includes(live.route.executor.actual);}
function emit(r){report=r;$('report').textContent=json(r);}
async function stop(){
  if(!live)return;const run=live;live=null;clearInterval(run.timer);
  try{
    run.gain.gain.setTargetAtTime(0,run.context.currentTime,.005);
    await new Promise(r=>setTimeout(r,30));
    const stats=await run.route.stats();
    const queue=stats.output.queue,transportPass=!queue||(run.stalls.length?queue.underrunFrames>0&&queue.recoveries>0:queue.underrunFrames===0);
    emit({version:1,pass:run.peak>0&&run.rolePeaks.every(p=>p>0)&&!stats.error&&transportPass,method:'Finite live dry Rust DAG mix; analyser observations, not device loopback',fixtureId:assets.fixture.id,fixtureHash:assets.fixtureHash,graphVersion:assets.manifest.version,rate:run.context.sampleRate,executor:run.route.executor,observedPeak:run.peak,rolePeaks:run.rolePeaks,observations:run.observations,stalls:run.stalls,baseLatency:run.context.baseLatency,outputLatency:run.context.outputLatency??null,crossOriginIsolated:globalThis.crossOriginIsolated,stats});
    status(stats.error?`Stopped after executor failure: ${stats.error}`:!transportPass?`Finished with ${queue.underrunFrames} missing transport frames. Audio stopped.`:'Finite score finished. Audio stopped.');
  }catch(e){run.reject(e);throw e;}finally{run.route.dispose();run.gain.disconnect();await run.context.close();controls();}
  run.resolve(report);
}
async function start(mode,forceFallback=false){
  busy=true;controls();status(`Preparing ${mode} playback…`);const context=new AudioContext({sampleRate:Number($('rate').value)});let route;
  try{
    await context.resume();await context.suspend();
    route=await (mode==='pool'?createPoolRoute:createWorkerRoute)(context,assets,sixSourceDag(assets.fixture,context.sampleRate),{mode,forceFallback,onFinished:()=>stop().catch(e=>status(String(e)))});
    const gain=context.createGain();route.node.connect(gain,7);gain.connect(context.destination);
    const analyzers=Array.from({length:7},()=>context.createAnalyser()),buffers=analyzers.map(a=>{a.fftSize=2048;return new Float32Array(2048);});gain.connect(analyzers[0]);for(let i=0;i<6;i++)route.node.connect(analyzers[i+1],i);
    let resolve,reject;const finished=new Promise((r,j)=>{resolve=r;reject=j;}),run={context,route,gain,peak:0,rolePeaks:Array(6).fill(0),observations:0,stalls:[],resolve,reject,finished};live=run;
    run.timer=setInterval(()=>{
      analyzers.forEach((a,i)=>{a.getFloatTimeDomainData(buffers[i]);let peak=0;for(const v of buffers[i])peak=Math.max(peak,Math.abs(v));if(i===0)run.peak=Math.max(run.peak,peak);else run.rolePeaks[i-1]=Math.max(run.rolePeaks[i-1],peak);});run.observations++;
      try{route.check();}catch(e){status(String(e));stop().catch(e=>status(String(e)));}
    },100);
    status(`Playing ${route.executor.actual} · ${context.sampleRate} Hz · ${route.executor.bufferingLatencyMs.toFixed(2)} ms buffering${route.executor.fallbackReason?' · '+route.executor.fallbackReason:''}`);
    await context.resume();return finished;
  }catch(e){if(live?.route===route){clearInterval(live.timer);live=null;}route?.dispose();await context.close();throw e;}finally{busy=false;controls();}
}
function action(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){status(String(e));}finally{controls();}};}
action('worker',()=>start('worker'));action('serial',()=>start('serial'));action('fallback',()=>start('worker',true));action('stop',async()=>{if(comparing)comparisonCancelled=true;await stop();});
action('pool',()=>start('pool'));action('poolfallback',()=>start('pool',true));
action('stall',async()=>{const result=await live.route.stall(250);live.stalls.push(result);status('Injected 250 ms worker scheduling stall. Missing blocks are silent; source time keeps advancing.');});
action('verify',async()=>{busy=true;controls();const rows=[];try{for(const rate of [44100,48000,96000]){status(`Comparing real worker / serial Rust PCM · ${rate} Hz`);rows.push(await verifyWorker(assets,rate));emit({version:1,pass:rows.every(r=>r.pass),method:'Consumer-paced real Worker, eight stereo buses versus serial Wasm; not an audio deadline benchmark',fixtureId:assets.fixture.id,fixtureHash:assets.fixtureHash,graphVersion:assets.manifest.version,crossOriginIsolated:globalThis.crossOriginIsolated,rows});}status(rows.every(r=>r.pass)?'Worker PCM checks passed at all rates. Audio stopped.':'Worker comparison failed.');}finally{busy=false;}});
action('poolverify',async()=>{busy=true;controls();const rows=[];try{for(const rate of [44100,48000,96000]){status(`Comparing three-worker source pool / serial Rust PCM · ${rate} Hz`);rows.push(await verifyPool(assets,rate));emit({version:1,pass:rows.every(r=>r.pass),method:'Consumer-paced real three-worker source pool with Rust master; eight stereo buses versus serial Wasm; no deadline claim',fixtureId:assets.fixture.id,fixtureHash:assets.fixtureHash,graphVersion:assets.manifest.version,crossOriginIsolated:globalThis.crossOriginIsolated,rows});}status(rows.every(r=>r.pass)?'Pool PCM checks passed at all rates. Audio stopped.':'Pool comparison failed.');}finally{busy=false;}});
action('compare',async()=>{comparing=true;comparisonCancelled=false;controls();const rows=[];try{$('rate').value='48000';for(const mode of ['worker','pool']){rows.push(await start(mode));if(comparisonCancelled)break;}emit({version:1,pass:!comparisonCancelled&&rows.length===2&&rows.every(r=>r.pass),cancelled:comparisonCancelled,method:'Two finite foreground live paths at 48 kHz, one worker / three source workers with Rust master; same source score, audible processing and 4096-frame delay; one run each, not controlled CPU attribution or speedup proof',fixtureId:assets.fixture.id,fixtureHash:assets.fixtureHash,graphVersion:assets.manifest.version,rows});status(comparisonCancelled?'Live comparison cancelled. Audio stopped.':'One / three worker live comparison finished. Audio stopped.');}finally{comparing=false;}});
action('save',()=>{localStorage.setItem(storageKey,json(assets.fixture));status('Pinned fixture saved locally. Audio stopped.');});
action('load',()=>{const value=validateSixFixture(JSON.parse(localStorage.getItem(storageKey)||'null'));if(json(value)!==json(assets.fixture))throw Error('Saved fixture differs from pinned fixture');status('Pinned fixture restored. Audio stopped.');});
controls();loadSixAssets().then(a=>{assets=a;controls();status('M3e / M3f worker prototype ready. Audio stopped.');}).catch(e=>status(String(e)));
