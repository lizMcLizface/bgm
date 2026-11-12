import{generatorMasterScalarBirth}from'./generatorMasterScalarBirth.js';
import{planGeneratorAmbienceVolume,planGeneratorLoudnessTrim}from'./generatorMasterScalarPlan.js';
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_SCALAR_REFUSED'});
/** Future explicit trim/ambience author. Owns no AudioNodes and never emulates
 * a gain getter or recovers a failed clock. The stable routing root owns errors. */
export function createGeneratorMasterScalarAuthor(g,group,{onError=()=>{},checkRuntime=()=>{}}={}){
 const birth=generatorMasterScalarBirth(g),settings=g.settings,context=g.AC;
 if(group?.context!==context||group.profile!=='main-trim-ambience-cold-group-v1'||typeof group.reserve!=='function'||typeof group.commit!=='function'||typeof onError!=='function'||typeof checkRuntime!=='function')throw refuse('Context-bound cold scalar group required');
 let error=null,busy=false,writes=0,settingsTicket=null;
 const retiredSettings=new WeakSet();
 const fail=issue=>{if(error)return error;error=issue instanceof Error?issue:Object.assign(Error('Master scalar author failed'),{cause:issue});try{onError(error);}catch(callbackError){error.callbackError??=callbackError;}return error;};
 function check(){if(error)throw error;if(busy)throw refuse('Master scalar author is not reentrant');if(context.state!=='running')throw fail(refuse('Observed non-running master scalar context requires reprepare'));if(g.settings!==settings||g.AC!==context||g.output!==birth.output||g.levelTrim!==birth.trim||g.ambienceOut!==birth.ambience)throw fail(refuse('Master scalar parent identity changed'));try{checkRuntime();}catch(issue){throw fail(issue);}const state=group.status();if(state.state!=='active'||state.error||state.quarantined||state.quotaReleased)throw fail(refuse('Master scalar group is not healthy'));return true;}
 function publish(plan,parent){check();const token=group.reserve(plan.rows);busy=true;try{group.commit(token);parent();writes++;return plan;}catch(issue){throw fail(issue);}finally{busy=false;}}
 function reserveSettingsAmbienceVolume(volume){check();if(settingsTicket)throw refuse('One ambience settings reservation required');const plan=planGeneratorAmbienceVolume(context.sampleRate,volume),token=group.reserve(plan.rows);settingsTicket={token,plan,attempted:false};return token;}
 function retireSettings(held){retiredSettings.add(held.token);if(settingsTicket===held)settingsTicket=null;}
 function settingsAmbienceVolumeReservationState(token){if(retiredSettings.has(token))return'retired';if(!settingsTicket||settingsTicket.token!==token)throw refuse('Exact ambience settings reservation required');const held=settingsTicket;let reserved;try{reserved=group.status().reserved;}catch{return'unknown';}if(reserved===false){retireSettings(held);return'retired';}return reserved===true||!held.attempted?'held':'unknown';}
 function checkSettingsAmbienceVolume(token){check();if(!settingsTicket||settingsTicket.token!==token||settingsAmbienceVolumeReservationState(token)==='retired')throw refuse('Exact held ambience settings reservation required');return true;}
 function commitSettingsAmbienceVolume(token){checkSettingsAmbienceVolume(token);const held=settingsTicket;busy=true;held.attempted=true;try{group.commit(token);retireSettings(held);settings.ambienceVolume=held.plan.volume;writes++;return held.plan;}catch(issue){settingsAmbienceVolumeReservationState(token);throw fail(issue);}finally{busy=false;}}
 function cancelSettingsAmbienceVolume(token){const state=settingsAmbienceVolumeReservationState(token);if(state==='retired')return{retired:true,cancelled:false};const held=settingsTicket;try{group.cancel(token);retireSettings(held);return{retired:true,cancelled:true};}catch(issue){settingsAmbienceVolumeReservationState(token);throw fail(issue);}}

 return Object.freeze({profile:'generator-master-scalar-author-v1',context,group,check,
  setAmbienceVolume(volume){return publish(planGeneratorAmbienceVolume(context.sampleRate,volume),()=>{});},
  reserveSettingsAmbienceVolume,checkSettingsAmbienceVolume,commitSettingsAmbienceVolume,cancelSettingsAmbienceVolume,settingsAmbienceVolumeReservationState,
  applySettingsAmbienceVolume(volume){const token=reserveSettingsAmbienceVolume(volume);try{return commitSettingsAmbienceVolume(token);}catch(issue){try{if(settingsAmbienceVolumeReservationState(token)!=='retired')cancelSettingsAmbienceVolume(token);}catch(cleanupError){issue.cleanupError=cleanupError;fail(issue);}throw issue;}},
  setLoudnessTrim(value,seconds,barSeconds){return publish(planGeneratorLoudnessTrim(context.sampleRate,value,seconds,barSeconds),()=>{});},
  quarantine:fail,status:()=>({error:error?String(error):null,busy,writes})
 });
}
