// Generated live-only bounded receipt profile. Accepted transport body is mechanically retained.
(()=>{
const {OwnedAmbienceControlPreparation,prepareAmbienceSpatialPhase}=(()=>{
// Offthread live booking forecast. Never run random seeking on an audio callback.
const AMBIENCE_CONTROL_PREPARATION_PROFILE='ambience-live-control-preparation-v1';
const MAX_COMMANDS=4096,validPeriod=p=>typeof p==='number'&&Number.isFinite(p)&&p>=15&&p<=900,validSeconds=t=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<=137438953;
class OwnedAmbienceControlPreparation{
 constructor(moduleOrExports,{seed,period,offset=0}){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!validPeriod(period)||!Number.isFinite(offset)||offset<0||offset>1e6)throw Error('Invalid live control preparation recipe');this.recipe=Object.freeze({seed,period,offset});this.journal=[];this.pending=null;this.e=moduleOrExports instanceof WebAssembly.Module?new WebAssembly.Instance(moduleOrExports,{}).exports:moduleOrExports;if(this.e.ambience_control_preparation_api()!==1)throw Error('Control preparation ABI mismatch');this.handle=this.e.ambience_control_preparation_new(seed,period,offset);if(!this.handle)throw Error('Control preparation allocation refused');}
 alive(){if(!this.handle)throw Error('Disposed control preparation');}
 accept(v){if(!v)throw Error('Control preparation request refused before committed state changed');}
 capacity(){this.alive();if(this.journal.length>=MAX_COMMANDS)throw Error('Control preparation history capacity');}
 value(key){this.alive();return this.e.ambience_control_preparation_stat(this.handle,key);}
 packet(){const min=this.value(18),max=this.value(19);return{id:this.value(16),kind:this.value(17)===1?'first':'refill',minCount:min,maxCount:max,initial:this.value(20),firstIndex:this.value(21),periodAfter:this.value(22),at:this.value(23),points:new Float64Array(this.e.memory.buffer,this.e.ambience_control_preparation_points(this.handle),max*2).slice()};}
 first(periodAfter=this.stats().period){this.capacity();if(this.pending||!validPeriod(periodAfter))throw Error('Invalid or overlapping first control resource');this.accept(this.e.ambience_control_preparation_first(this.handle,periodAfter));const packet=this.packet();this.pending={id:packet.id,kind:'first',periodAfter};return packet;}
 refill(now){this.capacity();if(this.pending||!validSeconds(now))throw Error('Invalid or overlapping control refill resource');this.accept(this.e.ambience_control_preparation_refill(this.handle,now));const packet=this.packet();this.pending={id:packet.id,kind:'refill',now};return packet;}
 commit(id,count,birth){this.alive();if(!this.pending||id!==this.pending.id||!Number.isInteger(count)||count<0||count>256||!validSeconds(birth))throw Error('Invalid control resource acknowledgement');this.accept(this.e.ambience_control_preparation_commit(this.handle,id,count,birth));const p=this.pending;this.pending=null;this.journal.push(p.kind==='first'?{op:'first',periodAfter:p.periodAfter,count,birth}:{op:'refill',now:p.now,count,birth});}
 cancel(id){this.alive();if(!this.pending||this.pending.id!==id)throw Error('Foreign control resource cancellation');this.accept(this.e.ambience_control_preparation_cancel(this.handle,id));this.pending=null;}
 setPeriod(value){this.capacity();if(this.pending||!validPeriod(value))throw Error('Control period edit requires the previous resource acknowledgement');this.accept(this.e.ambience_control_preparation_period(this.handle,value));this.journal.push({op:'period',value});}
 stats(){return Object.fromEntries(['period','offset','birth','nextIndex','randomDraws','revision','committedPlans','lastRefill'].map((n,i)=>[n,this.value(i)]));}
 reset(){this.alive();this.accept(this.e.ambience_control_preparation_reset(this.handle));this.pending=null;this.journal=[];}
 save(){this.alive();if(this.pending)throw Error('Acknowledge or cancel the pending control resource before saving');return JSON.stringify({version:1,profile:AMBIENCE_CONTROL_PREPARATION_PROFILE,recipe:this.recipe,commands:this.journal});}
 static load(moduleOrExports,text){if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Control preparation save byte budget');const s=JSON.parse(text);if(s.version!==1||s.profile!==AMBIENCE_CONTROL_PREPARATION_PROFILE||!Array.isArray(s.commands)||s.commands.length>MAX_COMMANDS)throw Error('Invalid saved control preparation');const p=new OwnedAmbienceControlPreparation(moduleOrExports,s.recipe);try{for(const c of s.commands){if(c.op==='period')p.setPeriod(c.value);else if(c.op==='first'){const resource=p.first(c.periodAfter);p.commit(resource.id,c.count,c.birth);}else if(c.op==='refill'){const resource=p.refill(c.now);p.commit(resource.id,c.count,c.birth);}else throw Error('Unknown saved control operation');}return p;}catch(error){p.dispose();throw error;}}
 dispose(){if(this.handle){this.e.ambience_control_preparation_free(this.handle);this.handle=0;this.e=null;this.pending=null;}}
}

// Cold/offthread operation. The returned immutable resource owns its PCM copy.
function prepareAmbienceSpatialPhase(moduleOrExports,{sampleRate,wave,period,offset=0}){
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(wave)||wave<0||wave>6||!validPeriod(period)||typeof offset!=='number'||!Number.isFinite(offset)||offset<0||offset>1e6)throw Error('Invalid bounded Ambience phase recipe');
 const e=moduleOrExports instanceof WebAssembly.Module?new WebAssembly.Instance(moduleOrExports,{}).exports:moduleOrExports;
 if(e.ambience_control_preparation_api()!==1)throw Error('Control preparation ABI mismatch');
 const h=e.ambience_control_preparation_phase_new(sampleRate,wave,period,offset);if(!h)throw Error('Ambience phase preparation refused');
 try{const size=e.ambience_control_preparation_phase_stat(h,6);return Object.freeze({version:1,profile:AMBIENCE_CONTROL_PREPARATION_PROFILE,recipe:Object.freeze({sampleRate,wave,period,offset}),real:e.ambience_control_preparation_phase_stat(h,4),imag:e.ambience_control_preparation_phase_stat(h,5),table:new Float32Array(e.memory.buffer,e.ambience_control_preparation_phase_data(h),size).slice()});}finally{e.ambience_control_preparation_phase_free(h);}
}

return {OwnedAmbienceControlPreparation,prepareAmbienceSpatialPhase};})();
const {AmbienceLiveControlPlanner}=(()=>{


const LIVE_AMBIENCE_RECEIPTS = 256;
/** Fixed-capacity diagnostics. These receipts are not a replay DTO. The actual
 * RNG, period, next knot and pending candidate remain in the accepted Rust unit. */
class ReceiptRing {
    constructor() { this.entries = Array(LIVE_AMBIENCE_RECEIPTS).fill(null); this.length = 0; this.next = 0; this.total = 0; }
    push(value) { this.entries[this.next] = value; this.next = (this.next + 1) % LIVE_AMBIENCE_RECEIPTS; this.length = Math.min(this.length + 1, LIVE_AMBIENCE_RECEIPTS); this.total++; }
    recent() { return Array.from({length:this.length}, (_,i) => this.entries[(this.next - this.length + i + LIVE_AMBIENCE_RECEIPTS) % LIVE_AMBIENCE_RECEIPTS]); }
}
class AmbienceLiveControlPlanner extends OwnedAmbienceControlPreparation {
    constructor(module, recipe) { super(module, recipe); this.journal = new ReceiptRing(); }
    capacity() { this.alive(); }
    refill(now) { if (Number.isFinite(now) && now > this.stats().lastRefill + 90) throw Error('Live control refill exceeded the retained ninety-second horizon'); return super.refill(now); }
    reset() { super.reset(); this.journal = new ReceiptRing(); }
    save() { throw Error('Live control receipts are diagnostics, not a captured replay or mid-render state'); }
    receiptStatus() { this.alive(); return {profile:'bounded-live-ambience-control-v1', capacity:LIVE_AMBIENCE_RECEIPTS, retained:this.journal.length, total:this.journal.total, recent:this.journal.recent(), state:this.stats()}; }
}

return {AmbienceLiveControlPlanner};})();
const {AmbienceSpatialResourceProducer}=(()=>{

const CHUNK_BYTES=4096,MAX_PENDING=32,MAX_SLOTS=16;
const key=(slot,wave)=>{if(!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS||!Number.isInteger(wave)||wave<0||wave>6)throw Error('Invalid bounded spatial stream');return slot*7+wave;};
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
/** Offthread only. Receiver must echo actual staged bytes, not the incoming bytes.
 * At most two transferable credits exist. Receiver callback pacing is a separate
 * enforced executor contract; this producer never depends on AudioContext.resume. */
class AmbienceSpatialResourceProducer{
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

return {AmbienceSpatialResourceProducer};})();
const {AmbienceLiveControlProducer}=(()=>{


/** Live-only journal policy; inherited transport, forecast, SHA readback and
 * commit/cancel implementations remain the accepted resource producer. */
class AmbienceLiveControlProducer extends AmbienceSpatialResourceProducer {
    open({slot,wave,sampleRate,period,offset=0}) {
        this.alive();
        if (!Number.isInteger(slot)||slot<0||slot>=16||!Number.isInteger(wave)||wave<0||wave>6) throw Error('Invalid bounded spatial stream');
        const key=slot*7+wave;
        if (this.streams.has(key)) throw Error('Spatial stream already exists');
        if (!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000) throw Error('Spatial stream rate');
        const planner=new AmbienceLiveControlPlanner(this.exports,{seed:wave===6?4411:6101+wave*53,period,offset});
        this.streams.set(key,{planner,sampleRate,wave,period,offset,pending:null,phaseCommitted:false});
    }
    receipts({slot,wave}) {
        this.alive();
        if (!Number.isInteger(slot)||slot<0||slot>=16||!Number.isInteger(wave)||wave<0||wave>6) throw Error('Invalid bounded spatial stream');
        const stream=this.streams.get(slot*7+wave);
        if (!stream) throw Error('Unknown spatial stream');
        return stream.planner.receiptStatus();
    }
}

return {AmbienceLiveControlProducer};})();

let producer=null,port=null;const jobs=new Map(),hex=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
function emit(m,transfer=[]){port.postMessage(m,transfer);if(['committed','cancelled','resource-error'].includes(m.type)){jobs.delete(m.id);self.postMessage({kind:'producer-event',event:m});}}
function receivePort(m){try{if(m.type==='echo')producer.echo(m);else if(m.type==='cancel-resource'){if(producer.resources.has(m.id))producer.cancel(m);}else if(m.type==='installed')producer.commit(m);else throw Error('Unknown receiver acknowledgement');}catch(error){self.postMessage({kind:'error',error:error.message,id:m.id,generation:m.generation});}}
self.onmessage=({data:m})=>{try{if(m.kind==='init'){if(producer||!(m.module instanceof WebAssembly.Module)||!m.port)throw Error('Spatial producer initialization');port=m.port;producer=new AmbienceLiveControlProducer(m.module,{post:emit,sha256:hex});port.onmessage=({data})=>receivePort(data);port.start?.();self.postMessage({kind:'ready'});return;}if(!producer)throw Error('Unprepared spatial worker');let result;
 switch(m.kind){case'open':producer.open(m);break;case'period':producer.period(m);break;case'prepare':if(jobs.size>=32)throw Error('Spatial job capacity');jobs.set(m.id,m);try{result=producer.prepare(m);}catch(error){jobs.delete(m.id);throw error;}break;case'cancel':if(producer.resources.has(m.id))producer.cancel(m);break;case'close-stream':producer.closeStream(m);break;case'stats':result=producer.stats();break;case'dispose':producer.dispose();port.close();self.postMessage({kind:'disposed'});return;default:throw Error('Unknown spatial preparation command');}
 if(m.request!==undefined)self.postMessage({kind:'result',request:m.request,result});
 }catch(error){self.postMessage({kind:'rejected',request:m.request,id:m.id,generation:m.generation,error:error.message});}};

})();
