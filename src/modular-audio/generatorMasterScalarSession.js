import{assertGeneratorMasterRate}from'./generatorMasterProfile.js';
import{generatorMasterScalarBirth}from'./generatorMasterScalarBirth.js';
import{generatorMainControlRoot}from'./generatorMainControlRoot.js';
import{prepareMainControlClock}from'./mainControlClockLease.js';
import{prepareColdMainScalarControls}from'./mainScalarColdGroup.js';
import{registerGeneratorMasterScalarRoot,generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
const pending=new WeakMap();
/** Explicit cold preparation beside the six-role Main root. The future caller
 * must publish these routes before source/runtime scopes capture destinations. */
export function prepareGeneratorMasterScalars(g,{signal}={}){
 assertGeneratorMasterRate(g?.AC);if(pending.has(g)||generatorMasterScalarRoot(g))throw Error('Master scalar session already exists');
 const birth=generatorMasterScalarBirth(g),main=generatorMainControlRoot(g),context=g.AC;
 if(!main||main.context!==context||main.status().state!=='cold'||context.state!=='suspended'||context.currentTime!==0)throw Error('Cold role root required before master scalar preparation');
 const record={state:'preparing',clock:null,group:null,root:null,error:null,groupAttempted:false};pending.set(g,record);g.masterScalarPreparation=true;
 const work=(async()=>{try{
  record.clock=await prepareMainControlClock(context,{signal});
  if(signal?.aborted)throw Object.assign(Error('Master scalar preparation cancelled'),{name:'AbortError'});
  record.groupAttempted=true;record.group=await prepareColdMainScalarControls(context).createCold({ambienceVolume:birth.ambienceVolume,signal,onError:issue=>{record.error??=issue;record.root?.quarantine(issue);}});
  record.root=registerGeneratorMasterScalarRoot(g,record.group,{clockLease:record.clock});
  if(record.error){record.root.quarantine(record.error);throw record.error;}
  record.state='ready';g.masterScalarPreparation=false;return record.root;
 }catch(thrown){
  const primary=thrown instanceof Error?thrown:Object.assign(Error('Master scalar preparation failed: '+String(thrown)),{cause:thrown});
  let clean=!primary.cleanupError;
  try{if(record.root){const receipt=await record.root.dispose();clean&&=receipt?.released===true&&receipt.clean===true;}
   else if(record.group){const receipt=await record.group.dispose(),status=record.group.status();clean&&=receipt?.released===true&&status.cleanupClean===true&&status.quotaReleased===true;}
   else if(primary.groupStatus){if(!primary.cleanupReady?.then)clean=false;else{const actual=await primary.cleanupReady;clean&&=actual?.clean===true&&actual.released===true&&primary.groupStatus.cleanupClean===true&&primary.groupStatus.quotaReleased===true;}}
   else if(record.groupAttempted)clean=false;
  }catch(cleanupError){clean=false;primary.cleanupError=cleanupError;}
  if(clean&&!record.clock?.status().closed)try{await record.clock?.release();}catch(cleanupError){clean=false;primary.cleanupError=cleanupError;}
  record.state=clean?'closed':'quarantined';
  if(clean){pending.delete(g);g.masterScalarPreparation=false;}else g.runtimeEnvironmentError??=primary;
  throw primary;
 }})();work.catch(()=>{});return work;
}
