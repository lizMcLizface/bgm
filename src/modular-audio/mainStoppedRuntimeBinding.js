import{mainRoleSourceDestination,mainRolePostControlsOutput}from'./generatorMainControlRoot.js';
import{assertAutomaticPreparedFadePolicy}from'./preparedStartPolicy.js';
import{STOPPED_RUNTIME_ROLES,assertStoppedRuntime,inspectStoppedRuntime}from'./stoppedRuntimeSnapshot.js';
import{retireAudioActions}from'../audio/retireAudio.js';
// Routing metadata never substitutes for the caller's explicit published scope.
const installedMain=new WeakMap();
const keys=['audioEnvironment','roleWanderFactory','ambience','busRack','spaceRack','roleMotionControls','roleMotionPrepared','roleMotionError'];
const roleKeys=['instrument','wander','send','sendSource','spaceSend','spaceSendSource'];
const capture=(object,names)=>names.map(key=>({object,key,descriptor:Object.getOwnPropertyDescriptor(object,key)}));
const same=record=>{const now=Object.getOwnPropertyDescriptor(record.object,record.key),old=record.descriptor;return !now&&!old||!!now&&!!old&&now.value===old.value&&now.get===old.get&&now.set===old.set&&now.writable===old.writable&&now.enumerable===old.enumerable&&now.configurable===old.configurable;};
const restore=records=>{for(const{object,key,descriptor}of records)if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];};
const currentReturns=bundle=>bundle.currentReturns?.()??bundle;
const currentRoles=bundle=>bundle.currentRoles?.()??bundle.roles;
const output=owner=>owner?.output?.getNode?.()??owner?.output;
const native=(context,node)=>{if(!node||node.context!==context||typeof node.connect!=='function'||typeof node.disconnect!=='function')throw Error('Explicit same-context Main runtime node required');return node;};
/** NEW, unselected Main-only binding. Existing Generator/Transport/settings and
 * all stable tone/gain/duck/master nodes survive. A caller must keep the returned
 * published scope and await previousRetirement before admitting playback.
 * detachPublished() is terminal-only: it never reconnects retired old owners. */
export function createMainStoppedRuntimeBinding(snapshot,bundle){
 const view=inspectStoppedRuntime(snapshot),{generator:g,context,identities,roles:old}=view;let previousRuntime=installedMain.get(g),previousScopeReport=null;
 const authority={bundle,scope:null,value:null,quarantined:false,error:null};
 const records=[...capture(g,keys),...STOPPED_RUNTIME_ROLES.flatMap(id=>capture(old[id].role,roleKeys))];
 const logical=[],added=[],removed=[],addLabels=[],removeLabels=[],retirementHealth=[];let installed=false,closed=false,retirement;
 const add=(from,to,label)=>{added.push([native(context,from),native(context,to)]);addLabels.push(label??'candidate Main route');},remove=(from,to,label)=>{removed.push([native(context,from),native(context,to)]);removeLabels.push(label??'previous Main route');};
 const routeOut=owner=>native(context,owner.node??output(owner));
 function preflight(){
  if(installed||closed)throw Error('Main binding is no longer an unpublished candidate');assertStoppedRuntime(snapshot);if(installedMain.get(g)!==previousRuntime)throw Error('Main return authority changed during preparation');if(previousRuntime&&(previousRuntime.quarantined||!previousRuntime.scope||previousRuntime.scope.snapshot().state!=='published'||STOPPED_RUNTIME_ROLES.some(id=>currentRoles(previousRuntime.bundle)[id].instrument!==old[id].instrument||currentRoles(previousRuntime.bundle)[id].wander!==old[id].wander)||previousRuntime.bundle.ambience!==identities.ambience))throw Error('Explicit previous Main publication scope required');if(g.mixReturn||Object.values(g.roles).some(r=>r.mixOutput))throw Error('Main binding does not own All desk routes');
  if(!records.every(same))throw Error('Main runtime binding field changed during preparation');
  if(g.reverbHub||g.wasmRoomPool||Object.values(old).some(r=>r.roomRoute))throw Error('Main binding requires explicit private shared-room ownership');
  if(previousRuntime?.bundle.preparedAmbienceOwner&&previousRuntime.bundle.preparedAmbienceOwner.stoppedStatus().stopped!==true)throw Error('Complete Ambience must finish its actual stopped drain before Main replacement');
  const weather=identities.ambience?.weatherRoute;if(weather&&typeof weather.dispose!=='function'&&(weather.revision>0||weather.node))throw Error('Previously started Native Ambience has no explicit terminal retirement authority');
  if((identities.ambience?.playing instanceof Map?identities.ambience.playing.size:Object.keys(identities.ambience?.playing??{}).length)||identities.ambience?.sourcePreparations?.size||identities.ambience?.sourceRetirements?.size)throw Error('Old Ambience source/fade retirement must finish before Main replacement');
  if(!bundle?.environment||bundle.environment.context!==context||typeof bundle.dispose!=='function'||typeof bundle.check!=='function')throw Error('Complete same-context detached Main owners required');bundle.check();
  if(bundle.preparedAmbienceOwner)assertAutomaticPreparedFadePolicy(g);
  const resources=new Set();for(const id of STOPPED_RUNTIME_ROLES){const r=old[id],next=bundle.roles?.[id],destination=mainRoleSourceDestination(g,id);if(!next||next.instrument===r.instrument||next.wander===r.wander||typeof next.instrument.connect!=='function')throw Error('Independent candidate source and Wander required: '+id);native(context,output(next.instrument));native(context,next.wander.input);native(context,next.wander.output);native(context,destination);native(context,mainRolePostControlsOutput(g,id));if(next.instrument.destinations?.length)throw Error('Candidate already has a logical source destination: '+id);for(const owner of[next.instrument,next.wander]){if(resources.has(owner))throw Error('Duplicate Main candidate owner');resources.add(owner);}for(const[key,source]of[['send','sendSource'],['spaceSend','spaceSendSource']])if(r[key]&&(r[source]??r.wander.output)!==r.wander.output)throw Error('Main shared send has foreign source authority: '+id);}
  native(context,bundle.sharedReturn);native(context,bundle.ambienceReturn);native(context,g.output);native(context,g.ambienceOut);
 }
 preflight();
 for(const id of STOPPED_RUNTIME_ROLES){const r=old[id],next=bundle.roles[id],destination=mainRoleSourceDestination(g,id),gate=mainRolePostControlsOutput(g,id);
  // Native sleeping sources own a logical destination but no physical edge.
  const sleeping=Array.isArray(r.instrument.destinations)&&(r.instrument.chainAwake===false||r.instrument.awake===false);
  if(!sleeping)remove(output(r.instrument),destination,id+' previous source to stable role input');
  remove(gate,r.wander.input,id+' stable duck/gain to previous Wander');remove(r.wander.output,g.output,id+' previous Wander to Main output');add(gate,next.wander.input,id+' stable duck/gain to candidate Wander');add(next.wander.output,g.output,id+' candidate Wander to Main output');
 }
 if(previousRuntime){remove(previousRuntime.bundle.sharedReturn,g.output,'previous private shared return to Main');remove(previousRuntime.bundle.ambienceReturn,g.ambienceOut,'previous private ambience return to Main');}
 else{if(identities.ambience)remove(identities.ambience.wanderOut??output(identities.ambience),g.ambienceOut,'old ambience final wander output');if(identities.busRack)remove(routeOut(identities.busRack),g.output,'original bus output to Main');if(identities.spaceRack)remove(routeOut(identities.spaceRack),g.output,'original section-space output to Main');}
 add(bundle.sharedReturn,g.output,'candidate private shared return to Main');add(bundle.ambienceReturn,g.ambienceOut,'candidate private ambience return to Main');
 function undoLogical(){const errors=[];for(const action of logical.slice().reverse())if(!action.closed)try{const{destination}=action,owner=action.role?currentRoles(bundle)[action.role].instrument:action.owner;if(typeof owner.disconnect==='function')owner.disconnect();else output(owner).disconnect(destination);action.closed=true;}catch(error){if(error.name==='InvalidAccessError'){action.closed=true;}else errors.push(error);}if(errors.length)throw new AggregateError(errors,'Main candidate logical connection rollback failed');}
 function publish({environment,roleWanderFactory}){
  if(installed||closed||environment!==bundle.environment)throw Error('Main candidate publication authority differs');
  for(const id of STOPPED_RUNTIME_ROLES){const owner=bundle.roles[id].instrument,destination=mainRoleSourceDestination(g,id);logical.push({owner,destination,role:id,closed:false});owner.connect(destination);}
  g.audioEnvironment=environment;g.roleWanderFactory=roleWanderFactory;g.ambience=bundle.ambience;g.busRack=bundle.busRack;g.spaceRack=bundle.spaceRack;
  g.roleMotionControls=Promise.resolve();g.roleMotionPrepared=true;g.roleMotionError=null;
  for(const id of STOPPED_RUNTIME_ROLES){const r=g.roles[id];r.instrument=bundle.roles[id].instrument;r.wander=bundle.roles[id].wander;r.send=bundle.sends[id];r.sendSource=r.send?r.wander.output:undefined;r.spaceSend=bundle.spaceSends[id];r.spaceSendSource=r.spaceSend?r.wander.output:undefined;}
  authority.value=Object.freeze({...bundle.sourceAuthority?{sourceAuthority:bundle.sourceAuthority}:{},...bundle.placeholderAuthority?{placeholderAuthority:bundle.placeholderAuthority}:{},...bundle.sweepOwner?{sweepOwner:bundle.sweepOwner}:{},profile:'main-stopped-runtime-binding-v1',generator:g,registerPublishedScope,detachPublished,describe});installedMain.set(g,authority);installed=true;return authority.value;
 }
 function rollback(){if(retirement)throw Error('Cannot restore Main owners after retirement began');const errors=[];try{undoLogical();}catch(error){errors.push(error);}try{restore(records);if(previousRuntime)installedMain.set(g,previousRuntime);else installedMain.delete(g);}catch(error){errors.push(error);}installed=false;if(errors.length)throw new AggregateError(errors,'Main runtime pointer/logical rollback failed');}
 function retirePrevious(){if(!installed)throw Error('Cannot retire unpublished Main owners');if(retirement)return retirement;
  const tracked=(owner,label,close)=>{const sourceNode=owner?.voice?.backend?.node??owner?.player?.node??owner?.node,health=()=>owner?.disposalStatus?.()??owner?.player?.disposalStatus?.()??sourceNode?.sourceDisposalStatus?.()??null;return async()=>{const record={label,settled:false,error:null,health:null};retirementHealth.push(record);try{const receipt=await close();record.health=health();if(receipt?.clean===false||receipt?.released===false||receipt?.quarantined===true||record.health?.quarantined||record.health?.error||record.health?.profile==='source-terminal-receipt-v1'&&!record.health.released)throw Error('Previous Main owner has no clean terminal release: '+label);record.settled=true;}catch(error){record.error=String(error);throw error;}finally{record.health=health();}};};
  const actions=[];for(const id of STOPPED_RUNTIME_ROLES){const r=old[id];actions.push(tracked(r.instrument,id+' source',()=>previousRuntime?.bundle.sourceEdits?previousRuntime.bundle.sourceEdits.retireCaptured(r.instrument):typeof g.retireInstrument==='function'?g.retireInstrument(r.instrument):r.instrument.dispose()),tracked(r.wander,id+' Wander',()=>r.wander.dispose()));if(r.send)actions.push(()=>r.send.disconnect());if(r.spaceSend)actions.push(()=>r.spaceSend.disconnect());}
  for(const[kind,owner]of[['ambience',previousRuntime?.bundle.preparedAmbienceOwner??identities.ambience],['bus',identities.busRack],['space',identities.spaceRack]])if(owner)actions.push(tracked(owner,kind,()=>kind!=='ambience'&&previousRuntime?.bundle.runtimeReturns?.status()[kind==='bus'?'ownedBus':'ownedSpace']?previousRuntime.bundle.runtimeReturns.dispose():kind==='ambience'&&!previousRuntime?.bundle.preparedAmbienceOwner?retireAudioActions([()=>owner.dispose(),()=>owner.weatherRoute?.dispose?.(),async()=>{const result=await owner.sourceDisposal;if(result?.error)throw Error(result.error);}],'Previous Main Ambience retirement failed'):owner.dispose()));
  if(previousRuntime)actions.push(tracked(previousRuntime.scope,'previous published scope',()=>previousRuntime.scope.retire()));
  const oldReturns=previousRuntime?.bundle.runtimeReturns;const closePrevious=oldReturns?(async()=>{const errors=[];try{await oldReturns.dispose();}catch(error){errors.push(error);}try{await retireAudioActions(actions,'Previous Main runtime retirement failed');}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Previous Main phased retirement failed');})():retireAudioActions(actions,'Previous Main runtime retirement failed');retirement=closePrevious.then(()=>{if(previousRuntime){previousScopeReport=previousRuntime.scope.snapshot();previousRuntime=null;}});return retirement;
 }
 function quarantinePublication(error){authority.quarantined=true;authority.error=String(error);}
 function registerPublishedScope(scope){if(!installed||closed||installedMain.get(g)!==authority||!scope||scope.context!==context||scope.value!==authority.value||typeof scope.retire!=='function'||typeof scope.snapshot!=='function'||scope.snapshot().state!=='published'||authority.scope&&authority.scope!==scope)throw Error('Explicit current Main published scope required');authority.scope=scope;bundle.sourceAuthority?.bind(scope);if(bundle.runtimeReturns)bundle.runtimeReturns.bind(scope);else bundle.placeholderAuthority?.bind(scope);}
 async function prepareTerminalDetach(){if(!installed||closed||installedMain.get(g)!==authority)throw Error('Current Main terminal authority required');if(!bundle.sourceEdits)return;try{bundle.sourceEdits.assertRetirementPrepared();return;}catch(error){if(error.code!=='STOPPED_SOURCE_RETIREMENT_REQUIRED')throw error;}await bundle.sourceEdits.prepareRetirement();bundle.sourceEdits.assertRetirementPrepared();}
 function detachPublished(){if(!installed||closed)return;if(STOPPED_RUNTIME_ROLES.some(id=>g.roles[id].instrument!==currentRoles(bundle)[id].instrument||g.roles[id].wander!==currentRoles(bundle)[id].wander)||g.ambience!==bundle.ambience)throw Error('Main runtime changed before terminal detach');bundle.sourceEdits?.assertRetirementPrepared();const errors=[];try{undoLogical();}catch(error){errors.push(error);}for(const[from,to]of added)try{from.disconnect(to);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Published Main runtime detach failed');if(installedMain.get(g)===authority)installedMain.delete(g);closed=true;}
 function describe(){return{profile:'main-stopped-runtime-binding-v1',installed,closed,quarantined:authority.quarantined,error:authority.error,scopeRegistered:!!authority.scope,previousAuthorityRetained:!!previousRuntime,previousScope:previousRuntime?.scope?.snapshot()??previousScopeReport,logical:logical.map(a=>({closed:a.closed})),edges:{remove:removed.length,add:added.length,removeLabels:[...removeLabels],addLabels:[...addLabels]},previous:retirementHealth.map(r=>({...r}))};}
 async function prepareRetirement(){preflight();await previousRuntime?.bundle.sourceEdits?.prepareRetirement();preflight();}
 async function releaseRetirementAfterRollback(){if(installed||closed||!records.every(same)||installedMain.get(g)!==previousRuntime)throw Error('Previous Main pointers were not restored before retirement pull cleanup');await previousRuntime?.bundle.sourceEdits?.releaseRetirementAfterRollback({verifiedProgramRoutesIntact:true});}
 return Object.freeze({version:1,context,preflight,prepareRetirement,releaseRetirementAfterRollback,prepareTerminalDetach,edges:()=>({remove:removed,add:added,removeLabels,addLabels}),publish,restore:rollback,retirePrevious,registerPublishedScope,quarantinePublication,detachPublished,describe});
}

/** Keep caller readiness pending through explicit scope registration. A failed
 * registration occurs after publication: retain the actual published scope and
 * typed quarantine for recovery; never pretend the retired old runtime returned. */
export async function commitMainStoppedRuntime(transaction,bundle){
 const binding=createMainStoppedRuntimeBinding(transaction.snapshot,bundle);let published;try{await binding.prepareRetirement();published=await transaction.commit(binding);}catch(error){if(!transaction.describe().rollbackQuarantined)try{await binding.releaseRetirementAfterRollback();}catch(cleanupError){error.cleanupError=error.cleanupError?new AggregateError([error.cleanupError,cleanupError],'Previous source retirement pull cleanup failed'):cleanupError;}throw error;}
 try{binding.registerPublishedScope(published.scope);if(bundle.sourceEdits)await bundle.sourceEdits.releasePreparation();}catch(error){binding.quarantinePublication(error);error.code='MAIN_RUNTIME_PUBLICATION_QUARANTINED';error.publishedRuntime={published,binding};throw error;}
 return Object.freeze({...published,binding});
}

/** Only an explicit registered publication may authorize prepared source birth. */
export function isPublishedMainPreparedAmbience(generator,owner){const a=installedMain.get(generator);return!!(a&&!a.quarantined&&a.scope?.snapshot().state==='published'&&a.bundle.preparedAmbienceOwner===owner&&generator.ambience===owner?.ambience&&generator.audioEnvironment===a.bundle.environment);}
export function getPublishedMainPreparedAmbience(generator){const a=installedMain.get(generator),owner=a?.bundle.preparedAmbienceOwner;if(!owner)return null;if(!isPublishedMainPreparedAmbience(generator,owner))throw Object.assign(Error('Prepared Ambience publication is unbound or quarantined'),{code:'MAIN_RUNTIME_PUBLICATION_QUARANTINED'});return owner;}

function editRefusal(operation){throw Object.assign(Error('This prepared Main profile keeps source and shared-return ownership fixed; rebuild the stopped runtime for '+operation),{code:'MAIN_RUNTIME_EDIT_UNSUPPORTED',operation});}
export function assertMainRuntimeSourceEdit(generator,operation){if(installedMain.has(generator))editRefusal(operation);}
export function assertMainRuntimeSettings(generator,settings,{checkPlan=false}={}){const a=installedMain.get(generator);if(!a)return true;const b=a.bundle;if(a.quarantined||!a.scope||a.scope.snapshot().state!=='published'||generator.audioEnvironment!==b.environment||generator.ambience!==b.ambience||Object.entries(currentRoles(b)).some(([id,r])=>generator.roles[id].instrument!==r.instrument||generator.roles[id].wander!==r.wander)||generator.busRack!==currentReturns(b).busRack||generator.spaceRack!==currentReturns(b).spaceRack)editRefusal('changed runtime authority');
 b.runtimeReturns?.assertSettings(settings);
 const wantsBus=Object.values(settings.bus?.sends??{}).some(value=>value>0)||settings.sequencer?.on&&Object.keys(settings.sequencer.moves??{}).length>0;
 const wantsSpace=(settings.sectionSpace??0)>0||settings.arc?.shape&&settings.arc.shape!=='off'||checkPlan&&[...generator.plan.values()].some(bar=>(bar.space??0)>0);
 const wantsSweep=settings.sequencer?.on&&Object.keys(settings.sequencer.moves??{}).some(key=>key.startsWith('filter.'));
 if(wantsSweep&&!generator.sweep&&!b.runtimeReturns)editRefusal('a new master sweep');if(wantsBus&&!currentReturns(b).busRack)editRefusal('a new shared bus');if(wantsSpace&&!currentReturns(b).spaceRack)editRefusal('a new section-space return');return true;
}
export function assertMainRuntimeLazyReturn(generator,kind){const a=installedMain.get(generator);if(a&&!a.bundle[kind==='bus'?'busRack':'spaceRack'])editRefusal('a new '+kind+' return');}

export function hasPublishedMainRuntime(generator){return installedMain.has(generator);}

/** Optional stopped-only editor authority, never inferred from source model. */
export function getPublishedMainSourceEdits(generator){const a=installedMain.get(generator),edits=a?.bundle.sourceEdits;if(!edits)return null;if(a.quarantined||!a.scope||a.scope.snapshot().state!=='published'||generator.audioEnvironment!==a.bundle.environment||Object.entries(currentRoles(a.bundle)).some(([role,r])=>generator.roles[role].instrument!==r.instrument||generator.roles[role].wander!==r.wander))throw Object.assign(Error('Editable source publication is unbound or quarantined'),{code:'MAIN_RUNTIME_PUBLICATION_QUARANTINED'});edits.check();return edits;}

export function getPublishedMainRuntimeReturns(generator){const a=installedMain.get(generator),returns=a?.bundle.runtimeReturns;if(!returns)return null;if(a.quarantined||!a.scope||a.scope.snapshot().state!=='published'||generator.audioEnvironment!==a.bundle.environment||generator.ambience!==a.bundle.ambience)throw Object.assign(Error('Runtime return publication is unbound or quarantined'),{code:'MAIN_RUNTIME_PUBLICATION_QUARANTINED'});returns.check();return returns;}
