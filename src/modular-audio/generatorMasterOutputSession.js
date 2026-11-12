import{assertGeneratorMasterRate}from'./generatorMasterProfile.js';
import{generatorMasterOutputBirth}from'./generatorMasterOutputBirth.js';
import{generatorMainControlRoot}from'./generatorMainControlRoot.js';
import{generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
import{prepareMainControlClock}from'./mainControlClockLease.js';
import{createGeneratorMasterOutputRoot,generatorMasterOutputRoot}from'./generatorMasterOutputRoot.js';
const sessions=new WeakMap();
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_OUTPUT_SESSION_REFUSED'});
/** Prepare the ninth control before the first resume. This session's clock
 * lease is separate from the leaf's retained lease and both parent lifetimes. */
export function prepareGeneratorMasterOutput(g,{signal}={}){
 assertGeneratorMasterRate(g?.AC);generatorMasterOutputBirth(g);
 if(sessions.has(g)||generatorMasterOutputRoot(g))throw refuse('Master-output session already exists');
 const context=g.AC,main=generatorMainControlRoot(g),scalars=generatorMasterScalarRoot(g);
 if(context.state!=='suspended'||context.currentTime!==0||!main||main.context!==context||main.status().state!=='cold'||!scalars||scalars.context!==context||scalars.status().state!=='cold')throw refuse('Actual cold role and scalar roots required');
 const record={state:'preparing',clock:null,root:null,attempted:false,error:null};sessions.set(g,record);g.masterOutputPreparation=true;
 const work=(async()=>{try{
  record.clock=await prepareMainControlClock(context,{signal});if(signal?.aborted)throw Object.assign(refuse('Master-output preparation cancelled'),{name:'AbortError'});
  record.attempted=true;record.root=await createGeneratorMasterOutputRoot(g,{clockLease:record.clock,signal});record.state='ready';g.masterOutputPreparation=false;return record.root;
 }catch(thrown){
  const primary=thrown instanceof Error?thrown:Object.assign(Error('Master-output preparation failed: '+String(thrown)),{cause:thrown});let clean=!primary.cleanupError;
  try{if(record.root){const actual=await record.root.dispose();clean&&=actual?.clean===true&&actual.released===true;}
   else if(record.attempted){if(!primary.cleanupReady?.then)clean=false;else{const actual=await primary.cleanupReady;clean&&=actual?.clean===true&&actual.released===true;}}
  }catch(cleanupError){clean=false;primary.cleanupError=cleanupError;}
  if(clean&&!record.clock?.status().closed)try{await record.clock?.release();}catch(cleanupError){clean=false;primary.cleanupError=cleanupError;}
  record.error=primary;record.state=clean?'closed':'quarantined';if(clean){sessions.delete(g);g.masterOutputPreparation=false;}else g.runtimeEnvironmentError??=primary;throw primary;
 }})();work.catch(()=>{});return work;
}
export const generatorMasterOutputSessionStatus=g=>{const record=sessions.get(g);return record?Object.freeze({state:record.state,error:record.error?String(record.error):null,clockClosed:record.clock?.status().closed??null}):null;};
