import{retireAudioActions}from'../audio/retireAudio.js';
const abort=()=>Object.assign(Error('Selected-parts start was cancelled or superseded'),{name:'AbortError'});
/** One explicit prepared-owner startup ticket. Does not synthesize audio frames,
 * rebase source epochs or call a second synchronous Ambience start. */
export function createSelectedPartsCoordinator({context,getOwner,prepareMusic,stopMusic,onRunning=()=>{},isCurrent=()=>true}={}){
 if(!context||typeof getOwner!=='function'||typeof prepareMusic!=='function'||typeof stopMusic!=='function'||typeof onRunning!=='function'||typeof isCurrent!=='function')throw Error('Selected-parts startup callbacks required');
 let pending=null,sequence=0,last=null,failure=null;
 const cancel=(parts={music:true,ambience:true})=>{if(pending&&(parts.music&&pending.music||parts.ambience&&pending.ambience)){pending.controller.abort(abort());return pending.promise??Promise.resolve();}return Promise.resolve();};
 const start=({music=false,ambience=false}={})=>{
  if(typeof music!=='boolean'||typeof ambience!=='boolean'||!music&&!ambience)return Promise.reject(Error('Explicit selected parts required'));
  if(pending)return pending.music===music&&pending.ambience===ambience?pending.promise:Promise.reject(Error('Another selected-parts startup is pending'));
  let owner;try{owner=getOwner();if(!owner)throw Error('Published explicit prepared Ambience owner required');owner.checkRuntime();if(failure?.cleanupError)throw failure;}catch(error){return Promise.reject(error);}
  if(sequence===0xffffffff)return Promise.reject(Error('Selected-parts startup sequence exhausted'));
  const ticket={sequence:++sequence,music,ambience,controller:new AbortController(),promise:null},current=()=>pending===ticket&&!ticket.controller.signal.aborted&&getOwner()===owner&&isCurrent();
  pending=ticket;const work=(async()=>{let prepared,receipt,musicCommitted=false;try{
   if(music){prepared=await prepareMusic({signal:ticket.controller.signal,isCurrent:current});if(!current())throw abort();}
   if(ambience){receipt=await owner.prepareStart({requestedAt:context.currentTime,offset:owner.ambience.offset??0,leadSeconds:.5,signal:ticket.controller.signal,isCurrent:current});if(!current())throw abort();if(receipt?.profile!=='prepared-complete-ambience-start-v1'||!Number.isFinite(receipt.startAt)||receipt.startAt<context.currentTime||receipt.lateFrames!==0)throw Object.assign(Error('Selected-parts authored start epoch is no longer admissible'),{code:'SELECTED_PARTS_START_DEADLINE',diagnostics:{receipt,now:context.currentTime}});}
   if(music){if(!current())throw abort();prepared.commitAt(receipt?.startAt??context.currentTime+.1);musicCommitted=true;}
   if(!current())throw abort();onRunning();last={profile:'selected-parts-start-v1',sequence:ticket.sequence,music,ambience,startAt:receipt?.startAt??prepared?.startAt??null,ambienceReceipt:receipt??null};return last;
  }catch(error){try{await retireAudioActions([()=>prepared?.cancel?.(),()=>musicCommitted||prepared?.attempted?stopMusic({force:true}):undefined,()=>ambience?owner.stop({time:context.currentTime,fade:0}):undefined],'Selected-parts startup cleanup failed');}catch(cleanupError){error.cleanupError=error.cleanupError?new AggregateError([error.cleanupError,cleanupError],'Selected-parts startup cleanup failed'):cleanupError;}if(error.name!=='AbortError'||error.cleanupError)failure=error;throw error;}
  finally{if(pending===ticket)pending=null;}})();ticket.promise=work;work.catch(()=>{});return work;
 };
 const stop=async({music=true,ambience=true,time=context.currentTime,fade=.6}={})=>{const started=cancel({music,ambience});try{await retireAudioActions([()=>music?stopMusic():undefined,()=>ambience?getOwner()?.stop({time,fade}):undefined,()=>started.catch(error=>{if(error.name!=='AbortError'||error.cleanupError)throw error;})],'Selected-parts stop failed');}catch(error){failure=error;try{onRunning();}catch(notify){error.notificationError=notify;}throw error;}onRunning();return{profile:'selected-parts-stop-v1',sequence,music,ambience,stopped:getOwner()?.stoppedStatus?.()??null};};
 return Object.freeze({start,cancel,stop,status:()=>({profile:'selected-parts-coordinator-v1',pending:pending?{sequence:pending.sequence,music:pending.music,ambience:pending.ambience}:null,last,error:failure?String(failure):null}),check(){if(failure)throw failure;}});
}
