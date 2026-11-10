import {compileWorkbenchSource,compileWorkbenchSet,compileWorkbenchAudition,WORKBENCH_SOURCE_ROLES,hashWorkbenchPlan} from './workbenchPlan';
import {loadGraphAssets} from './graphAssets';
import {createWorkerRoute} from './workerBrowser';
import {newListeningId} from './listeningRecord';
export {createWorkbenchTestSuite} from './workbenchTestSuite';
export function createWorkbenchPreview({host,project,part,role,roles=null,mutedRoles=[],bpm,muted=false,audition=false,mode='serial',workerPoolBlocks=6,silentProbe=false,silentFullRun=false,compileSetPlan=null,onState=()=>{},onDone=()=>{},loadAssets=loadGraphAssets,makeRoute=createWorkerRoute,compilePlan=compileWorkbenchSource}){
 let closed=false,finishing=null,route=null,timer=null,assets=null,plan=null,probe=null,sourceHash=Promise.resolve(null),armed=false;const activations=[],leases=[],gains=[],bindings=[],excludedRoles=[],stemPeaks={},requestedRoles=Array.isArray(roles)?roles.slice():roles,taps=[],peaks={source:0,channel:0,master:0},context=host.context,runId=newListeningId(),startedAtUtc=new Date().toISOString(),browserUserAgent=globalThis.navigator?.userAgent??null;
 const checkLeases=()=>leases.forEach(l=>l.assertCurrent());
 function cleanup(){clearInterval(timer);route?.dispose();for(const g of gains)g.disconnect();for(const tap of taps){try{tap.from.disconnect(tap.node);}catch{}tap.node.disconnect();}for(const release of activations)release();for(const l of leases)l.release();}
 async function finish(reason='stopped',error=null){
  if(finishing)return finishing;if(closed)return null;closed=true;onState('stopping');clearInterval(timer);for(const g of gains)g.gain.setTargetAtTime(0,context.currentTime,.005);
  finishing=(async()=>{let stats=null;try{if(gains.length&&reason!=='completed')await new Promise(resolve=>setTimeout(resolve,30));if(route)stats=await route.stats();if(reason==='completed')checkLeases();}catch(e){error??=String(e);}finally{cleanup();}
   const output=stats?.output,engine=stats?.worker?.graph??output?.serial?.graph??output?.serial,complete=!silentProbe&&!silentFullRun&&!!plan&&output?.sourceFrame===plan.endFrame&&engine?.frame===plan.endFrame,eventPass=!!plan&&engine?.applied===plan.graph.events.length&&!engine?.late&&!engine?.overflow;
   const stems=(plan?.sources??(plan?.role==='perc'?[plan]:null))?.map(s=>({role:s.role,sourceId:s.sourceId,kind:s.kind,noteCount:s.noteCount,...(s.role==='perc'?{hitCount:s.hitCount,audibleHitCount:s.audibleHitCount,kitVoice:s.kitVoice,hitIdPolicy:s.hitIdPolicy,expression:s.expression}:{}),peaks:{...stemPeaks[s.role]}}))??null,stemPass=!stems||stems.every(s=>!(s.noteCount+(s.audibleHitCount??0))||s.peaks.source>0&&s.peaks.channel>0);
   const report={version:1,kind:'all.owned-source-preview',hostRevision:'all-preview-delivery-v11',material:audition?'voice-audition':'captured-score',audition:plan?.audition??null,diagnosticProbe:probe?{...probe,complete:reason==='probe-completed'&&output?.sourceFrame===probe.targetFrames}:null,sourceFingerprint:await sourceHash,runId,browserUserAgent,sampleRate:context.sampleRate,scope:'Captured finite source stems through existing per-role FX/mixer and shared master; channel/master peaks may include legacy keyboard/shared tails, not isolated wet PCM or physical listening.',role:roles===null?role:(plan?.role??'source-set'),requestedRoles,excludedRoles,stems,mode,startedAtUtc,completedAtUtc:new Date().toISOString(),reason,error:error??stats?.error??null,engineVersion:assets?.manifest.version??null,executor:route?.executor??null,plan,peaks:{...peaks},stats,complete,eventPass,pass:reason==='completed'&&!error&&!stats?.error&&complete&&eventPass&&stemPass&&!(output?.queue?.underrunFrames)&&Object.values(peaks).every(p=>p>0)};
   onState('stopped');onDone(report);return report;
  })();return finishing;
 }
 const ready=(async()=>{await Promise.resolve();try{
  if(context.sampleRate!==48000)throw Error('Rust source preview requires an existing 48 kHz AudioContext.');
  if(![6,8,12].includes(workerPoolBlocks))throw Error('Rust source preview worker capacity must be six, eight or twelve blocks.');
  if(typeof silentFullRun!=='boolean'||silentFullRun&&silentProbe)throw Error('Full silent run and recovery probe are separate modes.');
  if(typeof silentProbe!=='boolean'||silentProbe&&mode!=='worker')throw Error('Silent delivery probe requires the worker executor.');
  if(typeof audition!=='boolean'||audition&&roles===null)throw Error('Voice audition requires an explicit pitched set.');
  if(roles!==null){
   if(!Array.isArray(requestedRoles)||!requestedRoles.length||requestedRoles.length>6||new Set(requestedRoles).size!==requestedRoles.length||requestedRoles.some(r=>!WORKBENCH_SOURCE_ROLES.includes(r))||!Array.isArray(mutedRoles))throw Error('Select one to six distinct source roles.');
   for(const r of requestedRoles){if(mutedRoles.includes(r)){excludedRoles.push({role:r,reason:'muted or excluded by solo'});continue;}let l;try{l=host.openSourceStem(r,()=>{void finish('host-closed');});}catch(e){throw Error(`${r}: ${e.message}`);}leases.push(l);bindings.push({role:r,sourceId:WORKBENCH_SOURCE_ROLES.indexOf(r)+1,lease:l});}
   if(!bindings.length)throw Error('No selected pitched roles are audible under mute/solo.');
   plan=(compileSetPlan??(audition?compileWorkbenchAudition:compileWorkbenchSet))({project,part,bpm,sources:bindings.map(b=>({role:b.role,source:b.lease,tune:b.lease.tune}))});
  }else{const l=host.openSourceStem(role,()=>{void finish('host-closed');});leases.push(l);bindings.push({role,sourceId:role==='perc'?6:1,lease:l});plan=compilePlan({project,part,role,bpm,source:l,tune:l.tune,muted});}
  if(silentProbe||silentFullRun)probe={muted:true,...(silentFullRun?{fullRun:true}:{}),targetFrames:silentFullRun||audition?plan.endFrame:Math.min(plan.endFrame,96000)};
  sourceHash=hashWorkbenchPlan(plan);
  assets=await loadAssets();if(closed)return null;checkLeases();
  route=await makeRoute(context,assets,plan.graph,{mode,options:{blockFrames:512,poolBlocks:mode==='worker'?workerPoolBlocks:6,scheduling:'message'},sourceIds:bindings.map(b=>b.sourceId),endFrame:probe?.targetFrames??plan.endFrame,startPaused:true,stopOnUnderrun:!silentProbe,deliveryDiagnostics:true,onFinished:d=>{if(armed)void finish(d?.reason==='delivery-gap'?'delivery-gap':d?.reason==='failed'?'error':silentProbe||silentFullRun?'probe-completed':'completed',d?.reason==='delivery-gap'?'One-worker delivery missed audio frames. Use Serial reference; the preview has stopped.':null);}});
  if(closed){route.dispose();return null;}checkLeases();route.check();
  if(silentProbe&&route.executor.actual!=='worker')throw Error('Silent delivery probe needs an actual worker, not a startup fallback.');
  if(silentFullRun&&route.executor.actual!==mode)throw Error('Full source check requires its requested executor; no startup fallback.');
  const tap=(name,from,r=null)=>{const node=context.createAnalyser();node.fftSize=2048;from.connect(node);taps.push({name,from,role:r,node,data:new Float32Array(2048)});};
  for(const b of bindings){if(b.lease.activate)activations.push(b.lease.activate());const gain=context.createGain();gains.push(gain);gain.gain.value=silentProbe||silentFullRun?0:1;route.node.connect(gain,b.sourceId-1);gain.connect(b.lease.input);stemPeaks[b.role]={source:0,channel:0};tap('source',gain,b.role);tap('channel',b.lease.channelOutput,b.role);}tap('master',bindings[0].lease.masterOutput);
  const observe=()=>{for(const t of taps){let peak=0;t.node.getFloatTimeDomainData(t.data);for(const v of t.data)peak=Math.max(peak,Math.abs(v));peaks[t.name]=Math.max(peaks[t.name],peak);if(t.role)stemPeaks[t.role][t.name]=Math.max(stemPeaks[t.role][t.name],peak);}try{checkLeases();}catch(e){void finish('source-changed',String(e));return;}try{route.check();}catch(e){void finish('error',String(e));}};
  timer=setInterval(observe,100);armed=true;route.start();onState('playing');return route.executor;
 }catch(e){await finish('error',String(e));throw e;}})();
 return {ready,stop:()=>finish('stopped'),get closed(){return closed;}};
}

// One lease and one serialized source/score capture, two fresh sequential owners.
// The ordinary controller still owns all per-trial audio cleanup and guarding.
export function createWorkbenchCapacityComparison({host,project,part,role,bpm,muted=false,comparisonOrder='six-first',onState=()=>{},onDone=()=>{},loadAssets=loadGraphAssets,makeRoute=createWorkerRoute}){
 let closed=false,finishing=null,active=null,lease=null,assets=null,plan=null,order=null,capacities=[],sourceHash=Promise.resolve(null),readyResolve,readyReject;
 const trials=[],context=host.context,runId=newListeningId(),startedAtUtc=new Date().toISOString(),ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const retain=r=>{if(r&&!trials.some(t=>t.runId===r.runId))trials.push(r);};
 function finish(reason='stopped',error=null){
  if(finishing)return finishing;closed=true;onState('stopping');
  finishing=(async()=>{try{retain(await active?.stop());}catch(e){error??=String(e);}finally{lease?.release();}
   const fingerprint=await sourceHash,complete=reason==='comparison-completed'&&trials.length===2&&trials.every(t=>t.diagnosticProbe?.complete&&!t.error&&t.executor?.actual==='worker');
   const report={kind:'all.owned-source-capacity-comparison',version:1,hostRevision:'all-preview-delivery-v11',runId,startedAtUtc,completedAtUtc:new Date().toISOString(),browserUserAgent:globalThis.navigator?.userAgent??null,sampleRate:context.sampleRate,role,engineVersion:assets?.manifest.version??null,sourceFingerprint:fingerprint,reason,error,comparison:{muted:true,order,capacities,targetFrames:plan?Math.min(plan.endFrame,96000):null,complete,sameCapturedInput:!!plan,fingerprintsMatch:fingerprint&&trials.length?trials.every(t=>t.sourceFingerprint===fingerprint):null},trials,complete:false,pass:false};
   readyResolve(null);onState('stopped');onDone(report);return report;
  })();return finishing;
 }
 void (async()=>{await Promise.resolve();try{
  if(role==='perc')throw Error('Capacity comparison currently requires a pitched source.');
  if(closed)return;if(!['six-first','twelve-first'].includes(comparisonOrder))throw Error('Invalid Rust capacity comparison order.');
  order=comparisonOrder;capacities=order==='six-first'?[6,12]:[12,6];
  if(context.sampleRate!==48000)throw Error('Rust source comparison requires an existing 48 kHz AudioContext.');
  lease=host.openSourceStem(role,()=>{void finish('host-closed');});plan=compileWorkbenchSource({project,part,role,bpm,source:lease,tune:lease.tune,muted});
  const captured=JSON.stringify(plan);sourceHash=hashWorkbenchPlan(plan);assets=await loadAssets();if(closed)return;lease.assertCurrent();
  for(const [index,poolBlocks]of capacities.entries()){
   if(closed)return;lease.assertCurrent();const progress={trial:index+1,trials:2,poolBlocks};onState('preparing',progress);if(closed)return;
   let resolveTrial;const done=new Promise(r=>{resolveTrial=r;});
   active=createWorkbenchPreview({host:{context,openSourceStem(){lease.assertCurrent();return {...lease,release(){}};}},role,mode:'worker',workerPoolBlocks:poolBlocks,silentProbe:true,loadAssets:async()=>assets,makeRoute,compilePlan:()=>JSON.parse(captured),onState:phase=>{if(!closed&&phase!=='stopped')onState(phase,progress);},onDone:resolveTrial});
   const executor=await active.ready;if(closed)return;readyResolve(executor);
   const result=await done;retain(result);if(closed)return;lease.assertCurrent();
   if(result.error||!result.diagnosticProbe?.complete){await finish('comparison-stopped',result.error);return;}
  }
  await finish('comparison-completed');
 }catch(e){readyReject(e);await finish('error',String(e));}})();
 return {ready,stop:()=>finish('stopped'),get closed(){return closed;}};
}
