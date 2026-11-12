const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max,hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Context-wide upload clock. It does not pull any bed input or advance its DSP.
 * Callback pacing is global, not per bed: <=1 4096-byte packet/actual quantum.
 * A suspended startup uses explicit one-step message pumps before any callback. */
export class AmbienceSpatialUploadReceiver{
 constructor({slots,post,onReady=()=>{},onError=()=>{}}){if(!Array.isArray(slots)||slots.length<1||slots.length>16||typeof post!=='function')throw Error('Invalid spatial receiver capacity');this.slots=slots;this.post=post;this.onReady=onReady;this.onError=onError;this.resources=new Map();this.waveOwners=new Map();this.queue=[null,null];this.head=0;this.count=0;this.hot=false;this.callbacks=0;this.metrics={coldChunks:0,hotChunks:0,maxQueued:0,returned:0,stale:0};}
 slot(r){const s=this.slots[r.slot];return s?.leased&&s.generation===r.generation?s:null;}
 receive(m){
  if(m.type==='resource'){this.begin(m);return;}
  if(m.type==='resource-ready'){this.verified(m);return;}
  if(m.type!=='chunk')throw Error('Unknown spatial upload message');
  if(!(m.buffer instanceof ArrayBuffer)||m.buffer.byteLength!==4096||!integer(m.packet,1,Number.MAX_SAFE_INTEGER)||!integer(m.byteOffset,0,65536)||!integer(m.byteLength,1,4096))throw Error('Invalid spatial packet bounds');
  const r=this.resources.get(m.id);if(!r||r.generation!==m.generation||!this.slot(r)){this.metrics.stale++;this.returnPacket(m,'stale');return;}
  const t=r.tracks.get(m.kind);if(!t||m.byteOffset!==t.queued||m.byteLength!==Math.min(4096,t.bytes-t.queued)||this.count>=2)throw Error('Spatial upload credit/order capacity');
  t.queued+=m.byteLength;this.queue[(this.head+this.count)%2]=m;this.count++;this.metrics.maxQueued=Math.max(this.metrics.maxQueued,this.count);
 }
 begin(m){
  if(!integer(m.id,1,Number.MAX_SAFE_INTEGER)||!integer(m.generation,1,Number.MAX_SAFE_INTEGER)||!integer(m.slot,0,this.slots.length-1)||!integer(m.wave,0,6)||this.resources.has(m.id)||this.resources.size>=32)throw Error('Spatial resource identity/capacity');
  const r={...m,tracks:new Map(),ready:false},s=this.slot(r),key=m.slot*7+m.wave;if(!s||this.waveOwners.has(key))throw Error('Stale or busy spatial resource generation');
  if(m.recipe?.sampleRate!==s.core.sampleRate||typeof m.recipe.offset!=='number'||!Number.isFinite(m.recipe.offset)||m.recipe.offset<0||m.recipe.offset>1e6||((s.core.stats().created&(1<<m.wave))&&m.recipe.offset!==s.core.waveOffset(m.wave)))throw Error('Spatial captured recipe differs');
  if(m.phase){const size=s.core.sampleRate<=24000?2048:s.core.sampleRate<=88200?4096:16384;if(m.phase.samples!==size||(s.core.stats().created&(1<<m.wave)))throw Error('Spatial constructor table shape/lifetime');r.tracks.set('phase',{bytes:size*4,queued:0,written:0});}
  if(m.walk){if(!integer(m.walk.maxCount,0,256)||!['first','refill'].includes(m.walk.kind))throw Error('Spatial knot resource header');r.tracks.set('walk',{bytes:m.walk.maxCount*16,queued:0,written:0});}
  if(!r.tracks.size)throw Error('Empty spatial resource');
  // Only staging is touched. The active table and source state remain unchanged.
  s.core.abort(m.wave);if(m.walk)s.core.beginWalk(m.wave,m.walk,m.recipe);
  this.waveOwners.set(key,m.id);this.resources.set(m.id,r);
 }
 drain(cold){
  if(!this.count)return 0;const m=this.queue[this.head];this.queue[this.head]=null;this.head=(this.head+1)%2;this.count--;const r=this.resources.get(m.id),s=r&&this.slot(r);
  if(!r||r.generation!==m.generation||!s){this.metrics.stale++;this.returnPacket(m,'stale');return 0;}
  try{const t=r.tracks.get(m.kind);if(m.byteOffset!==t.written)throw Error('Spatial staging write order');const data=m.kind==='phase'?new Float32Array(m.buffer,0,m.byteLength/4):new Float64Array(m.buffer,0,m.byteLength/8),echo=m.kind==='phase'?s.core.phaseChunk(r.wave,m.byteOffset/4,data):s.core.walkChunk(r.wave,m.byteOffset/16,data);data.set(echo);t.written+=m.byteLength;if(cold)this.metrics.coldChunks++;else this.metrics.hotChunks++;this.returnPacket(m);return 1;}
  catch(error){this.returnPacket(m,error.message);this.cancel(m.id,m.generation);this.onError({id:m.id,generation:m.generation,error:error.message});return 0;}
 }
 returnPacket(m,error=null){this.post({...m,type:'echo',error},[m.buffer]);this.metrics.returned++;}
 callback(){this.hot=true;this.callbacks++;return this.drain(false);}
 coldPump(){return this.hot?0:this.drain(true);}
 verified(m){const r=this.resources.get(m.id),s=r&&this.slot(r);if(!r||r.generation!==m.generation||!s)return;if(r.ready||!Array.isArray(m.identities)||m.identities.length!==r.tracks.size||[...r.tracks.values()].some(t=>t.written!==t.bytes)||m.identities.some(x=>!r.tracks.has(x.kind)||x.bytes!==r.tracks.get(x.kind).bytes||!hex(x.sha256))||new Set(m.identities.map(x=>x.kind)).size!==r.tracks.size)throw Error('Spatial full readback receipt differs');if(r.phase)s.core.sealPhase(r.wave);if(r.walk)s.core.sealWalk(r.wave);r.ready=true;r.identities=m.identities;this.onReady(r);}
 take(id,generation){const r=this.resources.get(id);if(!r||r.generation!==generation||!this.slot(r)||!r.ready)throw Error('Unverified/stale spatial resource publication');return r;}
 finish(id,generation){const r=this.take(id,generation);this.resources.delete(id);this.waveOwners.delete(r.slot*7+r.wave);}
 cancel(id,generation){const r=this.resources.get(id);if(!r||r.generation!==generation)return false;const s=this.slot(r);s?.core.abort(r.wave);this.resources.delete(id);this.waveOwners.delete(r.slot*7+r.wave);this.post({type:'cancel-resource',id,generation});return true;}
 retireSlot(slot,generation){for(const r of this.resources.values())if(r.slot===slot&&r.generation===generation)this.cancel(r.id,r.generation);}
 snapshot(){return{hot:this.hot,callbacks:this.callbacks,resources:this.resources.size,queued:this.count,...this.metrics};}
}
