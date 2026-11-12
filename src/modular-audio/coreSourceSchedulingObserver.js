import {createSourceSchedulingLedger,coreSourceSchedulingProof} from './sourceSchedulingLedger.js';
/** Explicit prepublication metadata observer for the accepted Native-clock
 * Core/FM source. No coefficient, clock or audio sample is changed. */
export function attachCoreSourceSchedulingObserver(owner,{capacity=2048,onError=()=>{}}={}){
 const backend=owner?.voice?.backend,context=owner?.AC,node=backend?.node;
 if(!owner||owner.disposed||typeof owner.awaitPendingSourceBookings!=='function'||typeof onError!=='function')throw Error('Ready Core/FM owner scheduling authority required');
 const adapter=coreSourceSchedulingProof({context,backend,settle:()=>owner.awaitPendingSourceBookings()}),ledger=createSourceSchedulingLedger({...adapter,capacity}),saved=[],receiver=node.port.onmessage;
 if(typeof receiver!=='function')throw Error('Actual source message receiver required');
 let detached=false,retiring=false,queued=false,depth=0,error=null;
 const failed=failure=>{error??=failure;try{onError(failure);}catch(notification){failure.notificationError=notification;}};
 const confirm=()=>{if(detached||retiring)return;ledger.confirm().catch(failure=>{if(!retiring)failed(failure);});};
 const schedule=()=>{if(queued||detached||retiring)return;queued=true;queueMicrotask(()=>{queued=false;confirm();});};
 function replace(object,key,make){const original=object[key];if(typeof original!=='function')throw Error('Required source scheduling method is absent: '+key);const descriptor=Object.getOwnPropertyDescriptor(object,key),value=make(original);Object.defineProperty(object,key,{value,configurable:true,writable:true,enumerable:descriptor?.enumerable??false});saved.push({object,key,descriptor,value});}
 function restore(){const errors=[];for(const record of saved.slice().reverse())try{if(record.object[record.key]!==record.value)throw Error('Source scheduling method changed before observer retirement: '+record.key);if(record.port)record.object[record.key]=receiver;else if(record.descriptor)Object.defineProperty(record.object,record.key,record.descriptor);else delete record.object[record.key];}catch(failure){errors.push(failure);}if(errors.length)throw new AggregateError(errors,'Source metadata observer restore failed');}
 try{
  replace(backend,'events',original=>function(rows){return retiring?Reflect.apply(original,this,[rows]):ledger.events(rows,original,this);});
  replace(backend,'panic',original=>function(...args){const value=retiring?Reflect.apply(original,this,args):ledger.panic(original,this,args);schedule();return value;});
  for(const key of ['scheduleNote','startNote','stopNote','silence','flushTails','stopAll'])if(typeof owner[key]==='function')replace(owner,key,original=>function(...args){if(depth||retiring)return Reflect.apply(original,this,args);depth++;try{return ledger.hostCall(original,this,args);}finally{depth--;schedule();}});
  const receive=function(event){try{return Reflect.apply(receiver,this,[event]);}finally{if(!detached&&!retiring&&event.data?.type==='stats')try{ledger.observe(adapter.parse(event.data));}catch(failure){failed(failure);}}};
  Object.defineProperty(receive,'sourceSchedulingObserver',{value:true});node.port.onmessage=receive;saved.push({object:node.port,key:'onmessage',port:true,value:receive});
 }catch(primary){try{restore();}catch(cleanupError){primary.cleanupError=cleanupError;}throw primary;}
 return Object.freeze({version:1,profile:'core-fm-prepublication-scheduling-observer-v1',context,owner,source:backend,
  beginRetirement(){retiring=true;},
  async confirm(){if(detached||retiring)throw Error('Source metadata observer retired');if(error)throw error;return ledger.confirm();},
  admission(){if(detached||retiring||error)throw error??Error('Source metadata observer retired');return ledger.admission();},
  /** Call only after this actual node's terminal authority proves release.
   * Disposal itself may call wrapped panic/silence; keep observing until ACK. */
  detachAfterRelease(){if(detached)return;const health=node.sourceDisposalStatus?.();if(health?.profile!=='source-terminal-receipt-v1'||health.released!==true)throw Error('Actual source terminal receipt required before metadata detach');const errors=[];for(const record of saved.slice().reverse())try{if(record.object===node.port&&record.key==='onmessage'&&node.port.onmessage===null)continue;if(record.object[record.key]!==record.value)throw Error('Source scheduling method changed before observer retirement: '+record.key);if(record.port)record.object[record.key]=receiver;else if(record.descriptor)Object.defineProperty(record.object,record.key,record.descriptor);else delete record.object[record.key];}catch(failure){errors.push(failure);}detached=true;if(errors.length)throw new AggregateError(errors,'Released source metadata observer cleanup failed');},
  status:()=>({version:1,profile:'core-fm-prepublication-scheduling-observer-v1',detached,retiring,error:error?String(error):null,ledger:ledger.status()})
 });
}
