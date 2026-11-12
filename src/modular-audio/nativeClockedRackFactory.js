import {prepareNativeContextClock} from './nativeContextClock.js';
import {ClockedRackExtraStage} from './nativeClockedRackExtra.js';
const prepared = new WeakMap(), assetLoads = new WeakMap();
const identifier = /^[a-f0-9]{16}$/;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function readAssets(context) {
 const root=(import.meta.env?.BASE_URL??'/'), read=async path=>{
  const response=await fetch(root+path,{cache:'no-store'});
  if(!response.ok)throw Error('Missing clocked Width/Ring asset '+path);
  return response;
 };
 const manifest=await(await read('rack-native-normal/build.json')).json();
 const host=await(await read('rack-native-clocked/build.json')).json();
 if(manifest.api!==1||manifest.audited||manifest.profile!=='native-rack-independent-lanes-v1'||!identifier.test(manifest.version)||host.api!==1||host.profile!=='native-context-clocked-width-ring-v1'||!identifier.test(host.version)||!identifier.test(host.nativeClockVersion)||host.kernelVersion!==manifest.version||host.wasm!==manifest.wasm||host.processorName!=='native-rack-clocked-'+host.version)throw Error('Clocked Width/Ring dependency identity differs');
 const [wasm,processor]=await Promise.all([read('rack-native-normal/rack.wasm?v='+manifest.version).then(r=>r.arrayBuffer()),read('rack-native-clocked/processor.js?v='+host.version).then(r=>r.arrayBuffer())]);
 if(wasm.byteLength!==manifest.bytes||await hash(wasm)!==manifest.wasm||await hash(processor)!==host.processor)throw Error('Clocked Width/Ring immutable bytes differ');
 const module=await WebAssembly.compile(wasm);
 let timer;
 try {await Promise.race([context.audioWorklet.addModule(root+'rack-native-clocked/processor.js?v='+host.version),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Clocked Width/Ring registration timed out')),10000))]);}finally{clearTimeout(timer);}
 return{manifest,host,module};
}
function assets(context){
 if(assetLoads.has(context))return assetLoads.get(context);
 const attempt=readAssets(context);assetLoads.set(context,attempt);
 attempt.catch(()=>{if(assetLoads.get(context)===attempt)assetLoads.delete(context);});
 return attempt;
}
/** Preserve an independent disposal ACK after a typed primary clock failure. */
export function attachClockRetirementReceiver(stage,getLease){
 const receive=stage.inner.receive?.bind(stage.inner);
 if(receive)stage.inner.receive=data=>{
  if(data?.kind!=='native-clock-retired')return receive(data);
  if(data.generation!==getLease()?.spec.generation){stage.cleanupError='Retired clock acknowledgement generation differs';stage.fail(Error(stage.cleanupError));return;}
  stage.inner.clockRetirement={generation:data.generation,error:data.error};
  stage.inner.error??=data.error;
  if(data.stats){stage.inner.cached=data.stats;stage.inner.failureState??=data.stats.failureState;}
  if(!stage.disposed)stage.fail(Error(data.error));
 };
}
/** NEW opt-in facade. The preserved outer stage and numeric Wasm remain original.
 * The context clock is shared by owners; each owner releases only its own links. */
export function prepareClockedRackNative(context) {
 if(prepared.has(context)){
  const previous=prepared.get(context);
  return previous.then(factory=>{
   if(!factory.clockSnapshot().retired)return factory;
   if(prepared.get(context)===previous)prepared.delete(context);
   return prepareClockedRackNative(context);
  });
 }
 const attempt=(async()=>{
  const verified=await assets(context),clock=await prepareNativeContextClock(context,typeof context.startRendering==='function'?{offlineSuspension:'offline-freeze-v1'}:{});
  if(clock.snapshot().version!==verified.host.nativeClockVersion)throw Error('Clocked rack source-clock identity differs');
  const factory=(ac,options={})=>{
   if(ac!==context)throw Error('Clocked rack factory belongs to another context');
   clock.check();
   const stage=new ClockedRackExtraStage(ac,verified,{...options,facadeVersion:verified.host.version});
   const originalDispose=stage.dispose.bind(stage);
   let lease,disposal;
   stage.dispose=()=>{
    if(disposal)return disposal;
    let closed;try{closed=Promise.resolve(originalDispose());}catch(error){closed=Promise.reject(error);}
    disposal=(async()=>{
     const errors=[];try{await closed;}catch(error){errors.push(error);}
     // Clock inputs remain valid until the processor independently acknowledges release.
     try{await lease?.release();}catch(error){errors.push(error);}
     for(const error of[stage.cleanupError,stage.inner?.cleanupError])if(error)errors.push(Error(error));
     if(errors.length)throw new AggregateError(errors,'Clocked rack owner cleanup failed');
    })();
    disposal.catch(()=>{});
    return disposal;
   };
   const prepareInput=stage.prepareInitial.bind(stage);stage.clockedProgramConnected=false;
   stage.prepareInitial=async()=>{await prepareInput();stage.alive?.();if(!stage.clockedProgramConnected){try{stage.input.connect(stage.inner.input);stage.clockedProgramConnected=true;}catch(error){stage.fail(error);throw error;}}return stage;};
   attachClockRetirementReceiver(stage,()=>lease);
   try {
    lease=clock.connect(stage.inner.node,{onError:error=>stage.fail(error)});
    for(const key of['patch','prepareInitial','arm','setHostAwake']){
     const original=stage[key].bind(stage);
     stage[key]=(...args)=>{try{clock.check();}catch(error){stage.fail(error);throw error;}return original(...args);};
    }
    stage.ready=Promise.all([stage.ready,lease.ready]).then(()=>stage);
    stage.clockSnapshot=()=>clock.snapshot();
    return stage;
   } catch(error) {
    stage.dispose().catch(cleanup=>{stage.cleanupError=String(cleanup);});
    throw error;
   }
  };
  Object.defineProperties(factory,{
   engineVersion:{value:verified.host.version},facadeVersion:{value:verified.host.version},
   kernelVersion:{value:verified.manifest.version},hostVersion:{value:verified.host.version},
   controlContract:{value:'original-per-lane-currentTime'},
   activationContract:{value:'native-context-clock;offroute-realtime-control-warmup;offline-epoch0'},
   clockSnapshot:{value:()=>clock.snapshot()}
  });
  return Object.freeze(factory);
 })();
 prepared.set(context,attempt);
 attempt.catch(()=>{if(prepared.get(context)===attempt)prepared.delete(context);});
 return attempt;
}
