import{waitAmbienceSourceAcknowledgement}from'./ambienceSourceAcknowledgement.js';
const issue=(phase,error)=>({phase,name:error?.name??'Error',message:error?.message??String(error),code:error?.code??null});
const aborted=()=>Object.assign(Error('Ambience bank bridge preparation cancelled'),{name:'AbortError'});
/** New opt-in composition leaf. The raw bank cursor is private; the accepted
 * BankSource prototype and source-generation math are never changed. */
export async function createAmbienceBankSpatialSource({bank,lease,session,layer,signal,retirementMs=5000}={}){
 if(!Number.isInteger(retirementMs)||retirementMs<1||retirementMs>5000)throw Error('Invalid source retirement deadline');
 if(!bank||bank.context!==session?.context||lease?.pool!==bank||lease.released||({wind:2,fire:4,vinyl:5}[lease?.identity?.spec?.kind])!==layer||!session.layers?.has(layer)||typeof bank.source!=='function')throw Error('Prepared same-context loop bank and spatial layer required');
 if(signal?.aborted)throw aborted();
 const bridge=session.context.createGain(),state=new AmbienceBankSpatialSource(bank,session,bridge,layer,retirementMs);
 try{
  state.binding=await session.attachSource(layer,bridge);
  if(signal?.aborted)throw aborted();
  state.bindCursor(bank.source(lease));
  await state.cursor.ready;
  if(signal?.aborted)throw aborted();
  state.cursor.setHostAwake(false);
  state.cursor.connect(bridge);
  state.cursor.setHostAwake(true);
  state.phase='ready';
  return state;
 }catch(error){const retirement=await state.dispose();error.diagnostics={...(error.diagnostics??{}),bankSpatialRetirement:retirement};throw error;}
}
class AmbienceBankSpatialSource{
 constructor(bank,session,bridge,layer,retirementMs){this.retirementMs=retirementMs;this.lateSpatialAcknowledgements=0;this.lateSpatialRejections=0;this.bank=bank;this.session=session;this.bridge=bridge;this.layer=layer;this.cursor=null;this.binding=null;this.phase='preparing';this.error=null;this.events=[];this.cleanupIssues=[];this.spatialAcknowledged=false;this.cursorAcknowledged=false;this.endObserved=false;this.endNotified=false;}
 event(kind){if(this.events.length<16)this.events.push({kind,at:this.session.context.currentTime});}
 bindCursor(cursor){
  this.cursor=cursor;this.originalDispose=cursor.dispose.bind(cursor);
  // Source.end() dynamically invokes this instance method. Hold its physical
  // slot until the other processor has acknowledged removing the old owner.
  cursor.dispose=()=>this.dispose();
  cursor.onended=()=>{this.endObserved=true;this.event('source-ended');void this.dispose().then(result=>{if(!this.endNotified){this.endNotified=true;this.onended?.({target:this,retirement:result});}});};
 }
 alive(){if(this.phase!=='ready'||this.error)throw Error(this.error?.message??'Ambience bank bridge is not ready');}
 start(time=0,offset=0){this.alive();this.cursor.start(time,offset);this.event('start');}
 stop(time=0){this.alive();this.cursor.stop(time);this.event('stop');}
 setHostAwake(awake){this.alive();if(typeof awake!=='boolean')throw Error('Source demand must be Boolean');this.cursor.setHostAwake(awake);}
 fade(options){this.alive();return this.session.fadeSource(this.binding.owner,options);}
 status(){return{profile:'fenced-bank-spatial-source-candidate-v1',phase:this.phase,retirementMs:this.retirementMs,lateSpatialAcknowledgements:this.lateSpatialAcknowledgements,lateSpatialRejections:this.lateSpatialRejections,layer:this.layer,binding:this.binding,source:this.cursor?.status()??null,spatialAcknowledged:this.spatialAcknowledged,cursorAcknowledged:this.cursorAcknowledged,endObserved:this.endObserved,endNotified:this.endNotified,error:this.error?.message??this.cursor?.error??null,events:this.events.slice(),cleanupIssues:this.cleanupIssues.slice()};}
 dispose(){if(this.retirement)return this.retirement;this.phase='retiring';return this.retirement=this.retire();}
 async retire(){
  this.event('retire-begin');
  if(this.cursor&&!this.cursor.disposed)try{this.cursor.setHostAwake(false);}catch(error){this.cleanupIssues.push(issue('disable source demand',error));}
  let canFree=true;
  if(this.binding){try{await waitAmbienceSourceAcknowledgement(()=>this.session.cancelSource(this.binding.owner),{ms:this.retirementMs,label:'Spatial source-owner cancellation',onLate:result=>{if(result.resolved)this.lateSpatialAcknowledgements++;else this.lateSpatialRejections++;this.event(result.resolved?'late-spatial-ack':'late-spatial-rejection');}});this.spatialAcknowledged=true;this.event('spatial-cancel-ack');}catch(error){canFree=false;this.error=error;this.cleanupIssues.push(issue('spatial owner cancellation',error));}}
  else this.spatialAcknowledged=true;
  if(this.cursor&&canFree){try{const result=await this.originalDispose();this.cursorAcknowledged=result?.acknowledged===true;if(!this.cursorAcknowledged)this.cleanupIssues.push({phase:'cursor retirement',name:'AcknowledgementError',message:result?.error??'Bank cursor retirement not acknowledged'});this.event('cursor-free-ack');}catch(error){this.error??=error;this.cleanupIssues.push(issue('cursor retirement',error));}}
  else if(!this.cursor)this.cursorAcknowledged=true;
  // If cancellation failed, the cursor remains occupied and muted. Never free
  // it into an allocator that could feed a still-bound spatial input.
  try{this.bridge.disconnect();}catch(error){this.cleanupIssues.push(issue('private bridge cleanup',error));}
  this.phase=this.cleanupIssues.length?'quarantined':'retired';this.event(this.phase);
  return{acknowledged:this.spatialAcknowledged&&this.cursorAcknowledged,clean:this.cleanupIssues.length===0,spatialAcknowledged:this.spatialAcknowledged,cursorAcknowledged:this.cursorAcknowledged,quarantined:this.phase==='quarantined',cleanupIssues:this.cleanupIssues.slice(),events:this.events.slice()};
 }
}
