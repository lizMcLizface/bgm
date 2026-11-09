import {loadSixAssets} from './sixRoleBrowser';
import {sixSourceDag} from './pitchedFixture';
import {validateSixFixture} from './sixRoleFixture';
import {createWorkerRoute} from './workerBrowser';
import {verifyWorker} from './workerVerification';
import {createPoolRoute} from './poolBrowser';
import {verifyPool} from './poolVerification';
import {BUFFER_PROFILES,bufferProfile,profileOptions,profileDetails,profileSchedule,saveWorkerSession,loadWorkerSession} from './bufferProfiles';
import {assessDelivery,summarizeProfiles} from './profileMetrics';
const $=id=>document.getElementById(id),storageKey='bgm.modular-worker.fixture.v1',sessionKey='bgm.modular-worker.session.v1';
let assets,live,report,busy=false,comparing=false,comparisonCancelled=false;
const status=s=>$('state').textContent=s;
const json=x=>JSON.stringify(x,null,2)+'\n';
function controls(){for(const id of ['worker','serial','fallback','verify','pool','poolfallback','poolverify','profileverify','profiles','compare','save','load','rate','profile'])$(id).disabled=!assets||busy||comparing||!!live;$('stop').disabled=!live;$('stall').disabled=!live||comparing||!['worker','pool'].includes(live.route.executor.actual);}
function profileInfo(){const p=profileDetails($('profile').value,Number($('rate').value));$('profileinfo').textContent=`${p.delayMs.toFixed(2)} ms added buffering · ${p.poolBlocks} × ${p.blockFrames} frames · ${(p.poolPcmBytes/1024).toFixed(0)} KiB PCM for three workers. Live events must target the worker's next unrendered frame; dispatch time is additional.`;}
function emit(r){
  report=r;$('report').textContent=json(r);
  if(r.summaries){const table=document.createElement('table'),caption=document.createElement('caption'),head=document.createElement('tr');caption.textContent='48 kHz measured trials · warmups retained in raw report';table.append(caption);for(const label of ['Profile','Added ms','Passed / runs','Missed runs','Incomplete','Silent frames','Expired blocks','Process timing']){const th=document.createElement('th');th.textContent=label;head.append(th);}table.append(head);for(const s of r.summaries){const tr=document.createElement('tr');for(const value of [s.label,s.delayMs.toFixed(2),`${s.passedRuns} / ${s.measuredRuns}`,s.starvingRuns,s.incompleteRuns,s.missingFrames,s.expiredBlocks,s.processTiming.availableRuns?`${s.processTiming.availableRuns} measured`:s.actualPoolRuns?'Unavailable':'No pool data']){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}table.append(tr);}$('summary').replaceChildren(table);}
}
const metadata=()=>({version:1,fixtureId:assets.fixture.id,fixtureHash:assets.fixtureHash,graphVersion:assets.manifest.version,crossOriginIsolated:globalThis.crossOriginIsolated,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency});
document.addEventListener('visibilitychange',()=>{if(live)live.visibilityChanges.push({elapsedMs:performance.now()-live.startedAt,state:document.visibilityState});});
async function stop(){
  if(!live)return;const run=live;live=null;clearInterval(run.timer);
  let result;
  const base={...metadata(),method:'Finite live dry Rust DAG mix; analyser observations, not device loopback',profile:run.profile,phase:run.phase,iteration:run.iteration,rate:run.context.sampleRate,prepareMs:run.prepareMs,executor:run.route.executor,observedPeak:run.peak,rolePeaks:run.rolePeaks,observations:run.observations,stalls:run.stalls,visibilityStart:run.visibilityStart,visibilityEnd:document.visibilityState,visibilityChanges:run.visibilityChanges,baseLatency:run.context.baseLatency,outputLatency:run.context.outputLatency??null};
  try{
    run.gain.gain.setTargetAtTime(0,run.context.currentTime,.005);
    await new Promise(r=>setTimeout(r,30));
    const stats=await run.route.stats();
    const queue=stats.output.queue,transportPass=!queue||(run.stalls.length?queue.underrunFrames>0&&queue.recoveries>0:queue.underrunFrames===0),delivery=assessDelivery(stats,run.route.end,run.expectedEvents);
    result={...base,pass:run.peak>0&&run.rolePeaks.every(p=>p>0)&&!stats.error&&transportPass&&delivery.complete&&delivery.eventPass,delivery,stats};emit(result);
    status(stats.error?`Stopped after executor failure: ${stats.error}`:!delivery.complete?'Run stopped before the complete score was delivered.':!transportPass?`Finished with ${queue.underrunFrames} missing transport frames. Audio stopped.`:'Finite score finished. Audio stopped.');
  }catch(e){result={...base,pass:false,error:String(e),delivery:{complete:false,eventPass:false},stats:run.route.lastStats};emit(result);status(String(e));}finally{run.route.dispose();run.gain.disconnect();await run.context.close();controls();}
  run.resolve(result);
}
async function start(mode,forceFallback=false,{profile=$('profile').value,phase='manual',iteration=0}={}){
  const prepareStarted=performance.now();bufferProfile(profile);busy=true;controls();status(`Preparing ${mode} · ${profile} · ${phase} ${iteration||''}…`);const context=new AudioContext({sampleRate:Number($('rate').value)});let route;
  try{
    await context.resume();await context.suspend();
    const patch=sixSourceDag(assets.fixture,context.sampleRate);
    route=await (mode==='pool'?createPoolRoute:createWorkerRoute)(context,assets,patch,{mode,options:profileOptions(profile),forceFallback,onFinished:()=>stop().catch(e=>status(String(e)))});const prepareMs=performance.now()-prepareStarted;
    const gain=context.createGain();route.node.connect(gain,7);gain.connect(context.destination);
    const analyzers=Array.from({length:7},()=>context.createAnalyser()),buffers=analyzers.map(a=>{a.fftSize=2048;return new Float32Array(2048);});gain.connect(analyzers[0]);for(let i=0;i<6;i++)route.node.connect(analyzers[i+1],i);
    let resolve;const finished=new Promise(r=>resolve=r),run={context,route,gain,profile,phase,iteration,prepareMs,expectedEvents:patch.events.length,peak:0,rolePeaks:Array(6).fill(0),observations:0,stalls:[],resolve,finished,startedAt:performance.now(),visibilityStart:document.visibilityState,visibilityChanges:[]};live=run;
    run.timer=setInterval(()=>{
      analyzers.forEach((a,i)=>{a.getFloatTimeDomainData(buffers[i]);let peak=0;for(const v of buffers[i])peak=Math.max(peak,Math.abs(v));if(i===0)run.peak=Math.max(run.peak,peak);else run.rolePeaks[i-1]=Math.max(run.rolePeaks[i-1],peak);});run.observations++;
      try{route.check();}catch(e){status(String(e));stop().catch(e=>status(String(e)));}
    },100);
    status(`Playing ${route.executor.actual} · ${profile} · ${phase} ${iteration||''} · ${context.sampleRate} Hz · ${route.executor.bufferingLatencyMs.toFixed(2)} ms buffering${route.executor.fallbackReason?' · '+route.executor.fallbackReason:''}`);
    await context.resume();return finished;
  }catch(e){if(live?.route===route){clearInterval(live.timer);live=null;}route?.dispose();await context.close();throw e;}finally{busy=false;controls();}
}
function action(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){status(String(e));}finally{controls();}};}
action('worker',()=>start('worker'));action('serial',()=>start('serial'));action('fallback',()=>start('worker',true));action('stop',async()=>{if(comparing)comparisonCancelled=true;await stop();});
action('pool',()=>start('pool'));action('poolfallback',()=>start('pool',true));
action('stall',async()=>{const result=await live.route.stall(250);live.stalls.push(result);status('Injected 250 ms worker scheduling stall. Missing blocks are silent; source time keeps advancing.');});
async function verifyProfiles(mode,allProfiles=false){
  busy=true;controls();const rows=[],profiles=allProfiles?BUFFER_PROFILES:[bufferProfile($('profile').value)];
  try{for(const p of profiles)for(const rate of [44100,48000,96000]){status(`Comparing ${mode} PCM · ${p.id} · ${rate} Hz`);rows.push({profile:p.id,...await (mode==='pool'?verifyPool:verifyWorker)(assets,rate,{options:profileOptions(p.id)})});emit({...metadata(),pass:rows.every(r=>r.pass),method:'Consumer-paced eight-bus raw PCM/control versus same-cadence serial graph; fixed-1024 cadence diagnostics retained separately; no deadline claim',rows});}status(rows.every(r=>r.pass)?'Profile PCM checks passed. Audio stopped.':'Profile PCM check failed.');}finally{busy=false;}
}
action('verify',()=>verifyProfiles('worker'));action('poolverify',()=>verifyProfiles('pool'));action('profileverify',()=>verifyProfiles('pool',true));
action('compare',async()=>{comparing=true;comparisonCancelled=false;controls();const rows=[];try{$('rate').value='48000';profileInfo();for(const mode of ['worker','pool']){rows.push(await start(mode));if(comparisonCancelled)break;}emit({...metadata(),pass:!comparisonCancelled&&rows.length===2&&rows.every(r=>r.pass),cancelled:comparisonCancelled,method:'One finite run/path at 48 kHz, selected profile and same audible score; no controlled CPU attribution or speedup proof',rows});status(comparisonCancelled?'Live comparison cancelled. Audio stopped.':'One / three worker live comparison finished. Audio stopped.');}finally{comparing=false;}});
action('profiles',async()=>{
  comparing=true;comparisonCancelled=false;controls();const selected=$('profile').value,rate=$('rate').value,rows=[],schedule=profileSchedule(3);let error=null;
  const publish=()=>emit({...metadata(),pass:!error&&!comparisonCancelled&&rows.length===schedule.length&&rows.every(r=>r.pass&&r.executor.actual==='pool'),cancelled:comparisonCancelled,error,rate:48000,method:'Three-worker fixed plan, same full 17.5 s score: one full warmup/profile then three rotated measured repeats/profile at 48 kHz. Failures retained. Document visibility recorded. Not device loopback or a headroom guarantee.',schedule,rows,summaries:summarizeProfiles(rows,48000)});
  try{$('rate').value='48000';publish();for(const job of schedule){if(comparisonCancelled)break;$('profile').value=job.profile;profileInfo();const row=await start('pool',false,job);rows.push(row);publish();if(row.executor.actual!=='pool')throw Error('Pool unavailable; serial fallback retained and excluded from pool comparison');}}catch(e){error=String(e);}finally{$('profile').value=selected;$('rate').value=rate;profileInfo();comparing=false;publish();const failed=rows.filter(r=>!r.pass).length;status(comparisonCancelled?'Profile comparison cancelled. Audio stopped.':error?error:failed?`Profile comparison complete with ${failed} failed runs, including warmups. Audio stopped.`:'Profile comparison complete. Inspect retained results before choosing a profile.');}
});
action('save',()=>{localStorage.setItem(storageKey,json(assets.fixture));localStorage.setItem(sessionKey,saveWorkerSession(assets.fixture,$('profile').value,Number($('rate').value)));status('Pinned fixture and selected profile/rate saved. Audio stopped.');});
action('load',()=>{const saved=localStorage.getItem(sessionKey),session=saved?loadWorkerSession(saved,validateSixFixture):null,value=session?.fixture??validateSixFixture(JSON.parse(localStorage.getItem(storageKey)||'null'));if(json(value)!==json(assets.fixture))throw Error('Saved fixture differs from pinned fixture');if(session){$('profile').value=session.profile;$('rate').value=String(session.rate);}profileInfo();status('Pinned fixture/session restored. Audio stopped.');});
$('profile').onchange=profileInfo;$('rate').onchange=profileInfo;profileInfo();
controls();loadSixAssets().then(a=>{assets=a;controls();status('M3e / M3f / M3g worker prototype ready. Audio stopped.');}).catch(e=>status(String(e)));
