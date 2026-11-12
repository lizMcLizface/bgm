import{verifyGeneratorPreparedSweepRoute,generatorPreparedSweepHasRoute,generatorPreparedSweepResources,isolateGeneratorPreparedSweep}from'./generatorPreparedSweep.js';
import{prepareColdMainOutputRoot,planMainOutputOperation}from'./mainOutputColdRoot.js';
import{isMainControlClockLease}from'./mainControlClockLease.js';
import{generatorMainControlRoot}from'./generatorMainControlRoot.js';
import{generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
import{verifyMainScalarClockCertificate}from'./mainScalarColdGroup.js';
import{generatorMasterOutputBirth}from'./generatorMasterOutputBirth.js';
import{assertGeneratorMasterRate}from'./generatorMasterProfile.js';
const roots=new WeakMap();
export const GENERATOR_MASTER_OUTPUT_PROFILE='generator-master-output-root-v1';
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_OUTPUT_REFUSED'});
const normalize=issue=>issue instanceof Error?issue:Object.assign(Error('Master-output failure: '+String(issue)),{cause:issue});
const aborted=()=>Object.assign(refuse('Master-output preparation cancelled'),{name:'AbortError'});
/** Creates the trusted leaf internally. No caller-supplied shape can certify a
 * scalar actor, Native endpoints, or its private retained Source7a clock. */
export async function createGeneratorMasterOutputRoot(g,{clockLease,signal}={}){
 let birth,context,main,scalars;try{
 assertGeneratorMasterRate(g?.AC);
 birth=generatorMasterOutputBirth(g);context=g.AC;main=generatorMainControlRoot(g);scalars=generatorMasterScalarRoot(g);
 if(roots.has(g)||!isMainControlClockLease(clockLease)||clockLease.context!==context||clockLease.status().closed||context.state!=='suspended'||context.currentTime!==0||!main||main.context!==context||main.status().state!=='cold'||!scalars||scalars.context!==context||scalars.status().state!=='cold')throw refuse('Actual cold role and scalar roots plus a retained context clock are required');
 if(g.runtimePublishedOwner||g.runtimeEnvironmentReady||g.isRunning||g.ambienceRunning||g.liveNotes?.size||g.sweep||g.mixReturn||g.reverbHub||g.wasmRoomPool)throw refuse('Virgin stopped unswept master-output route required');
 const cold=scalars.group.verifyClock(clockLease.value);verifyMainScalarClockCertificate(cold,{group:scalars.group,context,clock:clockLease.value});
 if(cold.state!=='cold'||cold.firstFrame!==null)throw refuse('Actual cold scalar certificate required');
 }catch(thrown){const primary=normalize(thrown);primary.cleanupReady=Promise.resolve({released:true,clean:true,empty:true});throw primary;}
 let leaf=null,state='preparing',error=null,activation=null,closing=null,input=null,output=null,destination=null;
 let mainBorrow=null,scalarBorrow=null,leafAttempted=false,sequence=0,closedRelease=null;const closedReleaseErrors=[];const borrows=new Set(),edits=[];
 const snapshot=()=>({profile:GENERATOR_MASTER_OUTPUT_PROFILE,state,error:error?String(error):null,borrows:borrows.size,mainBorrow:!!mainBorrow,scalarBorrow:!!scalarBorrow,leaf:leaf?.status()??null,contextClosedRelease:closedRelease!==null,contextClosedErrors:closedReleaseErrors.slice(),routing:edits.map(({add,done})=>({add,done}))});
 const remove=(from,to,issues)=>{try{from.disconnect(to);}catch(issue){if(issue?.name!=='InvalidAccessError')issues.push(issue);}};
 const isolate=()=>{const issues=[];try{isolateGeneratorPreparedSweep(g,{outputRoot:root});}catch(issue){issues.push(issue);}if(output&&destination)remove(output,destination,issues);if(input)remove(birth.output,input,issues);if(destination)remove(birth.output,destination,issues);if(issues.length)error.isolationError=new AggregateError(issues,'Master-output isolation failed');};
 const fail=issue=>{if(!error)error=normalize(issue);if(state!=='disposed')state='quarantined';g.runtimeEnvironmentError??=error;isolate();for(const parent of[scalars,main])try{parent.quarantine(error);}catch(cleanupError){error.parentIsolationError??=cleanupError;}return error;};
 const parentCheck=()=>{main.check();scalars.check();main.verifyColdNativeClock(clockLease.value);const proof=scalars.verifyClock();verifyMainScalarClockCertificate(proof,{group:scalars.group,context,clock:clockLease.value});if(proof.state!=='active'||proof.firstFrame!==0||proof.scalars!==2)throw refuse('Actual active scalar clock certificate differs');};
 function check(){
  if(error)throw error;if(state!=='active')throw refuse('Master-output root is not active');
  try{generatorMasterOutputBirth(g);if(context.state!=='running'||clockLease.status().closed||roots.get(g)!==root)throw refuse('Master-output context/session is retired');parentCheck();leaf.check();if(leaf.input!==input||leaf.output!==output||scalars.trimDestination()!==destination)throw refuse('Actual private master-output endpoints changed');mainBorrow.check();scalarBorrow.check();if(g.sweep||generatorPreparedSweepHasRoute(g))verifyGeneratorPreparedSweepRoute(g,{outputRoot:root,clock:clockLease.value,from:output,to:destination,sweep:g.sweep});}catch(issue){throw fail(issue);}return true;
 }
 function publish(){
  generatorMasterOutputBirth(g);if(g.runtimePublishedOwner||g.runtimeEnvironmentReady||g.isRunning||g.ambienceRunning||g.liveNotes?.size||g.sweep)throw refuse('Stopped master-output routing changed during preparation');
  input=leaf.input;output=leaf.output;destination=scalars.trimDestination();
  if([input,output,destination].some(value=>value?.context!==context||typeof value.connect!=='function'||typeof value.disconnect!=='function')||new Set([birth.output,input,output,destination]).size!==4)throw refuse('Independent actual master-output program endpoints required');
  const plan=[{from:birth.output,to:destination,add:false},{from:birth.output,to:input,add:true},{from:output,to:destination,add:true}];
  for(const edit of plan){edits.push(edit);if(edit.add)edit.from.connect(edit.to);else edit.from.disconnect(edit.to);edit.done=true;}
  state='active';return root;
 }
 function onClosed(){if(context.state!=='closed'||closedRelease)return;closedRelease=(async()=>{for(const lease of[scalarBorrow,mainBorrow,clockLease])if(lease)try{await lease.release();}catch(issue){closedReleaseErrors.push(String(issue));}context.removeEventListener?.('statechange',onClosed);})();closedRelease.catch(()=>{});}
 function dispose(){
  if(closing)return closing;if(g.stopFade||g.fadeTimer||g.endTimer)throw refuse('Finish authored master timers before master-output destruction');if(borrows.size||context.state!=='closed'&&(g.isRunning||g.ambienceRunning||g.liveNotes?.size))throw refuse('Finish source/runtime borrows before master-output destruction');
  state='disposing';closing=(async()=>{const issues=[];if(output&&destination)remove(output,destination,issues);if(input)remove(birth.output,input,issues);let receipt;
   try{receipt=await leaf.dispose();if(activation)await Promise.allSettled([activation]);const status=leaf.status();if(receipt?.released!==true||receipt.clean!==true||status.state!=='disposed'||status.quotaReleased!==true||status.owner?.cleanupClean!==true)throw refuse('Master-output lacks actual wholly clean Source retirement');}catch(issue){issues.push(issue);}
   // Dependency borrows and the session clock remain held on uncertainty.
   if(!issues.length){for(const lease of[scalarBorrow,mainBorrow])if(lease)try{const released=await lease.release();if(released?.released!==true)throw refuse('Parent borrow release is uncertain');}catch(issue){issues.push(issue);}}
   if(!issues.length)try{await clockLease.release();}catch(issue){issues.push(issue);}
   if(issues.length)throw fail(new AggregateError(issues,'Master-output retirement failed; dependencies retained'));
   scalarBorrow=mainBorrow=null;context.removeEventListener?.('statechange',onClosed);state='disposed';return{profile:GENERATOR_MASTER_OUTPUT_PROFILE,released:true,clean:true,healthError:error?String(error):null,terminal:receipt};
  })();closing.catch(()=>{});return closing;
 }
 const root=Object.freeze({profile:GENERATOR_MASTER_OUTPUT_PROFILE,context,
  activate(){
   if(error)return Promise.reject(error);if(state==='active'){try{check();return activation;}catch(issue){return Promise.reject(issue);}}
   if(activation){if(state==='activating'&&context.state==='running')return activation;return Promise.reject(refuse('Master-output activation authority is retired'));}
   if(state!=='cold'||context.state!=='running')return Promise.reject(refuse('Explicit first resume before master-output activation required'));
   state='activating';const continuing=()=>{if(state!=='activating'||signal?.aborted)throw aborted();};activation=(async()=>{try{continuing();await main.activate();continuing();await scalars.activate();continuing();parentCheck();mainBorrow=main.borrow();scalarBorrow=scalars.borrow();await leaf.arm();continuing();await leaf.activate();continuing();parentCheck();return publish();}catch(issue){throw fail(issue);}})();activation.catch(()=>{});return activation;
  },
  check,quarantine:fail,
  applyOperation(operation,{activeFade,beforePublication,afterPublication}={}){
   check();for(const callback of[beforePublication,afterPublication])if(callback!==undefined&&(typeof callback!=='function'||callback.constructor?.name==='AsyncFunction'))throw refuse('Synchronous parent callbacks required before output reservation');
   const options=activeFade===undefined?{}:{activeFade},plan=planMainOutputOperation(operation,options);if(plan.noop)return plan;
   const token=root.reserve(plan.commands);try{return root.commit(token,{beforePublication,afterPublication});}catch(thrown){
    const primary=normalize(thrown);try{if(leaf.status().reserved)leaf.cancel(token);}catch(cleanupError){primary.cleanupError=primary.cleanupError?new AggregateError([primary.cleanupError,cleanupError],'Output reservation cleanup failed'):cleanupError;throw fail(primary);}
    if(leaf.status().error)throw fail(primary);throw primary;
   }
  },
  reserve(commands){check();return leaf.reserve(commands);},commit(token,callbacks){check();try{return leaf.commit(token,callbacks);}catch(issue){if(leaf.status().error)throw fail(issue);throw issue;}},cancel(token){check();return leaf.cancel(token);},
  flush(){check();return leaf.flush();},stats(){check();return leaf.stats();},
  postFadeOutput(){check();return output;},
  protectedResources(){check();return[root,leaf,birth.output,input,output,destination,...generatorPreparedSweepResources(g)];},
  borrow(){check();if(borrows.size>=16||sequence===0xffffffff)throw refuse('Master-output borrow bound');const id=++sequence,key={};borrows.add(key);let released=false;return Object.freeze({root,context,id,check(){check();if(released)throw refuse('Released master-output borrow');},release(){if(!released){released=true;borrows.delete(key);}return Promise.resolve({released:true,clean:true});},status:()=>({id,released})});},
  dispose,status:snapshot
 });
 try{
  if(signal?.aborted)throw aborted();leafAttempted=true;leaf=await prepareColdMainOutputRoot(context,{clockLease,signal,onError:fail});
  if(!leaf||!Object.isFrozen(leaf)||leaf.context!==context||leaf.profile!=='main-output-cold-root-v1'||leaf.status().state!=='cold')throw refuse('Trusted cold output leaf differs');
  if(signal?.aborted)throw aborted();if(error)throw error;if(context.state!=='suspended'||context.currentTime!==0)throw refuse('Master-output cold prerequisite advanced');state='cold';roots.set(g,root);context.addEventListener?.('statechange',onClosed);return root;
 }catch(thrown){
  const primary=normalize(thrown);let cleanupReady;
  if(leaf){cleanupReady=dispose();}
  else if(!leafAttempted){cleanupReady=Promise.resolve({released:true,clean:true,empty:true});}
  // A rejected foreign/partial leaf with no returned owner is not certified
  // from a status snapshot. The outer session retains its actual clock.
  if(cleanupReady){primary.cleanupReady=cleanupReady;cleanupReady.catch(()=>{});}primary.masterOutputStatus=snapshot();throw primary;
 }
}
export const generatorMasterOutputRoot=g=>roots.get(g)??null;
export function mainMasterOutputProtectedResources(g){const root=roots.get(g);return root?root.protectedResources():[];}
export const disposeGeneratorMasterOutput=g=>roots.get(g)?.dispose()??Promise.resolve({released:true,clean:true,empty:true});
export function mainMasterPostFadeOutput(g){const root=roots.get(g);return root?root.postFadeOutput():g?.output;}
