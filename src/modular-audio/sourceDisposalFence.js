/** A terminal receipt belongs to this exact source node. Timeout is uncertainty,
 * never release. Keep its minimal receiver until a late receipt or context close. */
export function createSourceDisposalFence(context,node,{label='Audio source',message={type:'dispose'},timeoutMs=1000}={}){
 if(!node?.port||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid source disposal fence');
 let disposal,resolve,reject,timer,receipt=null,released=false,primary=null,closed=false,quarantined=false,lateReceipt=false;const cleanup=[];
 const status=()=>({version:1,profile:'source-terminal-receipt-v1',capability:true,released,quarantined,lateReceipt,receipt:receipt?{...receipt}:null,error:primary?String(primary):null,cleanupErrors:cleanup.map(String)});
 const cleanupPort=()=>{if(closed)return;closed=true;for(const action of[()=>node.port.close(),()=>{node.port.onmessage=null;},()=>{node.onprocessorerror=null;},()=>context.removeEventListener?.('statechange',onClosed)])try{action();}catch(error){cleanup.push(error);}};
 const finish=()=>{clearTimeout(timer);cleanupPort();const errors=[...(primary?[primary]:[]),...cleanup];if(errors.length)reject?.(errors.length===1?errors[0]:new AggregateError(errors,label+' release failed'));else resolve?.(status());};
 const onClosed=()=>{if(context.state!=='closed')return;released=true;quarantined=false;receipt??={type:'disposed',version:1,released:true,clean:true,reason:'context-closed'};finish();};
 const fail=error=>{primary??=error instanceof Error?error:Error(String(error));quarantined=!released;if(disposal){clearTimeout(timer);reject(primary);}};
 return Object.freeze({status,fail,
  receive(data){if(data?.type!=='disposed')return false;if(data.version!==1||data.released!==true||typeof data.clean!=='boolean'){fail(Error(label+' invalid terminal receipt'));return true;}lateReceipt=quarantined;receipt={...data};released=true;quarantined=false;if(!data.clean)primary??=Error(data.error??label+' terminal cleanup failed');finish();return true;},
  dispose(){if(disposal)return disposal;disposal=new Promise((yes,no)=>{resolve=yes;reject=no;});disposal.catch(()=>{});if(released){finish();return disposal;}if(context.state==='closed'){onClosed();return disposal;}try{context.addEventListener?.('statechange',onClosed);}catch(error){fail(error);}timer=setTimeout(()=>fail(Error(label+' disposal acknowledgement timed out; source quarantined')),timeoutMs);try{node.port.postMessage(message);}catch(error){fail(error);}if(primary)fail(primary);onClosed();return disposal;}
 });
}

export function attachSourceDisposalFence(context,node,options){
 if(node.disposeOwned||node.sourceDisposalStatus)throw Error('Source release authority already installed');
 const fence=createSourceDisposalFence(context,node,options),receive=node.port.onmessage,onError=node.onprocessorerror;
 node.port.onmessage=event=>{if(!fence.receive(event.data))receive?.(event);};
 node.onprocessorerror=event=>{fence.fail(Error((options?.label??'Audio source')+' processor failed'));onError?.(event);};
 node.sourceDisposalStatus=fence.status;node.disposeOwned=fence.dispose;return fence;
}
