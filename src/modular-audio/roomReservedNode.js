import{loadRoomReservedControlAssets}from'./ownedRoomReservedControl.js';
import{RoomPreparedAmountWriter}from'./roomPreparedAmount.js';
import{prepareNativeContextClock}from'./nativeContextClock.js';
import{createSourceDisposalFence}from'./sourceDisposalFence.js';
import{createClockedSourceRelease}from'./clockedSourceRelease.js';
const prepared=new WeakMap(),counts=new WeakMap();let generation=0;
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
function bounded(p,label,ms=10000){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' timed out')),ms))]).finally(()=>clearTimeout(timer));}
async function assets(context){
 if(prepared.has(context))return prepared.get(context);
 const p=(async()=>{const kernel=await loadRoomReservedControlAssets(),base=(import.meta.env?.BASE_URL??'/')+'room-control-reserved-host/',r=await fetch(base+'build.json',{cache:'no-store'});if(!r.ok)throw Error('Room output host missing');const host=await r.json(),source=await fetch(base+'processor.js?v='+host.version,{cache:'no-store'});if(!source.ok||host.profile!=='original-room-output-clock-reserved-controller-host-v2'||host.kernelVersion!==kernel.manifest.version||host.wasm!==kernel.manifest.wasm||host.clockVersion!=='7a0838a735108706'||await sha(await source.arrayBuffer())!==host.processor)throw Error('Room output host identity differs');await bounded(Promise.resolve().then(()=>context.audioWorklet.addModule(base+'processor.js?v='+host.version)),'Room output registration');return{kernel,host};})();prepared.set(context,p);p.catch(()=>{if(prepared.get(context)===p)prepared.delete(context);});return p;
}
export async function createRoomReservedNode(context,{sourceChannels=2,wetChannels=2,initialDemand=false,onError=()=>{}}={}){
 if(!context?.audioWorklet||context.state==='closed'||![1,2].includes(sourceChannels)||![1,2].includes(wetChannels)||typeof onError!=='function'||typeof initialDemand!=='boolean')throw Error('Room output controller context/layout differs');
 const offline=typeof context.startRendering==='function';if(initialDemand&&(!offline||context.state!=='suspended'||context.currentTime!==0))throw Error('Initial pulled Room controller requires explicit cold Offline context');
 const verified=await assets(context),clock=await prepareNativeContextClock(context,offline?{offlineSuspension:'offline-freeze-v1'}:{});clock.check();if(clock.manifest.version!==verified.host.clockVersion)throw Error('Room output source clock differs');
 if((counts.get(context)??0)>=2)throw Error('Room output controller two-owner quota');if(generation>=4294967295)throw Error('Room output owner generation exhausted');counts.set(context,(counts.get(context)??0)+1);
 const identity=Object.freeze({hostVersion:verified.host.version,kernelVersion:verified.kernel.manifest.version,clockVersion:verified.host.clockVersion,ownerGeneration:++generation}),configuration=Object.freeze({sampleRate:context.sampleRate,sourceChannels,wetChannels});
 let node,dry,wet,sink,lease,fence,release,writer,disposed=false,freed=false,error=null,disposal,pulled=false,request=0,readyResolve,readyReject;const pending=new Map(),future=new Map(),ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});ready.catch(()=>{});
 const same=d=>d?.identity&&Object.keys(identity).every(k=>d.identity[k]===identity[k]);
 const free=()=>{if(!freed&&(context.state==='closed'||fence?.status().released)){freed=true;counts.set(context,Math.max(0,(counts.get(context)??1)-1));context.removeEventListener?.('statechange',free);}};
 const fail=e=>{if(error)return;error=e instanceof Error?e:Error(String(e));readyReject(error);for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();for(const p of future.values()){clearTimeout(p.timer);p.reject(error);}future.clear();try{onError(error);}catch(e){owner.callbackError=String(e);}if(!disposed)queueMicrotask(()=>owner.dispose().catch(e=>owner.cleanupError=String(e)));};
 const alive=()=>{if(disposed||error)throw error??Error('Disposed Room output controller');clock.check();};
 const quiet=()=>{if(sink||disposed||pulled)return;sink=context.createGain();sink.gain.value=0;node.connect(sink);sink.connect(context.destination);};
 const detach=()=>{if(!sink)return;node.disconnect(sink);sink.disconnect();sink=null;};
 const send=(kind,extra={})=>new Promise((resolve,reject)=>{try{alive();if(request>=4294967294||pending.size>=16)throw Error('Room output request capacity');const id=++request,timer=setTimeout(()=>{pending.delete(id);const error=Error('Room output '+kind+' receipt timed out');reject(error);fail(error);},5000);pending.set(id,{kind,resolve,reject,timer});try{node.port.postMessage({kind,request:id,...extra});}catch(e){clearTimeout(timer);pending.delete(id);fail(e);throw e;}}catch(e){reject(e);}});
 const owner={backend:'owned-rust',identity,configuration,ready,adapterLatencyFrames:0,get inputDry(){return dry;},get inputWet(){return wet;},get output(){return freed?null:node;},get error(){return error?String(error):null;},get released(){free();return freed;},get disposed(){return disposed;},
  async prepareAmount(value){
   alive();const p=writer.prepare(value);try{await ready;alive();const r=await send('amount-prepare',p.request);try{alive();return writer.ready(p.handle,r);}catch(e){fail(e);throw e;}}catch(e){if(!disposed&&!error)try{writer.refuse(p.handle);}catch{}throw e;}
  },
  preflightAmount(handle,value){alive();writer.preflightTicket(handle,value);},
  commitAmount(handle){alive();try{const row=writer.commit(handle);quiet();return row;}catch(e){if(writer.failed)fail(e);throw e;}},
  async cancelAmount(handle){alive();const request=writer.beginCancel(handle);try{const r=await send('amount-cancel',request);alive();writer.finishCancel(handle,r);}catch(e){fail(e);throw e;}},
  setAmount(){throw Error('Reserved Room requires prepareAmount then commitAmount');},
  schedulePair(value,drySeconds,wetSeconds){alive();if(future.size>=16)throw Error('Room future pair receipt capacity');let row;try{row=writer.schedulePair(value,drySeconds,wetSeconds);quiet();}catch(e){if(writer.failed)fail(e);throw e;}const p=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{future.delete(row.sequence);const error=Error('Room future pair receipt timed out');reject(error);fail(error);},5000);future.set(row.sequence,{resolve,reject,timer});});p.catch(()=>{});return p;},
  setPulled(value){alive();if(typeof value!=='boolean')throw Error('Room output pull authority must be Boolean');if(value===pulled)return;if(value){detach();dry.connect(node,0,0);wet.connect(node,0,1);node.parameters.get('hostDemand').setValueAtTime(1,context.currentTime);pulled=true;}else{dry.disconnect();wet.disconnect();node.parameters.get('hostDemand').setValueAtTime(0,context.currentTime);pulled=false;quiet();}},
  async arm(){alive();await ready;alive();if(offline)return owner;if(context.state!=='running')throw Error('Resume context before Room output arm');await owner.flush();return owner;},
  flush(){alive();quiet();return send('flush',{sequence:writer.transport.sequence});},
  async stats(){alive();const r=await send('stats');return{...r.stats,writer:writer.snapshot(),clockOwner:clock.snapshot(),release:release.status(),pulled};},
  snapshot(){alive();return{version:1,profile:'room-output-controller-cold-recipe-v1',identity,configuration,writer:writer.snapshot(),scope:'Control recipe only; no running timeline or transport snapshot'};},
  dispose(){if(disposal)return disposal;disposed=true;writer?.close();readyReject(Error('Disposed Room output controller'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Disposed Room controller'));}pending.clear();for(const p of future.values()){clearTimeout(p.timer);p.reject(Error('Disposed Room controller'));}future.clear();const issues=[];for(const action of[()=>dry?.disconnect(),()=>wet?.disconnect(),()=>sink?.disconnect(),()=>node?.disconnect()])try{action();}catch(e){issues.push(e);}
   disposal=(async()=>{try{if(release)await release.dispose();else{try{node?.port.close();}finally{freed=true;counts.set(context,Math.max(0,(counts.get(context)??1)-1));}}}catch(e){issues.push(e);}free();if(issues.length){owner.cleanupError=issues.map(String).join('; ');throw new AggregateError(issues,'Room output controller release failed');}return{identity,released:freed,status:release?.status()??null};})();disposal.catch(()=>{});return disposal;
  }
 };
 try{
  node=new AudioWorkletNode(context,verified.host.processorName,{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[Math.max(sourceChannels,wetChannels)],channelCount:2,channelCountMode:'max',channelInterpretation:'discrete',parameterData:{hostDemand:initialDemand?1:0},processorOptions:{module:verified.kernel.module,identity,configuration}});
  fence=createSourceDisposalFence(context,node,{label:'Room output controller',message:{kind:'dispose'},timeoutMs:5000});
  node.port.onmessage=({data:d})=>{
   if(!same(d)){fence.fail(Error('Room controller receipt identity differs'));fail(Error('Room controller receipt identity differs'));return;}
   if(d.type==='disposed'){fence.receive(d);free();return;}
   if(d.kind==='error'){owner.failureDiagnostics=d.stats;fail(Error(d.error));return;}
   if(d.kind==='ready'){readyResolve(owner);return;}
   if(d.kind==='observed'){try{writer?.acknowledge(d.sequence);}catch(e){fail(e);}return;}
   if(d.kind==='pair-accepted'||d.kind==='pair-rejected'){const p=future.get(d.sequence);if(p){clearTimeout(p.timer);future.delete(d.sequence);d.kind==='pair-accepted'?p.resolve(d):p.reject(Object.assign(Error(d.error),{receipt:d}));}return;}
   if(['stats','amount-ready','amount-cancelled','rejected'].includes(d.kind)){const p=pending.get(d.request);if(p){clearTimeout(p.timer);pending.delete(d.request);const expected={stats:'stats',flush:'stats','amount-prepare':'amount-ready','amount-cancel':'amount-cancelled'}[p.kind];if(d.kind==='rejected')p.reject(Object.assign(Error(d.error),{receipt:d}));else if(d.kind===expected)p.resolve(d);else{const e=Error('Prepared Room operation receipt differs');p.reject(e);fail(e);}}}
  };
  node.onprocessorerror=()=>{fence.fail(Error('Room output worklet failed'));fail(Error('Room output worklet failed'));};
  release=createClockedSourceRelease(context,node,fence,()=>lease,{timeoutMs:5000});
  dry=context.createGain();dry.gain.value=1;dry.channelCount=sourceChannels;dry.channelCountMode='explicit';dry.channelInterpretation='discrete';wet=context.createGain();wet.gain.value=1;wet.channelCount=wetChannels;wet.channelCountMode='explicit';wet.channelInterpretation='discrete';
  writer=new RoomPreparedAmountWriter(node.parameters,context);lease=clock.connect(node,{onError:fail});context.addEventListener?.('statechange',free);
  if(initialDemand){pulled=true;dry.connect(node,0,0);wet.connect(node,0,1);}else quiet();
  await bounded(ready,'Room output creation');alive();const initial=await owner.prepareAmount(0);owner.commitAmount(initial);return owner;
 }catch(e){fail(e);try{await owner.dispose();}catch(cleanup){e.cleanupError=String(cleanup);}throw e;}
}
