import{StampedWordWriter,StampedFloat64Words,stampedWordDescriptors}from'./stampedWordTransport.js';
import{validateRoomAmount}from'./ownedRoomControlLive.js';
export const ROOM_AMOUNT_WORDS=16,ROOM_AMOUNT_SLOTS=32,ROOM_AMOUNT_PREFIX='roomAmount',ROOM_AMOUNT_PAIR_MAX=8388607;
export const roomAmountDescriptors=()=>stampedWordDescriptors({wordCount:ROOM_AMOUNT_WORDS,slots:ROOM_AMOUNT_SLOTS,prefix:ROOM_AMOUNT_PREFIX});
export class RoomAmountWriter{
 constructor(parameters,context){this.context=context;this.transport=new StampedWordWriter(parameters,context,{wordCount:16,slots:32,prefix:ROOM_AMOUNT_PREFIX});this.codec=new StampedFloat64Words();this.words=new Uint16Array(16);this.pair=0;this.amount=0;this.failed=null;this.busy=false;this.trace=[];}
 alive(){if(this.failed)throw Error(this.failed);if(this.busy)throw Error('Reentrant Room amount call');if(this.pair>=ROOM_AMOUNT_PAIR_MAX)throw Error('Room pair identifier exhausted');}
 preflight(calls=1){this.alive();if(!Number.isInteger(calls)||calls<1||calls>16)throw Error('Invalid Room amount batch');this.transport.preflight(calls*2);}
 payload(op,id,value,dry,wet=0){this.words.fill(0);this.words[0]=op;this.codec.encode(value,this.words,1);this.codec.encode(dry,this.words,5);if(op===2)this.codec.encode(wet,this.words,9);this.words[13]=id&65535;this.words[14]=id>>>16;return this.words;}
 setAmount(value){
  validateRoomAmount(value);this.preflight();const ticket=this.transport.reserve(2),id=++this.pair;this.busy=true;let first=false;
  try{
   const drySeconds=this.context.currentTime;const drySequence=this.transport.write(ticket,this.payload(0,id,value,drySeconds),{seconds:drySeconds});first=true;
   const wetSeconds=this.context.currentTime;if(wetSeconds<drySeconds)throw Error('Room original wet clock moved backwards');const wetSequence=this.transport.write(ticket,this.payload(1,id,value,wetSeconds),{seconds:wetSeconds});
   this.amount=value;const record={id,value,drySeconds,wetSeconds,drySequence,wetSequence};if(this.trace.length<64)this.trace.push({...record});return record;
  }catch(e){try{this.transport.cancel(ticket);}catch{}if(first||this.transport.failed)this.failed='Incomplete live Room pair; retire owner: '+e;throw e;}finally{this.busy=false;}
 }
 schedulePair(value,drySeconds,wetSeconds){
  validateRoomAmount(value);this.alive();if(!Number.isFinite(drySeconds)||!Number.isFinite(wetSeconds)||drySeconds<0||wetSeconds<drySeconds)throw Error('Invalid complete Room pair times');const ticket=this.transport.reserve(1),id=++this.pair;this.busy=true;
  try{const authorSeconds=this.context.currentTime,sequence=this.transport.write(ticket,this.payload(2,id,value,drySeconds,wetSeconds),{seconds:authorSeconds});return{id,value,drySeconds,wetSeconds,authorSeconds,sequence};}
  catch(e){try{this.transport.cancel(ticket);}catch{}if(this.transport.failed)this.failed=String(e);throw e;}finally{this.busy=false;}
 }
 acknowledge(sequence){this.transport.acknowledge(sequence);}
 snapshot(){return{amount:this.amount,pair:this.pair,failed:this.failed,transport:this.transport.snapshot(),trace:this.trace.map(p=>({...p}))};}
}
