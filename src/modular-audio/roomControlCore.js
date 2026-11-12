import{OwnedRoomControlLive}from'./ownedRoomControlLive.js';
import{StampedWordReader,StampedFloat64Words}from'./stampedWordTransport.js';
import{ROOM_AMOUNT_WORDS,ROOM_AMOUNT_SLOTS,ROOM_AMOUNT_PREFIX,ROOM_AMOUNT_PAIR_MAX}from'./roomAmountWords.js';
export class RoomControlCore{
 constructor(module,configuration,{emit=()=>{}}={}){
  this.unit=new OwnedRoomControlLive(module,configuration);this.rate=configuration.sampleRate;this.emit=emit;this.reader=new StampedWordReader({wordCount:16,slots:32,prefix:ROOM_AMOUNT_PREFIX});this.codec=new StampedFloat64Words();this.frames=new Float64Array(32);this.sequences=new Uint32Array(32);this.payloads=new Uint16Array(32*16);this.head=0;this.queued=0;this.appliedSequence=0;this.consumedSequence=0;this.pendingPair=0;this.pendingSince=0;this.frame=0;this.failure=null;this.rejectedPairs=0;this.maxQueue=0;
 }
 alive(){if(this.failure)throw Error(this.failure);if(!this.unit)throw Error('Room control core disposed');}
 sync(frame,{isolated=false}={}){this.alive();this.unit.sync(frame,{isolated});this.frame=frame;}
 receive(parameters){this.alive();try{return this.consume(parameters);}catch(e){this.failure=String(e);throw e;}}
 consume(parameters){
  this.alive();const count=this.reader.read(parameters),first=this.reader.sequence-count+1;if(this.queued+count>32)throw Error('Room amount owned pending queue capacity');
  for(let i=0;i<count;i++){const at=(this.head+this.queued)%32;this.frames[at]=this.reader.frames[i];this.sequences[at]=first+i;for(let j=0;j<16;j++)this.payloads[at*16+j]=this.reader.words[i*16+j];this.queued++;}this.maxQueue=Math.max(this.maxQueue,this.queued);
  let observed=false;
  while(this.queued&&this.frames[this.head]<=this.frame){
   const at=this.head,offset=at*16,op=this.payloads[offset],id=this.payloads[offset+13]+this.payloads[offset+14]*65536,value=this.codec.decode(this.payloads,offset+1),seconds=this.codec.decode(this.payloads,offset+5),author=this.frames[at],sequence=this.sequences[at];
   if(op>2||id<1||id>ROOM_AMOUNT_PAIR_MAX||this.payloads[offset+15]!==0||!Number.isFinite(value)||value<0||value>1||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid Room amount semantic payload');
   if(op!==2)for(let j=9;j<13;j++)if(this.payloads[offset+j]!==0)throw Error('Unexpected second time on a live Room leaf');
   if(op===0){if(this.pendingPair)throw Error('Live Room dry arrived before prior wet');this.unit.reservePair(id,value,author);this.unit.leaf(id,0,value,seconds,author);this.pendingPair=id;this.pendingSince=this.frame;}
   else if(op===1){if(id!==this.pendingPair)throw Error('Live Room wet pair identifier differs');this.unit.leaf(id,1,value,seconds,author);this.pendingPair=0;this.appliedSequence=sequence;observed=true;}
   else{
    if(this.pendingPair)throw Error('Atomic Room pair interrupted an incomplete live call');const wet=this.codec.decode(this.payloads,offset+9);
    if(!Number.isFinite(wet)||wet<seconds)throw Error('Invalid complete Room wet time');
    // A future-booking refusal is recoverable and never changes either timeline.
    if(seconds<this.frame/this.rate||wet>this.frame/this.rate+3600){this.rejectedPairs++;this.emit({kind:'pair-rejected',sequence,id,error:'Complete Room future pair missed its output deadline',authorFrame:author,observedOutputFrame:this.frame});}
    else{let rejection=null;try{this.unit.admitPair(value,seconds,wet,{dryCallFrame:author,wetCallFrame:author});}catch(e){rejection=String(e);}if(rejection){this.rejectedPairs++;this.emit({kind:'pair-rejected',sequence,id,error:rejection,authorFrame:author,observedOutputFrame:this.frame});}else this.emit({kind:'pair-accepted',sequence,id,authorFrame:author,observedOutputFrame:this.frame});}
    this.appliedSequence=sequence;observed=true;
   }
   this.consumedSequence=sequence;this.queued--;this.head=(this.head+1)%32;
  }
  if(this.pendingPair&&this.frame-this.pendingSince>=8192)throw Error('Missing live Room wet counterpart exceeded64-output-quantum bound');
  if(observed)this.emit({kind:'observed',sequence:this.appliedSequence,outputFrame:this.frame});
  return count;
 }
 render(dry,wet,{dryMode=2,wetMode=2}={}){
  this.alive();try{if(dryMode===2){if(dry.length!==this.unit.sourceChannels)throw Error('Room dry input layout differs');for(let c=0;c<dry.length;c++)for(let i=0;i<128;i++)this.unit.inputDry[c][i]=dry[c][i];}if(wetMode===2){if(wet.length!==this.unit.wetChannels)throw Error('Room wet input layout differs');for(let c=0;c<wet.length;c++)for(let i=0;i<128;i++)this.unit.inputWet[c][i]=wet[c][i];}this.unit.render({dryMode,wetMode});return this.unit.output;}catch(e){this.failure=String(e);throw e;}
 }
 stats(){return{unit:this.unit?.stats()??null,reader:this.reader.snapshot(),queued:this.queued,maxQueue:this.maxQueue,appliedSequence:this.appliedSequence,consumedSequence:this.consumedSequence,pendingPair:this.pendingPair,pendingSince:this.pendingSince,rejectedPairs:this.rejectedPairs,outputFrame:this.frame,failure:this.failure};}
 dispose(){this.unit?.dispose();this.unit=null;this.payloads=this.frames=this.sequences=null;}
}
