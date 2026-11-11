import {OwnedAmbienceControlPreparation,prepareAmbienceSpatialPhase} from './ownedAmbienceControlPreparation.js';
const CHUNK_BYTES=4096,MAX_PENDING=32,MAX_SLOTS=16;
const key=(slot,wave)=>{if(!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS||!Number.isInteger(wave)||wave<0||wave>6)throw Error('Invalid bounded spatial stream');return slot*7+wave;};
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
/** Offthread only. Receiver must echo actual staged bytes, not the incoming bytes.
 * At most two transferable credits exist. Receiver callback pacing is a separate
 * enforced executor contract; this producer never depends on AudioContext.resume. */
export class AmbienceSpatialResourceProducer{
 constructor(module,{post,sha256}){if(!(module instanceof WebAssembly.Module)||typeof post!=='function'||typeof sha256!=='function')throw Error('Spatial producer dependencies');this.module=module;this.exports=new WebAssembly.Instance(module,{}).exports;this.post=post;this.sha256=sha256;this.streams=new Map();this.resources=new Map();this.inflight=new Map();this.credits=[new ArrayBuffer(CHUNK_BYTES),new ArrayBuffer(CHUNK_BYTES)];this.queue=[];this.nextPacket=0;this.closed=false;}
 alive(){if(this.closed)throw Error('Disposed spatial producer');}
 open({slot,wave,sampleRate,period,offset=0}){this.alive();const k=key(slot,wave);if(this.streams.has(k))throw Error('Spatial stream already exists');if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Spatial stream rate');const planner=new OwnedAmbienceControlPreparation(this.exports,{seed:wave===6?4411:6101+wave*53,period,offset});this.streams.set(k,{planner,sampleRate,wave,period,offset,pending:null,phaseCommitted:false});}
 period({slot,wave,value}){this.alive();const s=this.streams.get(key(slot,wave));if(!s)throw Error('Unknown spatial stream');s.planner.setPeriod(value);}
 prepare({id,generation,slot,wave,type,periodAfter,at}){
  this.alive();if(!Number.isSafeInteger(id)||id<=0||this.resources.has(id)||!Number.isSafeInteger(generation)||generation<=0||this.resources.size>=MAX_PENDING)throw Error('Spatial preparation capacity or identity');
  const s=this.streams.get(key(slot,wave));if(!s||s.pending!==null)throw Error('Unknown or busy spatial stream');const periodBefore=s.planner.stats().period;let packet;
  if(type==='first')packet=s.planner.first(periodAfter);else if(type==='refill')packet=s.planner.refill(at);else if(type==='phase'){if(s.phaseCommitted)throw Error('Spatial constructor phase already committed');packet=null;}else throw Error('Unknown spatial resource type');
  let phase;
  try{if(type==='phase'||type==='first'&&!s.phaseCommitted)phase=prepareAmbienceSpatialPhase(this.exports,{sampleRate:s.sampleRate,wave,period:s.period,offset:s.offset});}catch(error){if(packet)s.planner.cancel(packet.id);throw error;}
  const tracks=[];if(phase)tracks.push({kind:'phase',data:bytes(phase.table),echo:new Uint8Array(phase.table.byteLength),sent:0,received:0});if(packet)tracks.push({kind:'walk',data:bytes(packet.points),echo:new Uint8Array(packet.points.byteLength),sent:0,received:0});
  const r={id,generation,slot,wave,stream:s,packet,tracks,cancelled:false,sealed:false,hashing:false};s.pending=id;this.resources.set(id,r);this.queue.push(r);
  this.post({type:'resource',id,generation,slot,wave,recipe:{sampleRate:s.sampleRate,periodBefore,periodAfter:packet?.periodAfter??periodBefore,offset:s.offset},walk:packet?{kind:packet.kind,id:packet.id,minCount:packet.minCount,maxCount:packet.maxCount,initial:packet.initial,firstIndex:packet.firstIndex,at:packet.at}:null,phase:phase?{samples:phase.table.length,real:phase.real,imag:phase.imag}:null});
  this.pump();return packet?.id??0;
 }
 pump(){
  while(this.credits.length){const r=this.queue.find(r=>!r.cancelled&&r.tracks.some(t=>t.sent<t.data.length));if(!r)break;const t=r.tracks.find(t=>t.sent<t.data.length),offset=t.sent,n=Math.min(CHUNK_BYTES,t.data.length-offset),buffer=this.credits.pop(),view=new Uint8Array(buffer);view.fill(0);view.set(t.data.subarray(offset,offset+n));t.sent+=n;const packet=++this.nextPacket;this.inflight.set(packet,{r,t,offset,n});this.post({type:'chunk',id:r.id,generation:r.generation,packet,kind:t.kind,byteOffset:offset,byteLength:n,buffer},[buffer]);}
  for(const r of this.queue)if(!r.cancelled&&!r.hashing&&r.tracks.every(t=>t.received===t.data.length))this.seal(r);
 }
 echo({packet,id,generation,kind,byteOffset,byteLength,buffer}){
  this.alive();const p=this.inflight.get(packet);if(!p)throw Error('Unknown spatial transfer credit');
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==CHUNK_BYTES)throw Error('Spatial transfer credit byte budget');
  if(id!==p.r.id||generation!==p.r.generation||kind!==p.t.kind||byteOffset!==p.offset||byteLength!==p.n)throw Error('Spatial transfer credit identity');
  this.inflight.delete(packet);this.credits.push(buffer);if(!p.r.cancelled){const received=new Uint8Array(buffer,0,p.n);p.t.echo.set(received,p.offset);p.t.received+=p.n;}
  this.pump();
 }
 async seal(r){
  r.hashing=true;
  try{const identities=[];for(const t of r.tracks){const [expected,received]=await Promise.all([this.sha256(t.data),this.sha256(t.echo)]);if(expected!==received)throw Error('Spatial receiver readback SHA differs');identities.push({kind:t.kind,sha256:received,bytes:t.data.length});}if(this.closed||r.cancelled||this.resources.get(r.id)!==r)return;r.sealed=true;this.post({type:'resource-ready',id:r.id,generation:r.generation,identities});}
  catch(error){if(!this.closed&&!r.cancelled){this.cancel({id:r.id,generation:r.generation});this.post({type:'resource-error',id:r.id,generation:r.generation,error:error.message});}}
 }
 commit({id,generation,count,birth}){this.alive();const r=this.resources.get(id);if(!r||r.generation!==generation||r.cancelled||!r.sealed)throw Error('Unverified or foreign spatial resource commit');if(r.packet)r.stream.planner.commit(r.packet.id,count,birth);else if(count!==0||!Number.isFinite(birth)||birth<0||birth>137438953)throw Error('Invalid phase-only acknowledgement');if(r.tracks.some(t=>t.kind==='phase'))r.stream.phaseCommitted=true;r.stream.pending=null;this.resources.delete(id);this.queue=this.queue.filter(x=>x!==r);this.post({type:'committed',id,generation,stats:r.stream.planner.stats()});}
 cancel({id,generation}){this.alive();const r=this.resources.get(id);if(!r||r.generation!==generation)throw Error('Foreign spatial resource cancellation');if(r.packet)r.stream.planner.cancel(r.packet.id);r.cancelled=true;r.stream.pending=null;this.resources.delete(id);this.queue=this.queue.filter(x=>x!==r);this.post({type:'cancelled',id,generation});this.pump();}
 streamStats({slot,wave}){this.alive();const s=this.streams.get(key(slot,wave));if(!s)throw Error('Unknown spatial stream');return s.planner.stats();}
 stats(){return{streams:this.streams.size,pending:this.resources.size,inflight:this.inflight.size,credits:this.credits.length,queued:this.queue.length};}
 closeStream({slot,wave}){this.alive();const k=key(slot,wave),s=this.streams.get(k);if(!s)throw Error('Unknown spatial stream');if(s.pending!==null)throw Error('Cancel pending resource before closing spatial stream');s.planner.dispose();this.streams.delete(k);}
 dispose(){if(this.closed)return;for(const s of this.streams.values())s.planner.dispose();this.closed=true;this.streams.clear();this.resources.clear();this.queue=[];this.inflight.clear();this.credits=[];}
}
