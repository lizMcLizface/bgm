import{attachSourceDisposalFence}from'./sourceDisposalFence.js';
import{createClockedSourceRelease}from'./clockedSourceRelease.js';
import processorUrl from'./clockedCoreLive.worklet.js?worker&url';
import{loadGraphAssets}from'./graphAssets.js';
import{parameterTriples}from'../synth-lab/patch.js';
import{fmPacket}from'../synth-lab/fmPatch.js';
import{sanitizeNoteBehavior}from'../synth-lab/noteBehavior.js';
import{WasmBackend}from'../synth-lab/backend.js';
import{prepareNativeContextClock}from'./nativeContextClock.js';
const registrations=new WeakMap();
/* LIVE_INPUT_POLICY_BEGIN */
const LIVE_INPUT_MIN=.001,LIVE_INPUT_MAX=2,LIVE_INPUT_HISTORY=64;
function liveInputPolicy(lead){
 if(lead===undefined)return null;
 if(typeof lead!=='number'||!Number.isFinite(lead)||lead<LIVE_INPUT_MIN||lead>LIVE_INPUT_MAX)throw RangeError('Clocked Core/FM liveInputLeadSeconds must be finite in [0.001,2]');
 return Object.freeze({version:1,profile:'clocked-core-explicit-live-input-lead-v1',leadSeconds:lead,minSeconds:LIVE_INPUT_MIN,maxSeconds:LIVE_INPUT_MAX,historyCapacity:LIVE_INPUT_HISTORY,scope:'Default live-input timestamps only; explicit times and event batches preserved; no delivery deadline guarantee'});
}
function applyLiveInputPolicy(backend,context,policy){
 let call=null,total=0;const history=[],events=backend.events.bind(backend);
 backend.events=(rows)=>{
  const result=events(rows);
  if(Array.isArray(rows))for(const row of rows){if(!Array.isArray(row))continue;total++;history.push(Object.freeze({sequence:total,method:call?.method??'events',defaulted:call?.defaulted??false,requestedSeconds:call?.seconds??null,event:Object.freeze(row.slice())}));if(history.length>LIVE_INPUT_HISTORY)history.shift();}
  return result;
 };
 const invoke=(method,args,timeIndex,original)=>{
  const forwarded=args.slice(),defaulted=forwarded[timeIndex]===undefined,seconds=defaulted?context.currentTime+policy.leadSeconds:forwarded[timeIndex];forwarded[timeIndex]=seconds;
  const previous=call;call={method,defaulted,seconds};try{return original(...forwarded);}finally{call=previous;}
 };
 for(const[method,index]of[['on',2],['off',1],['retune',3]]){const original=backend[method].bind(backend);backend[method]=(...args)=>invoke(method,args,index,original);}
 // These two original methods have no time argument. The selected API adds an
 // optional final time while retaining their original event kinds/ID/value rules.
 backend.sustain=(on,time)=>invoke('sustain',[on,time],1,(value,seconds)=>backend.events([[2,0,Math.round(seconds*context.sampleRate),value?1:0,0]]));
 backend.pressure=(value,id=0,time)=>invoke('pressure',[value,id,time],2,(amount,key,seconds)=>backend.events([[3,key,Math.round(seconds*context.sampleRate),amount,0]]));
 Object.defineProperties(backend,{liveInputTiming:{value:policy},liveInputTimingStatus:{value:()=>Object.freeze({profile:policy.profile,total,events:Object.freeze(history.slice())})}});
}
/* LIVE_INPUT_POLICY_END */
export async function prepareClockedCoreLive(context,{liveInputLeadSeconds}={}){
 if(!context||typeof context.startRendering==='function'||context.state==='closed')throw Error('Clocked Core/FM requires a continuous live context; Offline remains separate');
 /* LIVE_INPUT_POLICY_BEGIN */const timingPolicy=liveInputPolicy(liveInputLeadSeconds);/* LIVE_INPUT_POLICY_END */
 const assets=await loadGraphAssets(),root=import.meta.env?.BASE_URL??'/',response=await fetch(root+'modular-audio/core-live-clocked-build.json',{cache:'no-store'});if(!response.ok)throw Error('Missing clocked Core/FM provenance');const manifest=await response.json();if(manifest.api!==1||manifest.profile!=='native-clock-owned-core-fm-live-v1'||manifest.graphWasm!==assets.manifest.wasm)throw Error('Clocked Core/FM identity differs');
 if(!registrations.has(context)){const p=context.audioWorklet.addModule(processorUrl);registrations.set(context,p);p.catch(()=>registrations.delete(context));}await registrations.get(context);const clock=await prepareNativeContextClock(context);if(clock.snapshot().version!==manifest.clockVersion)throw Error('Clocked Core/FM Native clock dependency differs');
 const factory=async(ctx,kind,patch,options={})=>{
  if(ctx!==context||!['subtractive','fm'].includes(kind)||options.offline||options.events?.length||options.patches?.length||options.stopFrame!=null)throw Error('Clocked Core/FM requires same-context future live commands and continuous source ownership');clock.check();
  const packet=p=>kind==='fm'?fmPacket(p):parameterTriples(p),initial=packet(patch);if(options.dry&&kind==='subtractive')initial.find(([s,i])=>s===0&&i===8)[2]=0;
  const node=new AudioWorkletNode(ctx,'calmbgm-owned-core-clocked-live',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{kind,module:assets.modules.graph,engineVersion:manifest.version,patch:initial,performance:sanitizeNoteBehavior(patch.performance),clockSpec:clock.spec}}),backend=new WasmBackend(ctx,node),pending=new Map();let request=0,disposed=false,disposal=null,fence,lease,release,firstFrame=null,firstRawFrame=null,firstResolve,firstReject;
  const first=new Promise((resolve,reject)=>{firstResolve=resolve;firstReject=reject;});first.catch(()=>{});
  const fail=error=>{backend.error=error;firstReject(error);fence?.fail(error);for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();options.onError?.(error);};
  backend.kind='owned-'+kind;backend.engineVersion=manifest.version;backend.sourceClockProfile=manifest.profile;
  backend.patch=(p,{seconds=.06,time=ctx.currentTime}={})=>{clock.check();if(disposed||backend.error)throw backend.error??Error('Clocked Core/FM disposed');node.port.postMessage({type:'parameters',patch:packet(p),performance:sanitizeNoteBehavior(p.performance),seconds,frame:Math.round(time*ctx.sampleRate)});};
  node.port.onmessage=({data})=>{if(data.type==='clock-ready'){if(!Number.isSafeInteger(data.frame)||data.frame<0||data.frame%128){fail(Error('Clocked Core/FM first frame differs'));return;}firstFrame=data.frame;firstRawFrame=data.rawFrame;firstResolve(data);}if(data.type==='stats')options.onStats?.(data);if(data.type==='error')fail(Error(data.message));const p=pending.get(data.request);if(p){clearTimeout(p.timer);pending.delete(data.request);p.resolve(data);}};node.onprocessorerror=()=>fail(Error('Clocked Core/FM AudioWorklet stopped'));fence=attachSourceDisposalFence(ctx,node,{label:'Clocked owned Core/FM source'});release=createClockedSourceRelease(ctx,node,fence,()=>lease);
  backend.flush=async()=>{clock.check();if(disposed||backend.error)throw backend.error??Error('Clocked Core/FM disposed');if(pending.size>=64||request===0xffffffff)throw Error('Clocked Core/FM request bound');const id=++request;const synced=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Clocked Core/FM control/first-clock timeout'));},10000);pending.set(id,{resolve,reject,timer});node.port.postMessage({type:'sync',request:id});});let timer;try{return await Promise.race([Promise.all([first,synced]).then(([,stats])=>stats),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Clocked Core/FM requires an actual offroute pull before readiness')),10000))]);}finally{clearTimeout(timer);}};
  backend.clockReleaseStatus=()=>release.status();
  backend.clockStatus=()=>({profile:manifest.profile,firstFrame,firstRawFrame,ready:firstFrame!==null,clock:clock.snapshot()});
  for(const key of['events','on','off','sustain','pressure','retune']){const original=backend[key].bind(backend);backend[key]=(...args)=>{clock.check();if(disposed||backend.error)throw backend.error??Error('Clocked Core/FM disposed');if(firstFrame===null)throw Error('Clocked Core/FM source must be pulled and acknowledged before live events');return original(...args);};}
  /* LIVE_INPUT_POLICY_BEGIN */if(timingPolicy)applyLiveInputPolicy(backend,ctx,timingPolicy);/* LIVE_INPUT_POLICY_END */
  backend.dispose=()=>{if(disposal)return disposal;disposed=true;firstReject(Error('Clocked Core/FM disposed'));backend.starts.clear();const errors=[];try{node.disconnect();}catch(error){errors.push(error);}for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Clocked Core/FM disposed'));}pending.clear();disposal=(async()=>{try{await release.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Clocked Core/FM disposal failed');})();disposal.catch(()=>{});return disposal;};
  try{lease=clock.connect(node,{onError:fail});return backend;}catch(error){await backend.dispose().catch(cleanup=>{error.cleanupError=cleanup;});throw error;}
 };
 /* LIVE_INPUT_POLICY_BEGIN */if(timingPolicy)Object.defineProperty(factory,'policy',{value:timingPolicy});/* LIVE_INPUT_POLICY_END */
 Object.defineProperties(factory,{profile:{value:manifest.profile},engineVersion:{value:manifest.version},clockVersion:{value:manifest.clockVersion},context:{value:context}});return factory;
}
