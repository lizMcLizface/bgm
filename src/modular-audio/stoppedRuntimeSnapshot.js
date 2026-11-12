/** Read-only admission for an in-place stopped Generator runtime transaction. */
export const STOPPED_RUNTIME_ROLES=Object.freeze(['lead','counter','pad','bass','rhythm','perc']);
const records=new WeakMap();
const fail=(message,details)=>{const error=Error(message);error.code='STOPPED_RUNTIME_REFUSED';error.diagnostics=details;throw error;};
const clone=value=>structuredClone(value);
const json=value=>JSON.stringify(value);
const roleData=r=>({preset:clone(r.instrument.preset),polyphony:r.instrument.polyphony,presetName:r.presetName,edited:r.edited,machine:r.machine,volume:r.volume,mute:r.mute,solo:r.solo,playedLive:r.playedLive,stringPatchBase:clone(r.stringPatchBase),sourceRevision:r.sourceRevision});
function state(g){return{settings:clone(g.settings),audioEngine:g.audioEngine??'legacy',percussionEngine:g.percussionEngine??'native',audioEngineRevision:g.audioEngineRevision,percussionRevision:g.percussionRevision,moveState:clone(g.moveState),roles:Object.fromEntries(STOPPED_RUNTIME_ROLES.map(id=>[id,roleData(g.roles[id])]))};}
/** Inspect actual exposed source actors, never a model-name lifecycle guess. */
export function assertStoppedSourceRetirementAuthority(instrument,role){
 const actors=[instrument,instrument?.voice?.backend,instrument?.player,instrument?.live,...(instrument?.lives??[]),instrument?.offlineNode,instrument?.pianoSource,instrument?.pluckedSource].filter(Boolean),seen=new Set();
 if(actors.length>16)fail('Source retirement actor bound exceeded',{role});
 for(const actor of actors){const node=actor.node??(actor.port?actor:null);if(seen.has(node??actor))continue;seen.add(node??actor);const status=actor.disposalStatus?.()??node?.sourceDisposalStatus?.();if(!node?.port&&!status)continue;
  const verified=status?.version===1&&status.capability===true&&(status.profile==='source-terminal-receipt-v1'&&!status.released&&!status.quarantined&&!status.error||status.profile==='percussion-ack-lifecycle-v1'&&status.state==='ready'&&!status.errors?.length&&!status.processorErrors?.length);
  if(!verified)fail('Actual source actor lacks a healthy terminal-release authority',{role,status:status??null});
 }
 if(instrument?.error||instrument?.sourceStatus?.().error)fail('Existing source actor is unhealthy',{role});return true;
}
function admission(g){
 if(!g?.AC||g.AC.state==='closed'||typeof g.AC.startRendering==='function'||!g.transport||!g.roles||STOPPED_RUNTIME_ROLES.some(id=>!g.roles[id]?.instrument||!g.roles[id]?.wander)||Object.keys(g.roles).length!==6)fail('A complete live Generator runtime is required');
 const activity={music:!!g.isRunning,ambience:!!g.ambienceRunning,liveNotes:g.liveNotes?.size??0,stopFade:!!g.stopFade,fadeTimer:!!g.fadeTimer,endTimer:!!g.endTimer,midiOwner:!!g.midi,audition:!!g.auditionPending,engineLoad:!!g.audioEngineReady,percussionLoad:!!g.percussionReady,busLoad:!!g.busLoading,spaceLoad:!!g.spaceLoading,sourceLoads:g.sourceLoads?.size??0,sourceRetirements:g.sourceRetirements?.size??0,queuedVoices:g.pendingVoices?.length??0};
 if(Object.values(activity).some(Boolean))fail('Stop and finish pending runtime activity before preparing an environment',activity);
 for(const id of STOPPED_RUNTIME_ROLES){const i=g.roles[id].instrument;assertStoppedSourceRetirementAuthority(i,id);assertStoppedSourceRetirementAuthority(g.roles[id].wander,id+' Wander');const pending={held:i.held?.size??0,sourceInputs:(i.sourceInputs??0)+(i.externalSourceInputs??0)+(i.voice?.native?.externalSourceInputs??0),futureBookings:typeof i.futureBookings==='function'?i.futureBookings().length:0,bookings:i.pendingSourceBookings?.size??0,preparations:i.preparations?.size??0,retirements:i.retirements?.size??0,morph:!!i.morph,editTimer:!!i.editTimer};if(i.disposed||Object.values(pending).some(Boolean))fail('Role is not available for stopped runtime replacement',{role:id,...pending,disposed:!!i.disposed});}
 if(g.sourceRetirementFailure||g.roleMotionError||g.busError||g.spaceError||g.sharedEffectsClosed)fail('Existing runtime must be healthy before environment preparation');
}
export function captureStoppedRuntime(g){
 admission(g);const data=state(g),serial=json(data),identities={generator:g,context:g.AC,transport:g.transport,roles:g.roles,settings:g.settings,output:g.output,levelTrim:g.levelTrim,ambienceOut:g.ambienceOut,ambience:g.ambience,busRack:g.busRack,spaceRack:g.spaceRack,reverbHub:g.reverbHub,wasmRoomPool:g.wasmRoomPool,audioEnvironment:g.audioEnvironment,roleWanderFactory:g.roleWanderFactory,planListeners:g.planListeners,runningListeners:g.runningListeners,visualListeners:g.visualListeners,liveNotes:g.liveNotes,plan:g.plan};
 const roleRefs=Object.fromEntries(STOPPED_RUNTIME_ROLES.map(id=>[id,{role:g.roles[id],instrument:g.roles[id].instrument,wander:g.roles[id].wander,tone:g.roles[id].tone,gain:g.roles[id].gain,ducker:g.roles[id].ducker,duck:g.roles[id].duck,send:g.roles[id].send,spaceSend:g.roles[id].spaceSend,mixOutput:g.roles[id].mixOutput,roomRoute:g.roles[id].roomRoute}]));
 const snapshot=Object.freeze({version:1,profile:'stopped-generator-runtime-v1',roles:STOPPED_RUNTIME_ROLES,describe:()=>({version:1,profile:'stopped-generator-runtime-v1',audioEngine:data.audioEngine,percussionEngine:data.percussionEngine,roles:STOPPED_RUNTIME_ROLES.map(id=>({id,presetName:data.roles[id].presetName,kind:data.roles[id].preset?.classics?'classic':data.roles[id].preset?.iowa?'iowa':data.roles[id].preset?.diy?'diy':id==='perc'?'percussion':data.audioEngine==='wasm'?'wasm':'instrument'}))})});
 records.set(snapshot,{g,data,serial,identities,roleRefs});return snapshot;
}
export function inspectStoppedRuntime(snapshot){const r=records.get(snapshot);if(!r)fail('Unknown stopped runtime snapshot');return{generator:r.g,context:r.identities.context,data:clone(r.data),identities:{...r.identities},roles:Object.fromEntries(Object.entries(r.roleRefs).map(([id,refs])=>[id,{...refs}]))};}
export function assertStoppedRuntime(snapshot){
 const r=records.get(snapshot);if(!r)fail('Unknown stopped runtime snapshot');admission(r.g);for(const[key,value]of Object.entries(r.identities)){if(key==='generator'||key==='context')continue;if(r.g[key]!==value)fail('Generator runtime identity changed while preparing',{field:key});}if(r.g.AC!==r.identities.context)fail('Generator context changed while preparing');
 for(const id of STOPPED_RUNTIME_ROLES){const now=r.g.roles[id],saved=r.roleRefs[id];if(now!==saved.role)fail('Role container changed while preparing',{role:id});for(const[key,value]of Object.entries(saved))if(key!=='role'&&now[key]!==value)fail('Role runtime pointer changed while preparing',{role:id,field:key});}
 if(json(state(r.g))!==r.serial)fail('Settings or presets changed while preparing');return snapshot;
}
export function assertDetachedConstruction(snapshot){const r=inspectStoppedRuntime(snapshot);assertStoppedRuntime(snapshot);if(r.identities.reverbHub||r.identities.wasmRoomPool||Object.values(r.roles).some(v=>v.roomRoute))fail('Shared room owners require an explicit private candidate return contract');return r;}
export function verifyRunningNativeClock(clock,context){
 const s=clock?.snapshot?.();if(!s||s.version!=='7a0838a735108706'||s.creationState!=='running'||s.spec?.rate!==context.sampleRate||!Number.isSafeInteger(s.spec?.epochFrame)||s.spec.epochFrame<=0||!s.anchorReady||s.retired||s.error||context.state!=='running')fail('A verified running future-epoch Source7a binding is required',{source:s??null});clock.check();return s;
}