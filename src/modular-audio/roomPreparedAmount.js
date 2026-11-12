import{RoomAmountWriter}from'./roomAmountWords.js';
import{validateRoomAmount}from'./ownedRoomControlLive.js';
export const ROOM_PREPARED_AMOUNT_PROFILE='room-prepared-output-gain-ticket-v1';
/** NEW main-side authority only. A separate successor Rust/core must reserve
 * both gain lanes before ready(). This helper is not used by accepted hosts. */
export class RoomPreparedAmountWriter extends RoomAmountWriter{
 #prepared=new Map();
 constructor(parameters,context){super(parameters,context);this.closed=false;}
 alive(){if(this.closed)throw Error('Prepared Room writer closed');super.alive();}
 prepare(value){
  if(this.closed)throw Error('Prepared Room writer closed');validateRoomAmount(value);this.preflight();
  const token=this.transport.reserve(2),id=++this.pair,handle=Object.freeze({}),entry={id,value,token,state:'pending'};this.#prepared.set(handle,entry);
  return{handle,request:Object.freeze({id,value})};
 }
 #entry(handle,state){const e=this.#prepared.get(handle);if(this.closed||!e||state&&e.state!==state)throw Error('Unknown, foreign, stale or nonready Room amount ticket');return e;}
 ready(handle,receipt){const e=this.#entry(handle,'pending');if(receipt?.id!==e.id||receipt.reserved!==true||!Object.is(receipt.value,e.value))throw Error('Prepared Room reservation receipt differs');e.state='ready';return handle;}
 refuse(handle){const e=this.#entry(handle,'pending');this.transport.cancel(e.token);this.#prepared.delete(handle);}
 beginCancel(handle){const e=this.#entry(handle,'ready');e.state='cancelling';return{id:e.id};}
 finishCancel(handle,receipt){const e=this.#entry(handle,'cancelling');if(receipt?.id!==e.id||receipt.cancelled!==true)throw Error('Prepared Room cancellation receipt differs');this.transport.cancel(e.token);this.#prepared.delete(handle);}
 preflightTicket(handle,value){validateRoomAmount(value);const e=this.#entry(handle,'ready');if(this.failed)throw Error(this.failed);if(this.busy)throw Error('Reentrant prepared Room amount call');if(!Object.is(e.value,value))throw Error('Prepared Room amount value differs');}
 commit(handle){
  const e=this.#entry(handle,'ready');if(this.failed)throw Error(this.failed);if(this.busy)throw Error('Reentrant prepared Room amount call');
  this.busy=true;let first=false;
  try{
   const drySeconds=this.context.currentTime,drySequence=this.transport.write(e.token,this.payload(3,e.id,e.value,drySeconds),{seconds:drySeconds});first=true;e.state='committing';
   const wetSeconds=this.context.currentTime;if(wetSeconds<drySeconds)throw Error('Room original wet clock moved backwards');const wetSequence=this.transport.write(e.token,this.payload(4,e.id,e.value,wetSeconds),{seconds:wetSeconds});
   this.#prepared.delete(handle);this.amount=e.value;const row={id:e.id,value:e.value,drySeconds,wetSeconds,drySequence,wetSequence,prepared:true};if(this.trace.length<64)this.trace.push({...row});return row;
  }catch(error){if(first||this.transport.failed){try{this.transport.cancel(e.token);}catch{}this.#prepared.delete(handle);this.failed='Incomplete prepared Room pair; retire owner: '+error;}throw error;}finally{this.busy=false;}
 }
 setAmount(){throw Error('Prepared Room profile requires a READY ticket');}
 close(){if(this.closed)return;this.closed=true;for(const e of this.#prepared.values())try{this.transport.cancel(e.token);}catch{}this.#prepared.clear();}
 snapshot(){const states={pending:0,ready:0,cancelling:0};for(const e of this.#prepared.values())states[e.state]=(states[e.state]??0)+1;return{...super.snapshot(),preparedProfile:ROOM_PREPARED_AMOUNT_PROFILE,closed:this.closed,reservations:this.#prepared.size,states};}
}
