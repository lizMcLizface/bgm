import processorUrl from './nativeEchoLive.worklet.js?worker&url';
import {loadNativeEchoAssets,nativeEchoSpec} from './ownedNativeEcho.js';
const registrations=new WeakMap();
let cached;
export function loadNativeEchoLiveAssets() {
 return cached??=(async()=>{
  const kernel=await loadNativeEchoAssets(),base=(import.meta.env?.BASE_URL??'/')+'echo-native/';
  const response=await fetch(base+'live-build.json');if(!response.ok)throw Error('Missing echo live provenance');
  const host=await response.json();
  if(host.api!==1||host.profile!=='native-echo-explicit-live-pull-v1'||host.kernelVersion!==kernel.manifest.version||host.wasm!==kernel.manifest.wasm)throw Error('Echo live asset mismatch');
  return {...kernel,host};
 })().catch(error=>{cached=null;throw error;});
}
export async function prepareNativeEchoLive(context,{assets}={}) {
 assets??=await loadNativeEchoLiveAssets();
 if(!registrations.has(context)) {
  const promise=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Echo registration timeout')),10000);
   context.audioWorklet.addModule(processorUrl+'?v='+assets.host.version).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
  registrations.set(context,promise);promise.catch(()=>{if(registrations.get(context)===promise)registrations.delete(context);});
 }
 await registrations.get(context);
 const factory=async(ctx,raw,{onError=()=>{}}={})=>{
  if(ctx!==context)throw Error('Echo factory belongs to another context');
  const spec=nativeEchoSpec(ctx.sampleRate,raw),node=new AudioWorkletNode(ctx,'owned-native-echo-live',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],processorOptions:{module:assets.module,spec,version:assets.host.version}});
  let resolveReady,rejectReady,error,disposed=false,request=0,disposal,resolveDispose,disposeTimer;
  const pending=new Map(),ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
  const rejectPending=reason=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(reason);}pending.clear();};
  const fail=reason=>{error=reason;rejectReady(reason);rejectPending(reason);onError(reason);};
  node.port.onmessage=({data})=>{
   if(data.type==='ready'){resolveReady(data);}
   else if(data.type==='error')fail(Error(data.message));
   else if(data.type==='disposed') { disposed=true;rejectReady(Error('Echo disposed'));rejectPending(Error('Echo disposed'));clearTimeout(disposeTimer);node.port.onmessage=null;node.port.close();resolveDispose?.();return; }
   const p=pending.get(data.request);if(p){clearTimeout(p.timer);pending.delete(data.request);p.resolve(data);}
  };
  node.onprocessorerror=()=>fail(Error('Echo processor failed'));
  const command=(type,extra={})=>new Promise((resolve,reject)=>{
   if(disposed||error)return reject(error??Error('Echo disposed'));
   if(pending.size>=16||request>=4294967295)return reject(Error('Echo command capacity'));
   const id=++request,timer=setTimeout(()=>{pending.delete(id);reject(Error('Echo acknowledgement timeout'));},10000);
   pending.set(id,{resolve,reject,timer});node.port.postMessage({type,request:id,...extra});
  });
  const arm=async()=>{if(disposed||error)throw error??Error('Echo disposed');if(ctx.state!=='running')throw Error('Echo arm requires a running context');let timer;try{return await Promise.race([ready,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Echo processor readiness timeout')),10000))]);}finally{clearTimeout(timer);}};
  return {input:node,output:node,node,ready,arm,backend:'owned-rust',engineVersion:assets.manifest.version,hostVersion:assets.host.version,compensationFrames:128,
   setHostAwake:awake=>{if(disposed||error)throw error??Error('Echo disposed');if(typeof awake!=='boolean')throw Error('Echo host demand must be Boolean');node.parameters.get('hostAwake').setValueAtTime(awake?1:0,ctx.currentTime);},
   clear:()=>command('clear',{frame:null}),queueClear:frame=>{if(!Number.isSafeInteger(frame)||frame<0||frame%128)return Promise.reject(Error('Invalid echo clear frame'));return command('clear',{frame});},requestStats:()=>command('stats'),snapshot:()=>JSON.parse(JSON.stringify(spec)),
   dispose(){if(disposal)return disposal;disposed=true;rejectReady(Error('Echo disposed'));rejectPending(Error('Echo disposed'));node.disconnect();node.onprocessorerror=null;
    disposal=new Promise(resolve=>{resolveDispose=resolve;disposeTimer=setTimeout(()=>{node.port.onmessage=null;node.port.close();resolve();},1000);try{node.port.postMessage({type:'dispose'});}catch{clearTimeout(disposeTimer);node.port.onmessage=null;node.port.close();resolve();}});return disposal;
   }
  };
 };
 factory.prepareContext=ctx=>prepareNativeEchoLive(ctx,{assets});factory.engineVersion=assets.manifest.version;factory.hostVersion=assets.host.version;return factory;
}
