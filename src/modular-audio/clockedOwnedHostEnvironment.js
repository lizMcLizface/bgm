import{prepareOwnedHostEnvironment}from'./ownedHostEnvironment.js';
import{prepareClockedRackNative}from'./nativeClockedRackFactory.js';
import{prepareClockedRackDynamics}from'./clockedRackDynamicsFactory.js';
/** Explicit All/desktop integration only. Main-player idle resume retains its
 * existing environment until a separate live suspension policy is accepted. */
export async function prepareClockedOwnedHostEnvironment(context){
 const original=await prepareOwnedHostEnvironment(context),[rackNativeFactory,rackDynamicsFactory]=await Promise.all([prepareClockedRackNative(context),prepareClockedRackDynamics(context)]);
 return Object.freeze({...original,rackNativeFactory,rackDynamicsFactory,
  prepareContext:next=>prepareClockedOwnedHostEnvironment(next),
  boundaries:Object.freeze({...original.boundaries,rackDynamics:'Owned original compressor/limiter with authoritative Native frames and physically isolated initial controls',rackNative:'Owned original Width/Ring with independently decoded Native context frames; original controls, hot insertion and output demand',contextClock:'Explicit Native loop/cycle authority; live suspension retires owners and requires offroute reconstruction; Offline freeze profile is separately accepted',defaultChanged:false})
 });
}
