import {reserveContextPreparation} from './contextPreparationRegistry.js';
import {STOPPED_RUNTIME_ROLES,assertStoppedSourceRetirementAuthority} from './stoppedRuntimeSnapshot.js';
import {retireAudioActions} from '../audio/retireAudio.js';

const LIMIT=13,HISTORY=32;
const abort=()=>Object.assign(Error('Stopped source replacement was cancelled'),{name:'AbortError'});
const fail=(message,code='STOPPED_SOURCE_REFUSED')=>Object.assign(Error(message),{code});
const sync=(value,label)=>{if(value?.then)throw fail(label+' must be synchronous');return value;};
const native=(node,context)=>node&&node.context===context&&typeof node.connect==='function'&&typeof node.disconnect==='function';
function captured(value,owner){
 if(!value||value.owner!==owner||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.state!=='string'||value.state.length>131072)throw fail('Explicit bounded source/settings revision required');
 return {owner,revision:value.revision,state:value.state};
}
const same=(a,b)=>a.owner===b.owner&&a.revision===b.revision&&a.state===b.state;
function activity(value){
 if(!value||value.version!==1)throw fail('Explicit source activity authority required');
 for(const key of ['music','ambience','pendingStart','fade'])if(value[key]!==false)throw fail('Stopped-only source replacement requires '+key+' false');
 for(const key of ['held','liveNotes','futureBookings','sourceInputs','preparations','retirements'])if(value[key]!==0)throw fail('Stopped-only source replacement requires '+key+' zero');
}
/** A mutable source ledger captured by the outer scope BEFORE publication.
 * Initial-source cleanup delegates to releaseInitial(); later child scopes are
 * owned internally. No resource is added to an immutable published scope.
 * The app binding must provide the real logical/Native rollback journal. */
export function createStoppedSourceAuthority({context,slots,readActivity,capture,validateSpec,create,makeBinding,releaseCandidate=owner=>owner.dispose(),checkRuntime=()=>{},disposeDeadlineMs=15000,timers=globalThis}={}){
 if(!context||typeof context.startRendering==='function'||!Array.isArray(slots)||slots.length!==6||[readActivity,capture,validateSpec,create,makeBinding,releaseCandidate,checkRuntime].some(fn=>typeof fn!=='function')||!Number.isInteger(disposeDeadlineMs)||disposeDeadlineMs<1||disposeDeadlineMs>30000)throw fail('Complete stopped source authority callbacks required');
 const current=new Map(),records=new WeakMap(),actors=new Set(),history=[];let scope=null,pending=null,sequence=0,closing=null,closed=false,failure=null;
 const note=(kind,role,fields={})=>{history.push({kind,role,...fields});if(history.length>HISTORY)history.shift();};
 const runtime=()=>{if(closed||closing)throw fail('Source authority is retiring');if(failure)throw failure;if(context.state!=='running')throw fail('Running source context required');sync(checkRuntime(),'Runtime check');};
 const stopped=role=>{runtime();activity(sync(readActivity(role),'Activity read'));};
 function own(role,owner,release){
  if(!owner||typeof release!=='function'||records.has(owner)||actors.size>=LIMIT)throw fail('Independent bounded source actor required');
  if(!native(owner.output?.getNode?.()??owner.output,context))throw fail('Same-context source output required');
  assertStoppedSourceRetirementAuthority(owner,role);
  // Capture exact actor/node readers BEFORE disposal clears owner pointers.
  const readers=[],seen=new Set(),sourceActors=[owner,owner.voice?.backend,owner.player,owner.live,...(owner.lives??[]),owner.offlineNode,owner.pianoSource,owner.pluckedSource].filter(Boolean);
  if(sourceActors.length>16)throw fail('Source terminal actor bound exceeded');
  for(const actor of sourceActors){const node=actor.node??(actor.port?actor:null);for(const object of [actor,node])if(object&&!seen.has(object)){seen.add(object);if(typeof object.sourceDisposalStatus==='function')readers.push(()=>object.sourceDisposalStatus());else if(typeof object.disposalStatus==='function')readers.push(()=>object.disposalStatus());}}
  const record={role,owner,release,readers,fence:null,child:null,closed:false,error:null};records.set(owner,record);actors.add(record);return record;
 }
 function terminal(record){
  const health=record.readers.map(read=>read()),ownerFailures=[...new Set([record.owner.error,record.owner.disposalError,record.owner.retirementFailure,record.owner.voice?.disposalError].filter(Boolean))];
  if(ownerFailures.length)throw Object.assign(new AggregateError(ownerFailures,'Source enclosing owner reported a terminal failure'),{code:'STOPPED_SOURCE_CLEANUP_UNCERTAIN',diagnostics:{role:record.role,health}});
  for(const value of health)if(!value||value.quarantined||value.error||value.cleanupErrors?.length||value.processorErrors?.length||value.errors?.length||value.profile==='source-terminal-receipt-v1'&&value.released!==true||value.profile==='percussion-ack-lifecycle-v1'&&(value.state!=='disposed'||value.nodeRetained!==false||value.ack?.released!==true||value.ack?.clean!==true))throw Object.assign(fail('Source terminal receipt is not clean','STOPPED_SOURCE_CLEANUP_UNCERTAIN'),{diagnostics:{role:record.role,health}});
  return health;
 }
 function releaseRecord(record){
  if(record.fence)return record.fence;
  const actual=Promise.resolve().then(()=>record.release(record.owner)).then(receipt=>{
   if(receipt?.clean===false||receipt?.released===false||receipt?.acknowledged===false||receipt?.quarantined===true)throw fail('Source release reported uncertainty','STOPPED_SOURCE_CLEANUP_UNCERTAIN');
   const health=terminal(record);record.closed=true;actors.delete(record);note('released',record.role,{health});return receipt;
  });let timer;actual.catch(()=>{});const work=Promise.race([actual,new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(fail('Source terminal release deadline exceeded; ownership is uncertain','STOPPED_SOURCE_CLEANUP_UNCERTAIN')),disposeDeadlineMs);})]).finally(()=>timers.clearTimeout(timer)).catch(error=>{record.error=error;failure??=error;note('release-failed',record.role,{error:String(error)});throw error;});
  record.fence=work;work.catch(()=>{});return work;
 }
 const retireRecord=record=>record.child?record.child.retire():releaseRecord(record);
 for(const entry of slots){
  if(!entry||!STOPPED_RUNTIME_ROLES.includes(entry.role)||current.has(entry.role)||!native(entry.destination,context))throw fail('Six unique explicit role destinations required');
  const record=own(entry.role,entry.owner,entry.release);current.set(entry.role,{record,destination:entry.destination});
 }
 function selected(){
  runtime();if(!scope||scope.value?.sourceAuthority!==api||scope.context!==context||scope.snapshot().state!=='published')throw fail('Registered current source authority required');
  for(const[role,slot]of current)captured(sync(capture(role),'Source capture'),slot.record.owner);
 }
 function prepare(role,spec,{signal,isCurrent=()=>true}={}){
  stopped(role);selected();if(pending)throw fail('Another source replacement is pending');if(!current.has(role)||typeof isCurrent!=='function')throw fail('Unknown role or replacement authority');
  if(signal?.aborted)throw abort();const encoded=JSON.stringify(spec);if(typeof encoded!=='string'||encoded.length>131072)throw fail('Bounded source specification required');sync(validateSpec(role,spec),'Source specification admission');
  const slot=current.get(role),before=captured(sync(capture(role),'Source capture'),slot.record.owner),initial=slot.record;
  if(sequence===0xffffffff)throw fail('Source replacement sequence exhausted');
  const reservation=reserveContextPreparation(context,{label:'stopped-source-'+role,wake:true,signal,isCurrent}),ticket={id:++sequence,role,record:null,reservation,state:'preparing',binding:null,published:null};pending=ticket;
  const exact=()=>{stopped(role);selected();if(pending!==ticket||reservation.signal.aborted||!isCurrent()||current.get(role)!==slot||slot.record!==initial||!same(before,captured(sync(capture(role),'Source capture'),initial.owner))||JSON.stringify(spec)!==encoded)throw abort();};
  const ready=(async()=>{try{await reservation.ready;exact();ticket.record=await reservation.track(async()=>{
   let owner,ownedRecord;try{owner=await create({context,role,spec:JSON.parse(encoded),signal:reservation.signal});const record=ownedRecord=own(role,owner,releaseCandidate);ticket.record=record;await owner.ready;await owner.sourceReady;assertStoppedSourceRetirementAuthority(owner,role);return record;}catch(error){if(owner&&!records.has(owner))try{await releaseCandidate(owner);}catch(cleanupError){error.cleanupError=cleanupError;failure??=cleanupError;}else if(ownedRecord)try{await releaseRecord(ownedRecord);}catch(cleanupError){error.cleanupError=cleanupError;}throw error;}
  },record=>releaseRecord(record));exact();ticket.state='prepared';return handle;}catch(error){ticket.state='failed';if(error.cleanupError)failure??=error.cleanupError;try{await reservation.cancel(error);}catch(cleanupError){error.cleanupError=cleanupError;failure??=cleanupError;}if(pending===ticket)pending=null;throw error;}})();ready.catch(()=>{});
  const handle=Object.freeze({ready,async cancel(){if(ticket.published)throw fail('Published source requires explicit authority retirement');await reservation.cancel(abort());ticket.state='closed';if(pending===ticket)pending=null;},async commit(){
   await ready;if(ticket.state!=='prepared')throw fail('Source candidate is not prepared');
   let binding,rollbackAttempted=false;const rollback=()=>{if(rollbackAttempted)return;rollbackAttempted=true;if(binding&&typeof binding.restore==='function')sync(binding.restore(),'Source rollback');};
   try{exact();binding=ticket.binding=sync(makeBinding({context,role,previous:initial.owner,candidate:ticket.record.owner,destination:slot.destination,spec:JSON.parse(encoded)}),'Source binding');
    if(!binding||['preflight','install','publish','restore'].some(key=>typeof binding[key]!=='function'||binding[key].constructor?.name==='AsyncFunction'))throw fail('Explicit synchronous source rollback binding required');
    sync(binding.preflight(),'Source preflight');exact();sync(binding.install(),'Source edge install');ticket.published=reservation.publish(()=>{try{sync(binding.publish(),'Source pointer publication');slot.record=ticket.record;return Object.freeze({sourceAuthority:api,role,owner:ticket.record.owner});}catch(error){try{rollback();}catch(cleanupError){error.cleanupError=cleanupError;failure??=cleanupError;}throw error;}});ticket.record.child=ticket.published;ticket.state='published';note('published',role,{sequence:ticket.id});
    try{if(binding.afterPublish)await binding.afterPublish();await retireRecord(initial);}catch(error){failure??=error;error.publishedSource={role,owner:ticket.record.owner,scope:ticket.published};throw error;}return{role,owner:ticket.record.owner,previousReleased:true,sequence:ticket.id};
   }catch(error){if(!ticket.published){try{rollback();}catch(cleanupError){error.cleanupError=cleanupError;failure??=cleanupError;}try{await reservation.cancel(error);}catch(cleanupError){error.cleanupError=cleanupError;failure??=cleanupError;}ticket.state='failed';}throw error;}finally{if(pending===ticket)pending=null;}
  },status:()=>({role,sequence:ticket.id,state:ticket.state,reservation:reservation.snapshot(),published:!!ticket.published})});return handle;
 }
 const api=Object.freeze({version:1,profile:'stopped-source-slots-v1',context,prepare,
  bind(published){runtime();if(scope||!published||published.context!==context||published.value?.sourceAuthority!==api||typeof published.retire!=='function'||typeof published.snapshot!=='function'||published.snapshot().state!=='published')throw fail('Exact parent scope must capture this source authority');scope=published;},
  current(role){const slot=current.get(role);if(!slot)throw fail('Unknown source role');return slot.record.owner;},
  retireOwned(owner){const record=records.get(owner);if(!record)throw fail('Unknown captured source owner');return retireRecord(record);},
  releaseInitial(owner){const record=records.get(owner);if(!record)throw fail('Unknown initial source cleanup authority');return releaseRecord(record);},
  check(){selected();},
  dispose(){if(closing)return closing;closed=true;const actions=[];if(pending&&!pending.published)actions.push(()=>pending.reservation.cancel(abort()));for(const record of actors)actions.push(()=>retireRecord(record));closing=retireAudioActions(actions,'Stopped source authority retirement failed').then(()=>{if(failure)throw failure;});closing.catch(()=>{});return closing;},
  status:()=>({version:1,profile:'stopped-source-slots-v1',registered:!!scope,closed,pending:pending?{role:pending.role,state:pending.state}:null,actors:actors.size,current:Object.fromEntries([...current].map(([role,slot])=>[role,{closed:slot.record.closed,error:slot.record.error?String(slot.record.error):null}])),quarantined:!!failure,error:failure?String(failure):null,history:history.map(row=>({...row}))})});return api;
}
