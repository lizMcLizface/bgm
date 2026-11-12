/** Additive lifecycle contract; no hit/control/render arithmetic. */
export class PercussionLifecycle {
 constructor({timeoutMs=1500,readyTimeoutMs=5000,onRelease=()=>{}}={}){this.node=null;this.capability=false;this.state='unbound';this.onRelease=onRelease;this.timeoutMs=timeoutMs;this.readyTimeoutMs=readyTimeoutMs;this.errors=[];this.processorErrors=[];this.request=0;this.ready=new Promise((a,b)=>{this.resolveReady=a;this.rejectReady=b;});this.ready.catch(()=>{});}
 bind(node){if(this.node||this.closing)throw Error('Percussion lifecycle already bound or retired');this.node=node;this.state='waiting';this.readyTimer=setTimeout(()=>{this.state='legacy-unverified';this.rejectReady(Error('Percussion processor lacks acknowledged lifecycle capability'));},this.readyTimeoutMs);}
 fail(error){this.processorErrors.push(String(error));clearTimeout(this.readyTimer);this.rejectReady(error);}
 receive(data){
  if(data?.type==='lifecycle-ready'){if(data.version!==1||data.disposalAck!==true){this.fail(Error('Invalid percussion lifecycle capability'));return true;}if(this.closing)return true;clearTimeout(this.readyTimer);this.capability=true;this.state='ready';this.resolveReady({version:1,disposalAck:true});return true;}
  if(data?.type!=='disposed')return false;
  if(data.version!==1||!this.closing||data.request!==this.request||data.released!==true||typeof data.clean!=='boolean')return true;
  return this.acceptReceipt(data);
 }
 acceptReceipt(data){
  this.lastAck={...data};if(data.error)this.errors.push(data.error);const cleanup=[];try{this.node?.port.close();}catch(error){cleanup.push(error);}try{this.onRelease(this.node);}catch(error){cleanup.push(error);}this.node=null;clearTimeout(this.disposeTimer);this.errors.push(...cleanup.map(String));
  if(this.state==='quarantined'){this.lateAck=true;return true;}
  if(!data.clean||this.errors.length){this.state='cleanup-failed';this.rejectClose(new AggregateError(this.errors.map(e=>Error(e)),'Percussion disposal failed'));}else{this.state='disposed';this.resolveClose({version:1,acknowledged:true,clean:true});}return true;
 }
 close(){
  if(this.closing)return this.closing;clearTimeout(this.readyTimer);this.rejectReady(Error('Percussion owner disposed before lifecycle readiness'));
  if(!this.node){this.state='disposed';this.closing=Promise.resolve({version:1,acknowledged:true,clean:true,noNode:true});return this.closing;}
  this.state='disposing';this.request=1;this.closing=new Promise((a,b)=>{this.resolveClose=a;this.rejectClose=b;});this.closing.catch(()=>{});
  this.disposeTimer=setTimeout(()=>{this.state='quarantined';this.rejectClose(Error('Percussion disposal acknowledgement timed out; owner quarantined'));},this.timeoutMs);
  try{this.node.port.postMessage({type:'dispose',request:this.request});}catch(error){this.errors.push(String(error));this.state='quarantined';clearTimeout(this.disposeTimer);this.rejectClose(error);}return this.closing;
 }
 status(){return{version:1,profile:'percussion-ack-lifecycle-v1',state:this.state,capability:this.capability,nodeRetained:!!this.node,ack:this.lastAck??null,lateAck:!!this.lateAck,errors:[...this.errors],processorErrors:[...this.processorErrors]};}
}