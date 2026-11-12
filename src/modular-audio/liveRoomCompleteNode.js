import {loadOfflineRoomCompleteAssets} from './ownedOfflineRoomComplete.js';
import {validateLiveRoomCompleteProgram,loadLiveRoomCompleteProgram,saveLiveRoomCompleteProgram,liveRoomCompleteGeometry,LIVE_ROOM_COMPLETE_PROFILE} from './liveRoomCompleteProgram.js';
import {prepareNativeContextClock} from './nativeContextClock.js';
import {sameLiveRoomIdentity,liveRoomReceipt,ROOM_LIVE_PROTOCOL} from './liveRoomCompleteProtocol.js';
const prepared=new WeakMap(),counts=new WeakMap();let generation=0;
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
function bounded(p,label,ms=10000){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' timed out')),ms))]).finally(()=>clearTimeout(timer));}
function open(context){if(!context?.audioWorklet||context.state==='closed'||!Number.isInteger(context.sampleRate)||context.sampleRate<8000||context.sampleRate>192000)throw Error('Complete live Room requires an open supported context');}
async function assetsFor(context){
 if(prepared.has(context))return prepared.get(context);
 const attempt=(async()=>{
  const assets=await loadOfflineRoomCompleteAssets(),base=(import.meta.env?.BASE_URL??'/')+'room-complete-live/',get=async path=>{const r=await fetch(base+path,{cache:'no-store'});if(!r.ok)throw Error('Missing complete live Room '+path);return r;},host=await(await get('build.json')).json();
  if(host.api!==1||host.profile!==LIVE_ROOM_COMPLETE_PROFILE||!/^[a-f0-9]{16}$/.test(host.version)||host.processorName!=='owned-live-complete-room-'+host.version||Object.keys(host.components??{}).length!==3)throw Error('Complete live Room host profile differs');
  for(const k of['colour','convolver','mix'])if(host.components[k].version!==assets[k].manifest.version||host.components[k].wasm!==assets[k].manifest.wasm)throw Error('Complete live Room component identity differs');
  const [processor,worker]=await Promise.all(['processor.js','worker.js'].map(p=>get(p+'?v='+host.version).then(r=>r.arrayBuffer())));
  if(await sha(processor)!==host.processor||await sha(worker)!==host.worker)throw Error('Complete live Room host bytes differ');
  await bounded(Promise.resolve().then(()=>context.audioWorklet.addModule(base+'processor.js?v='+host.version)),'Complete live Room registration');
  return{assets,host,workerUrl:base+'worker.js?v='+host.version};
 })();prepared.set(context,attempt);attempt.catch(()=>{if(prepared.get(context)===attempt)prepared.delete(context);});return attempt;
}
/** Prepared finite source program only. Source starts after the acknowledged epoch;
 * no mutable GUI amount, IR replacement, automatic source-end demand or hidden fallback. */
export async function createLiveRoomComplete(context,raw,{onError=()=>{},signal,makeWorker=url=>new Worker(url,{type:'module'})}={}){
 open(context);if(typeof onError!=='function'||typeof makeWorker!=='function')throw Error('Complete live Room callbacks differ');
 const program=loadLiveRoomCompleteProgram(saveLiveRoomCompleteProgram(validateLiveRoomCompleteProgram(raw))),geometry=liveRoomCompleteGeometry(program);
 if(context.sampleRate!==geometry.sampleRate)throw Error('Complete live Room context rate differs');
 if(signal?.aborted)throw Object.assign(Error('Complete live Room preparation cancelled'),{name:'AbortError'});
 const verified=await assetsFor(context);open(context);const clock=await prepareNativeContextClock(context,typeof context.startRendering==='function'?{offlineSuspension:'offline-freeze-v1'}:{});
 if(clock.manifest.version!==verified.host.clockVersion)throw Error('Complete live Room Native clock version differs');
 clock.check();if(signal?.aborted)throw Object.assign(Error('Complete live Room preparation cancelled'),{name:'AbortError'});
 if((counts.get(context)??0)>=2)throw Error('Complete live Room two-owner quota exceeded');if(generation>=4294967295)throw Error('Complete live Room owner generation exhausted');
 counts.set(context,(counts.get(context)??0)+1);const identity=Object.freeze({protocol:ROOM_LIVE_PROTOCOL,profile:LIVE_ROOM_COMPLETE_PROFILE,hostVersion:verified.host.version,clockVersion:verified.host.clockVersion,generation:++generation,components:Object.freeze(Object.fromEntries(Object.entries(verified.host.components).map(([k,v])=>[k,v.version])))});
 let node,input,pump,worker,lease,disposed=false,released=false,error=null,disposal,request=0,started=false,epoch=null,workerProcessed=null,transportDrained=null,workerTerminated=false,transportReleased=false,workerInitialized=false;
 const pending=new Map(),ready={},readyTimers={};let completeResolve,completeReject;const completed=new Promise((a,b)=>{completeResolve=a;completeReject=b;});completed.catch(()=>{});
 const free=()=>{if(!released&&workerTerminated&&transportReleased){released=true;counts.set(context,Math.max(0,(counts.get(context)??1)-1));}};
 const check=()=>{if(disposed||error)throw error??Error('Complete live Room disposed');open(context);clock.check();};
 const fail=e=>{if(error)return;error=e instanceof Error?e:Error(String(e));completeReject(error);for(const [key,p]of pending)if(p.kind!=='dispose'){clearTimeout(p.timer);pending.delete(key);p.reject(error);}for(const key of Object.keys(ready)){clearTimeout(readyTimers[key]);ready[key].reject(error);}try{onError(error);}catch(callbackError){owner.callbackError=String(callbackError);}if(!disposed)queueMicrotask(()=>owner.dispose().catch(e=>owner.cleanupError??=String(e)));};
 const waitReady=side=>{const p=new Promise((resolve,reject)=>{ready[side]={resolve,reject};readyTimers[side]=setTimeout(()=>fail(Error('Complete live Room '+side+' creation receipt timed out')),10000);});p.catch(()=>{});return p;};
 const send=(side,kind,extra={},transfer=[])=>new Promise((resolve,reject)=>{
  if(request>=4294967295||pending.size>=32)return reject(Error('Complete live Room request bound'));
  const id=++request,key=side+':'+id,timer=setTimeout(()=>{pending.delete(key);const e=Error('Complete live Room '+side+' '+kind+' acknowledgement timed out');reject(e);if(kind!=='dispose')fail(e);},5000);pending.set(key,{kind,resolve,reject,timer});
  try{(side==='worker'?worker:node.port).postMessage(liveRoomReceipt(identity,kind,id,extra),transfer);}catch(e){clearTimeout(timer);pending.delete(key);reject(e);}
 });
 function receive(side,d){
  if(!sameLiveRoomIdentity(d,identity)){fail(Error('Complete live Room '+side+' receipt identity differs'));return;}
  if(d.kind==='error'){owner.failureDiagnostics={side,receipt:d};fail(Error(d.error));return;}
  if(d.kind==='ready'){if(ready[side]){clearTimeout(readyTimers[side]);if(JSON.stringify(d.geometry)!==JSON.stringify(geometry)){fail(Error('Complete live Room prepared geometry differs'));return;}ready[side].resolve(d);delete ready[side];}return;}
  if(d.kind==='clock-bound'){if(JSON.stringify(d.clockSpec)!==JSON.stringify(lease?.spec??clock.spec)){fail(Error('Complete live Room clock bind differs'));return;}ready.clock?.resolve(d);clearTimeout(readyTimers.clock);delete ready.clock;return;}
  if(d.kind==='stats'){if(side==='worker')owner.cachedWorkerStats=d.stats;else owner.cachedTransportStats=d.stats;}
  if(d.kind==='processed'){if(side!=='worker'||d.stats?.frame!==geometry.frames){fail(Error('Complete live Room processed receipt differs'));return;}workerProcessed=d.stats;}
  else if(d.kind==='drained'){if(side!=='transport'||!d.stats?.drained||d.stats.outputFrame!==geometry.frames||d.stats.returnedFrame!==geometry.frames||d.stats.underrunFrames||d.stats.rejectedPackets){fail(Error('Complete live Room drain receipt differs'));return;}transportDrained=d.stats;}
  else {
   const key=side+':'+d.request,p=pending.get(key);if(!p)return;
   const expected={attach:'attached',arm:'armed',stats:'stats',dispose:'disposed'}[p.kind];
   if(d.kind!==expected||p.kind==='dispose'&&(!d.releasedOwners||d.releaseErrors?.length)){fail(Error('Complete live Room operation/release receipt differs'));return;}
   clearTimeout(p.timer);pending.delete(key);p.resolve(d);
  }
  if(workerProcessed&&transportDrained)completeResolve({identity,epoch,geometry,worker:workerProcessed,transport:transportDrained,scope:'Worker processing and exact final-output drain complete; no physical-device deadline claim'});
 }
 const owner={backend:'owned-rust',execution:LIVE_ROOM_COMPLETE_PROFILE,hostVersion:identity.hostVersion,identity,geometry,completed,adapterLatencyFrames:geometry.latencyFrames,
  get input(){return input;},get output(){return node;},get error(){return error?String(error):null;},get disposed(){return disposed;},get released(){return released;},
  snapshot:()=>loadLiveRoomCompleteProgram(saveLiveRoomCompleteProgram(program)),check,
  async start(options={}){check();if(started)throw Error('Complete live Room starts once');await clock.ready;check();const min=Math.max(context.currentTime*geometry.sampleRate+256,clock.spec.epochFrame+256),at=options.startFrame??Math.ceil(Math.max(min,context.currentTime*geometry.sampleRate+geometry.sampleRate*.25)/128)*128;if(!Number.isSafeInteger(at)||at%128||at<min)throw Error('Complete live Room source epoch must remain future');started=true;
   try{const receipt=await send('transport','arm',{epoch:at});check();epoch=receipt.epoch;input.connect(node);node.disconnect(pump);pump.disconnect();pump=null;return Object.freeze({epoch,earliestInputFrame:receipt.earliestInputFrame,earliestOutputFrame:receipt.earliestOutputFrame,latencyFrames:geometry.latencyFrames,frames:geometry.frames});}catch(e){fail(e);throw e;}
  },
  async stats(){check();const [w,t]=await Promise.all([send('worker','stats'),send('transport','stats')]);return{identity,geometry,epoch,started,worker:w.stats,transport:t.stats,clock:clock.snapshot(),disposed,released,workerTerminated,transportReleased};},
  dispose(){
   if(disposal)return disposal;disposed=true;completeReject(error??Error('Complete live Room disposed'));signal?.removeEventListener?.('abort',abort);for(const k of Object.keys(ready)){clearTimeout(readyTimers[k]);ready[k].reject(Error('Complete live Room disposed'));delete ready[k];}
   for(const [key,p]of pending)if(p.kind!=='dispose'){clearTimeout(p.timer);pending.delete(key);p.reject(Error('Complete live Room disposed'));}
   const issues=[],remember=e=>{issues.push(e instanceof Error?e:Error(String(e)));owner.cleanupError=issues.map(String).join('; ');};
   for(const action of[()=>input?.disconnect(),()=>pump?.disconnect(),()=>node?.disconnect()])try{action();}catch(e){remember(e);}
   disposal=(async()=>{
    const nodeRelease=node?(context.state==='closed'?Promise.resolve({contextClosed:true}):send('transport','dispose')):Promise.resolve();
    const workerRelease=worker&&workerInitialized?send('worker','dispose'):Promise.resolve();
    const closed=()=>{if(context.state==='closed'){transportReleased=true;for(const [key,p]of pending)if(key.startsWith('transport:')&&p.kind==='dispose'){clearTimeout(p.timer);pending.delete(key);p.resolve({contextClosed:true});}free();}};
    context.addEventListener?.('statechange',closed);closed();
    const settled=await Promise.allSettled([nodeRelease,workerRelease]);
    if(settled[0].status==='fulfilled')transportReleased=true;else remember(settled[0].reason);
    if(settled[1].status==='rejected')remember(settled[1].reason);
    try{if(worker){await Promise.resolve(worker.terminate());workerTerminated=true;worker=null;}else workerTerminated=true;}catch(e){remember(e);}
    if(transportReleased){context.removeEventListener?.('statechange',closed);try{await lease?.release();}catch(e){remember(e);}try{node?.port.close();}catch(e){remember(e);}if(node){node.port.onmessage=null;node.onprocessorerror=null;}node=null;}
    // Failed transport ACK remains quarantined. A later context-close is positive release authority.
    else {const releaseAfterClose=()=>{if(context.state==='closed'){transportReleased=true;context.removeEventListener?.('statechange',releaseAfterClose);context.removeEventListener?.('statechange',closed);try{node?.port.close();}catch(e){owner.cleanupError=String(e);}lease?.release().catch(e=>owner.cleanupError=String(e));node=null;free();}};context.addEventListener?.('statechange',releaseAfterClose);releaseAfterClose();}
    free();if(issues.length)throw new AggregateError(issues,'Complete live Room cleanup failed');return{identity,workerTerminated,transportReleased,released};
   })();disposal.catch(()=>{});return disposal;
  }
 };
 function abort(){fail(Object.assign(Error('Complete live Room cancelled'),{name:'AbortError'}));}
 try{
  signal?.addEventListener?.('abort',abort,{once:true});if(signal?.aborted){abort();throw error;}
  const workerReady=waitReady('worker'),transportReady=waitReady('transport'),clockBound=waitReady('clock');
  worker=makeWorker(verified.workerUrl);worker.onmessage=({data})=>receive('worker',data);worker.onerror=e=>fail(Error(e.message??'Complete live Room Worker failed'));
  node=new AudioWorkletNode(context,verified.host.processorName,{numberOfInputs:1,numberOfOutputs:1,channelCount:geometry.inputChannels,channelCountMode:'explicit',channelInterpretation:'discrete',outputChannelCount:[geometry.outputChannels],processorOptions:{identity,geometry}});
  node.port.onmessage=({data})=>receive('transport',data);node.onprocessorerror=()=>fail(Error('Complete live Room transport processor failed'));
  input=context.createGain();input.gain.value=1;input.channelCount=geometry.inputChannels;input.channelCountMode='explicit';input.channelInterpretation='discrete';
  pump=context.createGain();pump.gain.value=0;node.connect(pump);pump.connect(context.destination);
  lease=clock.connect(node,{onError:fail});
  worker.postMessage({kind:'init',identity,program,assets:verified.assets});workerInitialized=true;
  await Promise.all([workerReady,transportReady,clockBound]);check();const channel=new MessageChannel();await Promise.all([send('worker','attach',{port:channel.port1},[channel.port1]),send('transport','attach',{port:channel.port2},[channel.port2])]);check();return owner;
 }catch(e){fail(e);try{await owner.dispose();}catch(cleanup){e.cleanupError=String(cleanup);}throw e;}
}
