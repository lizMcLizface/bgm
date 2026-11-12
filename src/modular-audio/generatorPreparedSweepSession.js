import{prepareMainControlClock}from'./mainControlClockLease.js';
import{generatorMainControlRoot}from'./generatorMainControlRoot.js';
import{generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
import{generatorMasterOutputRoot}from'./generatorMasterOutputRoot.js';
import{createGeneratorPreparedSweep,generatorPreparedSweep}from'./generatorPreparedSweep.js';
import{acquireGeneratorSweepCell}from'./generatorSweepCell.js';
const sessions=new WeakMap();
export function prepareGeneratorSweep(g,{signal}={}){
 const context=g?.AC,main=generatorMainControlRoot(g),scalar=generatorMasterScalarRoot(g),output=generatorMasterOutputRoot(g);
 if(!context||context.state!=='suspended'||context.currentTime!==0||sessions.has(g)||generatorPreparedSweep(g)||!main||!scalar||!output||[main,scalar,output].some(root=>root.context!==context||root.status().state!=='cold'))throw Error('Prepare actual cold Main/scalar/output roots before optional Sweep');
 const record={state:'preparing',clock:null,owner:null,attempted:false};sessions.set(g,record);g.preparedSweepPreparation=true;
 const work=(async()=>{try{record.clock=await prepareMainControlClock(context,{signal});record.attempted=true;record.owner=await createGeneratorPreparedSweep(g,{clockLease:record.clock,outputRoot:output,scalarRoot:scalar,signal});record.state='cold';g.preparedSweepPreparation=false;
  return Object.freeze({profile:'generator-prepared-sweep-session-v1',context,owner:record.owner,
   async arm(){try{await record.owner.arm();acquireGeneratorSweepCell(g);record.state='armed';return record.owner;}catch(primary){g.runtimeEnvironmentError??=primary;try{await record.owner.dispose();}catch(cleanupError){primary.cleanupError??=cleanupError;}throw primary;}},
   dispose:()=>record.owner.dispose(),status:()=>({state:record.state,owner:record.owner.status()})
  });
 }catch(thrown){const primary=thrown instanceof Error?thrown:Object.assign(Error('Prepared Sweep failed: '+String(thrown)),{cause:thrown});g.runtimeEnvironmentError??=primary;let clean=!primary.cleanupError;try{if(record.owner){const receipt=await record.owner.dispose();clean&&=receipt?.released===true&&receipt.clean===true;}else if(record.attempted){if(!primary.cleanupReady?.then)clean=false;else{const receipt=await primary.cleanupReady;clean&&=receipt?.released===true&&receipt.clean===true;}}}catch(cleanupError){clean=false;primary.cleanupError??=cleanupError;}if(clean&&!record.clock?.status().closed)try{await record.clock?.release();}catch(cleanupError){clean=false;primary.cleanupError??=cleanupError;}record.state=clean?'closed':'quarantined';g.preparedSweepPreparation=!clean;throw primary;}})();work.catch(()=>{});return work;
}
