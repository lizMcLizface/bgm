import{prepareOwnedHostEnvironment}from'./ownedHostEnvironment.js';
import{prepareClockedRackNative}from'./nativeClockedRackFactory.js';
import{CONTINUOUS_PREPARED_CONTEXT}from'./contextLifecyclePolicy.js';
import{prepareNativeContextClock}from'./nativeContextClock.js';
import{prepareClockedRackDynamics}from'./clockedRackDynamicsFactory.js';
/** Explicit continuous-context host. External suspension retires owners;
 * resume needs an explicit stopped reconstruction. Native defaults stay intact. */
export async function prepareClockedOwnedHostEnvironment(context){
 const original=await prepareOwnedHostEnvironment(context),[rackNativeFactory,rackDynamicsFactory,clock]=await Promise.all([prepareClockedRackNative(context),prepareClockedRackDynamics(context),prepareNativeContextClock(context,typeof context.startRendering==='function'?{offlineSuspension:'offline-freeze-v1'}:{})]);
 return Object.freeze({...original,rackNativeFactory,rackDynamicsFactory,
  contextLifecycle:typeof context.startRendering==='function'?undefined:CONTINUOUS_PREPARED_CONTEXT,checkRuntime:()=>clock.check(),
  prepareContext:next=>prepareClockedOwnedHostEnvironment(next),
  boundaries:Object.freeze({...original.boundaries,rackDynamics:'Owned original compressor/limiter with authoritative Native frames and physically isolated initial controls',rackNative:'Owned original Width/Ring with independently decoded Native context frames; original controls, hot insertion and output demand',contextClock:'Explicit continuous context while prepared; no automatic idle suspend; unexpected live suspension retires owners and requires explicit offroute reconstruction; Offline freeze is separate',defaultChanged:false})
 });
}
