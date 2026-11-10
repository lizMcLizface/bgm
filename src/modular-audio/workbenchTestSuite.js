import {compileWorkbenchSet,compileWorkbenchAudition,WORKBENCH_SOURCE_ROLES,hashWorkbenchPlan} from './workbenchPlan';
import {loadGraphAssets} from './graphAssets';
import {createWorkbenchPreview} from './workbenchPreview';
import {newListeningId} from './listeningRecord';
import {compileWithRustIowa} from './iowaWorkbenchPreparation';

// Capture each actual source once. Four fresh owners replay two immutable plans;
// no sound substitution, automatic audible playback or relaxed delivery guard.
export function createWorkbenchTestSuite({host,project,part,roles,mutedRoles=[],bpm,onState=()=>{},onDone=()=>{},loadAssets=loadGraphAssets,loadIowaPreparation,makeRoute}){
 let closed=false,finishing=null,active=null,assets=null,resolveReady,rejectReady;
 const leases=[],bindings=[],excludedRoles=[],trials=[],plans={},fingerprints={},context=host.context;
 const runId=newListeningId(),startedAtUtc=new Date().toISOString(),ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const check=()=>leases.forEach(l=>l.assertCurrent());
 const retain=r=>{if(r&&!trials.some(t=>t.runId===r.runId))trials.push(r);};
 function finish(reason='stopped',error=null){
  if(finishing)return finishing;closed=true;onState('stopping');
  finishing=(async()=>{try{retain(await active?.stop());}catch(e){error??=String(e);}finally{for(const l of leases)l.release();}
   const checks=trials.map(sourceTestChecks),complete=reason==='suite-completed'&&trials.length===4;
   const pairsMatch=['voice-audition','captured-score'].every(material=>{const pair=trials.filter(t=>t.material===material);return pair.length===2&&pair.every(t=>t.sourceFingerprint===fingerprints[material]);});
   const report={kind:'all.source-test-suite',version:1,hostRevision:'all-source-tests-v1',runId,startedAtUtc,completedAtUtc:new Date().toISOString(),browserUserAgent:globalThis.navigator?.userAgent??null,sampleRate:context.sampleRate,engineVersion:assets?.manifest.version??null,requestedRoles:Array.isArray(roles)?roles.slice():[],excludedRoles,reason,error,suite:{muted:true,complete,passedCases:checks.filter(t=>t.pass).length,totalCases:4,checksPassed:complete&&pairsMatch&&checks.every(t=>t.pass),sameCapturedInputByMaterial:pairsMatch,fingerprints,checks},trials,complete:false,pass:false,listening:'not assessed'};
   resolveReady(null);onState('stopped');onDone(report);return report;
  })();return finishing;
 }
 void (async()=>{await Promise.resolve();try{
  if(closed)return;
  if(context.sampleRate!==48000)throw Error('Source checks require the existing 48 kHz AudioContext.');
  if(!Array.isArray(roles)||!roles.length||roles.length>6||new Set(roles).size!==roles.length||roles.some(r=>!WORKBENCH_SOURCE_ROLES.includes(r))||!Array.isArray(mutedRoles))throw Error('Choose one to six distinct ready source roles.');
  for(const role of roles){if(mutedRoles.includes(role)){excludedRoles.push({role,reason:'muted or excluded by solo'});continue;}const lease=host.openSourceStem(role,()=>{void finish('host-closed');});leases.push(lease);bindings.push({role,lease});}
  if(!bindings.length)throw Error('No selected sources are audible under mute/solo.');
  const input={project,part,bpm,sources:bindings.map(b=>({role:b.role,source:b.lease,tune:b.lease.tune}))};
  const compiled=await compileWithRustIowa(input.sources,sources=>Object.fromEntries([['voice-audition',compileWorkbenchAudition],['captured-score',compileWorkbenchSet]].map(([material,compile])=>[material,compile({...input,sources})])),loadIowaPreparation);
  for(const [material,plan]of Object.entries(compiled)){plans[material]=JSON.stringify(plan);fingerprints[material]=await hashWorkbenchPlan(plan);if(closed)return;check();}
  assets=await loadAssets();if(closed)return;check();
  const cases=[['voice-audition','serial'],['voice-audition','worker'],['captured-score','serial'],['captured-score','worker']];
  for(const [index,[material,mode]]of cases.entries()){
   if(closed)return;check();const progress={trial:index+1,trials:4,label:`${material==='voice-audition'?'Test notes':'Current progression'} · ${mode==='worker'?'One worker · 12 blocks':'Serial'}`};onState('preparing',progress);if(closed)return;
   let resolveTrial;const done=new Promise(r=>{resolveTrial=r;});
   active=createWorkbenchPreview({host:{context,openSourceStem(role){check();const l=bindings.find(b=>b.role===role)?.lease;if(!l)throw Error('Source absent from captured test set.');return {...l,release(){}};}},roles:bindings.map(b=>b.role),mode,workerPoolBlocks:12,audition:material==='voice-audition',silentFullRun:true,compileSetPlan:()=>JSON.parse(plans[material]),loadAssets:async()=>assets,...(makeRoute?{makeRoute}:{}),onState:phase=>{if(!closed&&phase!=='stopped')onState(phase,progress);},onDone:resolveTrial});
   const executor=await active.ready;if(closed)return;resolveReady(executor);
   const result=await done;retain(result);if(closed)return;check();
   // Finish diagnostic cases even after a counter failure, but stop on errors,
   // invalidation or executor fallback. Never silently replace an executor.
   if(result.error||result.executor?.actual!==mode||!result.diagnosticProbe?.complete){await finish('suite-stopped',result.error??'A full source check stopped or changed executor.');return;}
  }
  await finish('suite-completed');
 }catch(e){rejectReady(e);await finish('error',String(e));}})();
 return {ready,stop:()=>finish('stopped'),get closed(){return closed;}};
}

export function sourceTestChecks(r){
 const o=r.stats?.output,w=r.stats?.worker,g=w?.graph??o?.serial?.graph,q=o?.queue,mode=r.mode;
 const checks={finished:r.reason==='probe-completed'&&r.diagnosticProbe?.fullRun===true&&r.diagnosticProbe.complete===true,
  executor:r.executor?.actual===mode,frames:!!r.plan&&o?.sourceFrame===r.plan.endFrame&&g?.frame===r.plan.endFrame,
  events:!!r.plan&&g?.applied===r.plan.graph.events.length&&g.late===0&&g.overflow===0,
  delivery:mode==='serial'||!!q&&['underrunFrames','lateBlocks','rejectedBlocks','staleGeneration'].every(k=>q[k]===0),
  recycling:mode==='serial'||w?.badRecycles===0,error:!r.error&&!r.stats?.error};
 return {runId:r.runId,material:r.material,mode,pass:Object.values(checks).every(Boolean),checks};
}
