import{loadOwnedConvolverAssets,validateOwnedConvolverSpec,loadOwnedConvolverSpec,saveOwnedConvolverSpec}from'./ownedConvolver.js';
const registrations=new WeakMap(),counts=new WeakMap(),id=/^[a-f0-9]{16}$/;
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
/** Immutable IR, two owners per Offline context. An absent/ended program is NOT
 * inferred from PCM: feed a continuous known-layout bus through the full budget. */
export async function createOfflineConvolver(context,raw,{onError=()=>{}}={}){
 if(typeof context?.startRendering!=='function'||!Number.isInteger(context.length)||context.length<1||context.length>2147483647||context.state!=='suspended'||context.currentTime!==0||typeof onError!=='function')throw Error('Offline convolution requires a cold unstarted OfflineAudioContext');
 const spec=loadOwnedConvolverSpec(saveOwnedConvolverSpec(validateOwnedConvolverSpec(raw)));if(context.sampleRate!==spec.sampleRate)throw Error('Offline convolution context rate differs');
 let loading=registrations.get(context);if(!loading){loading=(async()=>{const assets=await loadOwnedConvolverAssets(),base=(import.meta.env?.BASE_URL??'/')+'convolver-offline/',response=await fetch(base+'build.json',{cache:'no-store'});if(!response.ok)throw Error('Missing offline convolution manifest');const host=await response.json(),text=await fetch(base+'processor.js?v='+host.version,{cache:'no-store'});if(!text.ok)throw Error('Missing offline convolution processor');const bytes=await text.arrayBuffer();if(assets.manifest.audited!==false||!id.test(assets.manifest.version)||host.api!==1||host.profile!=='offline-continuous-convolver-v1'||!id.test(host.version)||host.kernelVersion!==assets.manifest.version||host.wasm!==assets.manifest.wasm||host.processor!==await sha(bytes)||host.processorName!=='owned-offline-convolver-'+host.version)throw Error('Offline convolution immutable identity differs');await context.audioWorklet.addModule(base+'processor.js?v='+host.version);return{...assets,host};})();registrations.set(context,loading);loading.catch(()=>{if(registrations.get(context)===loading)registrations.delete(context);});}
 const assets=await loading;if(context.state!=='suspended'||context.currentTime!==0)throw Error('Offline context started or closed during preparation');if((counts.get(context)??0)>=2)throw Error('Offline convolution two-owner quota exceeded before creation');counts.set(context,(counts.get(context)??0)+1);
 let node,disposed=false,error=null,disposal,request=0,released=false,readyResolve,readyReject;const pending=new Map(),health=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});health.catch(()=>{});
 const free=()=>{if(!released){released=true;counts.set(context,Math.max(0,(counts.get(context)??1)-1));}};
 const fail=e=>{
  error??=e instanceof Error?e:Error(String(e));readyReject(error);
  for(const[n,p]of pending)if(p.kind!=='dispose'){clearTimeout(p.timer);p.reject(error);pending.delete(n);}
  try{onError(error);}catch(callbackError){owner.callbackError=String(callbackError);}
  if(!disposed)owner.dispose().catch(e=>owner.cleanupError??=String(e));
 };
 const send=kind=>new Promise((resolve,reject)=>{if(request>=4294967295||pending.size>=16)return reject(Error('Offline convolver request bound'));const n=++request,timer=setTimeout(()=>{pending.delete(n);reject(Error('Offline convolution acknowledgement timed out'));},5000);pending.set(n,{kind,resolve,reject,timer});try{node.port.postMessage({kind,request:n});}catch(e){clearTimeout(timer);pending.delete(n);reject(e);}});
 const owner={backend:'owned-rust',hostVersion:assets.host.version,kernelVersion:assets.manifest.version,latencyFrames:0,execution:'offline-continuous-program-v1',health,get input(){return node;},get output(){return node;},get error(){return error?String(error):null;},get disposed(){return disposed;},get released(){return released;},stats:()=>disposed?Promise.reject(Error('Disposed offline convolver')):error?Promise.reject(error):send('stats'),snapshot:()=>loadOwnedConvolverSpec(saveOwnedConvolverSpec(spec)),
 dispose(){
  if(disposal)return disposal;disposed=true;readyReject(Error('Disposed offline convolver'));
  for(const[n,p]of pending)if(p.kind!=='dispose'){clearTimeout(p.timer);p.reject(Error('Disposed offline convolver'));pending.delete(n);}
  const issues=[],remember=e=>{issues.push(e instanceof Error?e:Error(String(e)));owner.cleanupError=issues.map(String).join('; ');};
  try{node?.disconnect();}catch(e){remember(e);}
  const close=()=>{const current=node;node=null;if(!current)return;for(const action of[()=>current.port.close(),()=>{current.port.onmessage=null;},()=>{current.onprocessorerror=null;}])try{action();}catch(e){remember(e);}};
  const closed=()=>{if(context.state==='closed'){for(const[n,p]of pending)if(p.kind==='dispose'){clearTimeout(p.timer);pending.delete(n);p.resolve({contextClosed:true});}free();context.removeEventListener?.('statechange',closed);}};
  const finish=(result,primary)=>{if(released||context.state==='closed')try{context.removeEventListener?.('statechange',closed);}catch(e){remember(e);}close();if(primary&&issues.length)throw new AggregateError([primary,...issues],'Offline convolution release and cleanup failed');if(primary)throw primary;if(issues.length)throw new AggregateError(issues,'Offline convolution cleanup failed');return result;};
  if(context.state==='closed'){free();disposal=Promise.resolve().then(()=>finish({contextClosed:true}));}
  else{context.addEventListener?.('statechange',closed);disposal=send('dispose').then(result=>{free();return finish(result);},primary=>finish(null,primary));closed();}
  disposal.catch(()=>{});return disposal;
 }};
 try{node=new AudioWorkletNode(context,assets.host.processorName,{numberOfInputs:1,numberOfOutputs:1,channelCount:spec.inputChannels,channelCountMode:'explicit',channelInterpretation:'discrete',outputChannelCount:[Math.max(spec.inputChannels,spec.ir.length)],processorOptions:{module:assets.module,spec,hostVersion:assets.host.version,kernelVersion:assets.manifest.version,execution:owner.execution,expectedFrames:context.length}});node.port.onmessage=({data})=>{
   if(data?.kind==='error'){fail(Error(data.error));return;}
   if(!['ready','stats','disposed'].includes(data?.kind)){fail(Error('Unknown offline convolution receipt'));return;}
   const stats=data.stats;if(stats?.hostVersion!==assets.host.version||stats?.kernelVersion!==assets.manifest.version||stats?.execution!==owner.execution||stats?.expectedFrames!==context.length){fail(Error('Offline convolution receipt identity differs'));return;}
   if(data.kind==='ready'){readyResolve(stats);return;}
   const p=pending.get(data.request);if(!p)return;
   if(data.kind!==(p.kind==='dispose'?'disposed':'stats')){fail(Error('Offline convolution receipt operation differs'));return;}
   clearTimeout(p.timer);pending.delete(data.request);p.resolve(stats);
  };node.onprocessorerror=()=>fail(Error('Offline convolution processor failed'));return owner;}catch(e){free();try{node?.port.close();node?.disconnect();}catch{}throw e;}
}
