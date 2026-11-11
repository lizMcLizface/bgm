import {ambienceLoopSpec,validateAmbienceLoopSpec,saveAmbienceLoopSpec,loadAmbienceLoopSpec,AMBIENCE_LOOP_KEYS} from './ownedAmbienceLoops.js';
const base=()=>import.meta.env?.BASE_URL??'/',durations={wind:29,fire:23,vinyl:18},integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
let assetPromise;
export function loadAmbienceLoopWorkerAssets(){
 return assetPromise??=(async()=>{const get=async file=>{const response=await fetch(`${base()}ambience-loops/${file}`);if(!response.ok)throw Error(`Missing ambience loop asset: ${file}`);return response;},manifest=await(await get('build.json')).json(),bytes=await(await get(`loops.wasm?v=${manifest.version}`)).arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(manifest.api!==1||typeof manifest.version!=='string'||!manifest.version||!/^[a-f0-9]{64}$/.test(manifest.wasm)||hash!==manifest.wasm)throw Error('Ambience loop Wasm integrity mismatch');if(manifest.hostSHA256)Object.freeze(manifest.hostSHA256);return Object.freeze({module:await WebAssembly.compile(bytes),manifest:Object.freeze(manifest)});})().catch(error=>{assetPromise=null;throw error;});
}
const abortError=message=>Object.assign(Error(message),{name:'AbortError'});
/** No fallback on the main thread. An active abort terminates its worker. */
export function createAmbienceLoopPreparer({loadAssets=loadAmbienceLoopWorkerAssets,makeWorker=url=>new Worker(url),maxPending=4,timeoutMs=30000}={}){
 if(!integer(maxPending,1,8)||!integer(timeoutMs,10,120000))throw Error('Invalid ambience worker request bounds');
 let disposed=false,worker=null,ready=false,loading=false,assets=null,generation=0,sequence=0,active=null,startupTimer=null;
 const queue=[],transfers=new Set(),counters={started:0,workerBegun:0,completed:0,cancelled:0,failed:0,staleMessages:0,detachedTransfers:0,transferFailures:0};
 function settle(job,error,result){if(job.settled)return;job.settled=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);if(error)job.reject(error);else job.resolve(result);}
 function closeWorker(){clearTimeout(startupTimer);startupTimer=null;ready=false;transfers.clear();const old=worker;worker=null;if(old)try{Promise.resolve(old.terminate()).catch(()=>{});}catch{/* already terminated */}}
 function failWorker(error){closeWorker();const job=active??queue.shift();active=null;if(job){counters.failed++;settle(job,error);}pump();}
 function abort(job){if(job.settled)return;counters.cancelled++;if(active===job){active=null;closeWorker();}else{const at=queue.indexOf(job);if(at>=0)queue.splice(at,1);}settle(job,abortError('Ambience loop preparation cancelled'));pump();}
 function receive(token,ownedWorker,data){
  if(disposed||worker!==ownedWorker||generation!==token||data?.generation!==token){counters.staleMessages++;return;}
  if(data.type==='ready'){if(data.identity?.version!==assets.manifest.version||data.identity?.wasm!==assets.manifest.wasm){failWorker(Error('Ambience loop worker identity mismatch'));return;}clearTimeout(startupTimer);startupTimer=null;ready=true;pump();return;}
  if(data.type==='transferred'){if(!transfers.delete(data.request)){counters.staleMessages++;return;}if(data.detached)counters.detachedTransfers++;else counters.transferFailures++;return;}
  if(!active||data.request!==active.id){counters.staleMessages++;return;}
  if(data.type==='preparing'){if(active.workerBegun){failWorker(Error('Duplicate ambience loop preparation acknowledgement'));return;}active.workerBegun=true;counters.workerBegun++;return;}
  if(data.type==='error'){failWorker(Error(data.message??'Ambience loop worker failed'));return;}
  if(data.type!=='prepared'){failWorker(Error('Unexpected ambience loop worker response'));return;}
  const job=active,expected=durations[job.spec.kind]*job.spec.sampleRate;
  if(data.version!==assets.manifest.version||data.wasm!==assets.manifest.wasm||data.kind!==job.spec.kind||data.rate!==job.spec.sampleRate||data.frames!==expected||data.pcmBytes!==expected*8||data.nonFinite!==0||!Number.isFinite(data.peak)||!Array.isArray(data.channels)||data.channels.length!==2||data.channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==expected||ch.byteOffset!==0||ch.byteLength!==ch.buffer.byteLength)||data.channels[0].buffer===data.channels[1].buffer||JSON.stringify(data.spec)!==JSON.stringify(job.spec)){failWorker(Error('Invalid ambience loop worker result'));return;}
  transfers.add(job.id);active=null;counters.completed++;settle(job,null,{channels:data.channels,rate:data.rate,kind:data.kind,version:data.version,wasm:data.wasm,spec:data.spec,frames:data.frames,workerGeneration:token,preparationMs:data.preparationMs,peak:data.peak,scope:'Owned fixed-seed source loop PCM only; native Ambience playback and spatial chains remain external'});pump();
 }
 function pump(){
  if(disposed||active||!queue.length||loading)return;
  if(!assets){loading=true;Promise.resolve().then(loadAssets).then(value=>{loading=false;if(disposed)return;if(!(value?.module instanceof WebAssembly.Module)||typeof value.manifest?.version!=='string'||!/^[a-f0-9]{64}$/.test(value.manifest.wasm))throw Error('Invalid ambience loop compiled asset');assets=value;pump();}).catch(error=>{loading=false;if(disposed)return;const job=queue.shift();if(job){counters.failed++;settle(job,error);}pump();});return;}
  if(!worker){try{const token=++generation,instance=makeWorker(`${base()}ambience-loops/prepare-worker.js?v=${assets.manifest.hostVersion??assets.manifest.version}`);worker=instance;instance.onmessage=({data})=>receive(token,instance,data);instance.onerror=error=>{if(!disposed&&worker===instance&&generation===token)failWorker(Error(error.message??'Ambience loop worker crashed'));};startupTimer=setTimeout(()=>{if(worker===instance&&generation===token)failWorker(Error('Ambience loop worker startup timed out'));},timeoutMs);instance.postMessage({type:'init',generation:token,module:assets.module,identity:{version:assets.manifest.version,wasm:assets.manifest.wasm}});}catch(error){failWorker(error);}return;}
  if(!ready)return;active=queue.shift();counters.started++;active.timer=setTimeout(()=>failWorker(Error('Ambience loop preparation timed out')),timeoutMs);try{worker.postMessage({type:'prepare',generation,request:active.id,spec:active.spec});}catch(error){failWorker(error);}
 }
 function prepareSpec(spec,{signal}={}){
  validateAmbienceLoopSpec(spec);const captured=loadAmbienceLoopSpec(saveAmbienceLoopSpec({version:1,kind:spec.kind,sampleRate:spec.sampleRate,parameters:Object.fromEntries(AMBIENCE_LOOP_KEYS[spec.kind].map(key=>[key,spec.parameters[key]]))}));
  if(signal&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw Error('Invalid ambience loop AbortSignal');
  if(disposed)return Promise.reject(Error('Ambience loop preparer disposed'));if(signal?.aborted)return Promise.reject(abortError('Ambience loop preparation cancelled'));if(queue.length+Number(!!active)>=maxPending)return Promise.reject(Error('Ambience loop request queue full'));
  return new Promise((resolve,reject)=>{const job={id:++sequence,spec:captured,resolve,reject,signal,settled:false,timer:null,abort:null};job.abort=()=>abort(job);signal?.addEventListener('abort',job.abort,{once:true});queue.push(job);pump();});
 }
 return {prepare:(kind,rate,shape={},options)=>prepareSpec(ambienceLoopSpec(kind,rate,shape),options),prepareSpec,stats:()=>({disposed,generation,queued:queue.length,active:active?.id??null,loading,ready,pending:queue.length+Number(!!active),...counters}),dispose(){if(disposed)return;disposed=true;closeWorker();if(active){settle(active,abortError('Ambience loop preparer disposed'));active=null;}for(const job of queue.splice(0))settle(job,abortError('Ambience loop preparer disposed'));}};
}
