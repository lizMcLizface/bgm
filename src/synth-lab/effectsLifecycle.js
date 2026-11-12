import{PercussionLifecycle}from'../app/engine/percussionLifecycle.js';
/** Same typed ACK envelope, with an explicit natural finite-render receipt. */
export class EffectsLifecycle extends PercussionLifecycle{
 constructor({endFrame=null,...options}={}){super(options);this.endFrame=endFrame;}
 receive(data){if(data?.type==='disposed'&&data.request===0&&data.reason==='end-frame'){
  if(this.endFrame===null||data.version!==1||data.released!==true||data.clean!==true||!Number.isSafeInteger(data.frame)||data.frame<this.endFrame||data.frame>=this.endFrame+128)return true;
  this.naturalReceipt={...data};if(this.closing)return this.acceptReceipt(data);this.state='completed-offline';return true;
 }return super.receive(data);}
 close(){if(this.naturalReceipt&&!this.closing){this.closing=new Promise((a,b)=>{this.resolveClose=a;this.rejectClose=b;});this.closing.catch(()=>{});this.request=1;this.state='disposing';this.acceptReceipt(this.naturalReceipt);return this.closing;}return super.close();}
 status(){return{...super.status(),profile:'effects-ack-lifecycle-v1',naturalReceipt:this.naturalReceipt??null};}
}