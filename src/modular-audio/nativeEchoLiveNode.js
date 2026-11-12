import{createSourceDisposalFence}from'./sourceDisposalFence.js';
import{retireAudioActions}from'../audio/retireAudio.js';
import {sanitizeEffects} from '../synth-lab/effectsConfig.js';
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
  const normalized=sanitizeEffects(raw),spec=nativeEchoSpec(ctx.sampleRate,Object.fromEntries(['delay','delayMs','feedback','tone','pingPong'].map(key=>[key,normalized[key]]))),node=new AudioWorkletNode(ctx,'owned-native-echo-live',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],processorOptions:{module:assets.module,spec,version:assets.host.version}});
  let resolveReady,rejectReady,error,callbackError,cleanupError,disposed=false,request=0,disposal,lastTerminal=null;
  const closedError=Object.assign(Error('Echo disposed'),{code:'AUDIO_OWNER_DISPOSED'}),fence=createSourceDisposalFence(ctx,node,{label:'Owned Native Echo',message:{type:'dispose'},timeoutMs:1000});
  const pending=new Map(),ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
  const rejectPending=reason=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(reason);}pending.clear();};
  const fail=reason=>{if(error)return;error=reason instanceof Error?reason:Error(String(reason));fence.fail(error);rejectReady(error);rejectPending(error);try{onError(error);}catch(e){callbackError=e;}if(!disposed)queueMicrotask(()=>owner.dispose().catch(e=>{cleanupError??=e;}));};
  node.sourceDisposalStatus=fence.status;
  node.port.onmessage=({data})=>{
   if(data.type==='disposed'){lastTerminal=data;fence.receive(data);return;}
   if(data.type==='error'){fail(Error(data.message));return;}
   if(disposed)return;
   if(data.type==='ready'){if(data.version!==assets.host.version||data.profile!=='native-echo-explicit-live-pull-v1'){fail(Error('Echo ready identity differs'));return;}resolveReady(data);}
   const p=pending.get(data.request);if(p){clearTimeout(p.timer);pending.delete(data.request);p.resolve(data);}
  };
  node.onprocessorerror=()=>fail(Error('Echo processor failed'));
  const command=(type,extra={})=>new Promise((resolve,reject)=>{
   if(disposed||error)return reject(error??closedError);
   if(pending.size>=16||request>=4294967295)return reject(Error('Echo command capacity'));
   const id=++request,timer=setTimeout(()=>{pending.delete(id);reject(Error('Echo acknowledgement timeout'));},10000);
   pending.set(id,{resolve,reject,timer});try{node.port.postMessage({type,request:id,...extra});}catch(e){pending.delete(id);clearTimeout(timer);reject(e);fail(e);}
  });
  const arm=async()=>{if(disposed||error)throw error??closedError;if(ctx.state!=='running')throw Error('Echo arm requires a running context');let timer;try{return await Promise.race([ready,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Echo processor readiness timeout')),10000))]);}finally{clearTimeout(timer);}};
  const owner={input:node,output:node,node,ready,arm,backend:'owned-rust',engineVersion:assets.manifest.version,hostVersion:assets.host.version,compensationFrames:128,get error(){return error;},get disposed(){return disposed;},get released(){return fence.status().released;},
   setHostAwake:awake=>{if(disposed||error)throw error??closedError;if(typeof awake!=='boolean')throw Error('Echo host demand must be Boolean');node.parameters.get('hostAwake').setValueAtTime(awake?1:0,ctx.currentTime);},
   clear:()=>command('clear',{frame:null}),queueClear:frame=>{if(!Number.isSafeInteger(frame)||frame<0||frame%128)return Promise.reject(Error('Invalid echo clear frame'));return command('clear',{frame});},requestStats:()=>command('stats'),snapshot:()=>JSON.parse(JSON.stringify(spec)),
   disposalStatus:()=>({...fence.status(),callbackError:callbackError?String(callbackError):null,cleanupError:cleanupError?String(cleanupError):null,lastTerminal}),
   dispose(){if(disposal)return disposal;disposed=true;rejectReady(closedError);rejectPending(closedError);disposal=retireAudioActions([()=>node.disconnect(),()=>fence.dispose()],'Echo terminal/routing disposal failed');disposal.catch(e=>{cleanupError??=e;});return disposal;}
  };return owner;
 };
 factory.prepareContext=ctx=>prepareNativeEchoLive(ctx,{assets});factory.engineVersion=assets.manifest.version;factory.hostVersion=assets.host.version;return factory;
}
