// Generated from verified accepted modules; source code is not vendored.
(()=>{
const OwnedAmbienceSpatialLiveCore=(()=>{
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const canonical=f=>integer(f,0,1099511627648)&&f%128===0;
const waveIndex=w=>{if(!integer(w,0,6))throw Error('Invalid spatial wave');return w;};
/** Cold-allocated live resource receiver. No phase FFT or random seek is imported
 * into this facade. An executor owns callback pacing and lease generations. */
class OwnedAmbienceSpatialLiveCore{
 constructor(module,{sampleRate,offset=0,originFrame=0}){
  if(!(module instanceof WebAssembly.Module)||!integer(sampleRate,8000,192000)||!finite(offset,0,1e6)||!canonical(originFrame))throw Error('Invalid cold spatial resources');
  this.e=new WebAssembly.Instance(module,{}).exports;this.handle=0;this.phase=[];this.walk=[];this.sampleRate=sampleRate;this.offset=offset;this.bindings=new Map();
  if(this.e.ambience_spatial_live_api()!==1)throw Error('Live spatial ABI mismatch');
  try{this.handle=this.e.ambience_spatial_new(sampleRate,offset,0);if(!this.handle)throw Error('Live spatial cold allocation refused');this.accept(this.e.ambience_spatial_live_enable(this.handle));
   for(let i=0;i<7;i++){const phase=this.e.ambience_spatial_live_phase_new(sampleRate);if(!phase)throw Error('Live phase allocation refused');this.phase.push(phase);const walk=this.e.ambience_spatial_live_walk_new();if(!walk)throw Error('Live walk allocation refused');this.walk.push(walk);}
   this.memory=this.e.memory.buffer;this.input=Array.from({length:19},(_,s)=>[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_spatial_input(this.handle,s,ch),128)));this.output=Array.from({length:7},(_,b)=>[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_spatial_output(this.handle,b,ch),128)));this.controls=Array.from({length:7},(_,w)=>new Float32Array(this.memory,this.e.ambience_spatial_control(this.handle,w),128));
   this.phaseScratch=this.phase.map(h=>new Float32Array(this.memory,this.e.ambience_spatial_live_phase_scratch(h),1024));this.walkScratch=this.walk.map(h=>new Float64Array(this.memory,this.e.ambience_spatial_live_walk_scratch(h),512));this.begin(originFrame,offset);
  }catch(error){this.dispose();throw error;}
 }
 alive(){if(!this.handle)throw Error('Disposed live spatial core');if(this.memory&&this.memory!==this.e.memory.buffer)throw Error('Live spatial memory changed after cold allocation');}
 accept(v){if(!v)throw Error('Live spatial resource or command refused before active-state mutation');}
 begin(frame,offset=this.offset){this.alive();if(!canonical(frame)||!finite(offset,0,1e6))throw Error('Invalid spatial lease clock');this.accept(this.e.ambience_spatial_live_begin(this.handle,frame,offset));for(let i=0;i<7;i++)this.abort(i);this.offset=offset;this.bindings.clear();}
 phaseChunk(wave,offset,data){this.alive();waveIndex(wave);if(!(data instanceof Float32Array)||!integer(offset,0,16384)||data.length<1||data.length>1024||data.some(v=>!Number.isFinite(v)||Math.abs(v)>2))throw Error('Invalid bounded phase upload');this.phaseScratch[wave].set(data);this.accept(this.e.ambience_spatial_live_phase_write(this.phase[wave],offset,data.length));return this.phaseScratch[wave].subarray(0,data.length);}
 sealPhase(wave){this.alive();this.accept(this.e.ambience_spatial_live_phase_seal(this.phase[waveIndex(wave)]));}
 beginWalk(wave,p,{periodBefore,periodAfter=p.periodAfter,offset=this.offset}={}){this.alive();waveIndex(wave);if(!p||!['first','refill'].includes(p.kind)||!integer(p.firstIndex,0,1e8)||!integer(p.minCount,0,256)||!integer(p.maxCount,p.minCount,256)||!finite(p.initial,-1,1)||!finite(periodBefore,15,900)||!finite(periodAfter,15,900)||!finite(offset,0,1e6)||!finite(p.at,0,137438953))throw Error('Invalid bounded walk resource');this.accept(this.e.ambience_spatial_live_walk_begin(this.walk[wave],p.kind==='first'?1:2,p.firstIndex,p.minCount,p.maxCount,p.initial,periodBefore,periodAfter,offset,p.at));}
 walkChunk(wave,pointOffset,data){this.alive();waveIndex(wave);if(!(data instanceof Float64Array)||data.length<2||data.length>512||data.length%2||!integer(pointOffset,0,256)||data.some(v=>!Number.isFinite(v)))throw Error('Invalid bounded knot upload');this.walkScratch[wave].set(data);this.accept(this.e.ambience_spatial_live_walk_write(this.walk[wave],pointOffset,data.length/2));this.accept(this.e.ambience_spatial_live_walk_read(this.walk[wave],pointOffset,data.length/2));return this.walkScratch[wave].subarray(0,data.length);}
 sealWalk(wave){this.alive();this.accept(this.e.ambience_spatial_live_walk_seal(this.walk[waveIndex(wave)]));}
 abort(wave){this.alive();waveIndex(wave);this.e.ambience_spatial_live_phase_abort(this.phase[wave]);this.e.ambience_spatial_live_walk_abort(this.walk[wave]);}
 create(wave,{birth,mode,period,shape=[0,0,1,0,0]}){this.alive();waveIndex(wave);if(!finite(birth,0,1099511627648/this.sampleRate)||!integer(mode,0,1)||!finite(period,15,900)||!Array.isArray(shape)||shape.length!==5||shape.some((v,i)=>!finite(v,i===3?-1:0,1)))throw Error('Invalid live spatial constructor');const count=mode===1?this.e.ambience_spatial_live_walk_count(this.walk[wave],birth):0;this.accept(this.e.ambience_spatial_live_create(this.handle,wave,birth,mode,period,...shape,this.phase[wave],mode===1?this.walk[wave]:0));return count;}
 /** Explicit successor API; legacy create() retains the lease baseline offset. */
 createRecipe(wave,{birth,mode,period,offset,shape=[0,0,1,0,0]}){this.alive();waveIndex(wave);if(!finite(offset,0,1e6)||!finite(birth,0,1099511627648/this.sampleRate)||!integer(mode,0,1)||!finite(period,15,900)||!Array.isArray(shape)||shape.length!==5||shape.some((v,i)=>!finite(v,i===3?-1:0,1)))throw Error('Invalid captured spatial constructor');const count=mode===1?this.e.ambience_spatial_live_walk_count(this.walk[wave],birth):0;this.accept(this.e.ambience_spatial_live_create_recipe(this.handle,wave,birth,mode,period,offset,...shape,this.phase[wave],mode===1?this.walk[wave]:0));return count;}
 waveOffset(wave){this.alive();return this.e.ambience_spatial_live_wave_offset(this.handle,waveIndex(wave));}
 /** Native main getter reads the current intrinsic; this does not evaluate a future event. */
 levelIntrinsic(layer){this.alive();if(!integer(layer,0,5))throw Error('Invalid spatial level layer');const value=this.e.ambience_spatial_live_level_intrinsic(this.handle,layer);if(!Number.isFinite(value))throw Error('Uncreated spatial level');return value;}
 firstWalk(wave,birth){this.alive();waveIndex(wave);const count=this.e.ambience_spatial_live_first(this.handle,wave,birth,this.walk[wave]);if(count<0)throw Error('Live first walk refused');return count;}
 activateWalk(wave,{birth,period,depth,tau=.4,property=false,observedFrame}){this.alive();waveIndex(wave);if(!canonical(observedFrame)||!finite(birth,0,1099511627648/this.sampleRate)||!finite(period,15,900)||!finite(depth,0,wave===6?.5:.8)||!finite(tau,0,480)||typeof property!=='boolean')throw Error('Invalid first-walk activation');const n=this.e.ambience_spatial_live_activate_walk(this.handle,observedFrame,wave,birth,period,depth,tau,Number(property),this.walk[wave]);if(n<0)throw Error('First-walk admission refused before active-state mutation');return n;}
 refill(wave,observedFrame){this.alive();observedFrame??=this.e.ambience_spatial_stat(this.handle,1);if(!canonical(observedFrame))throw Error("Invalid authored observation clock");this.accept(this.e.ambience_spatial_live_refill_at(this.handle,observedFrame,waveIndex(wave),this.walk[wave]));}
 bind(slot,layer,owner){this.alive();if(!integer(slot,0,18)||!integer(layer,0,5)||!integer(owner,1,0xffffffff))throw Error('Invalid live contribution');this.accept(this.e.ambience_spatial_live_bind(this.handle,slot,layer,owner));this.bindings.set(slot,{layer,owner});}
 command(op,target,owner,at,tau,args,observedFrame){this.alive();observedFrame??=this.e.ambience_spatial_stat(this.handle,1);if(!canonical(observedFrame))throw Error("Invalid authored observation clock");if(!integer(op,0,7)||!integer(target,0,18)||!integer(owner,0,0xffffffff)||!finite(at,0,1099511627648/this.sampleRate)||!finite(tau,0,480)||!Array.isArray(args)||args.length!==6||args.some(v=>!Number.isFinite(v)))throw Error('Invalid live spatial command');this.accept(this.e.ambience_spatial_live_command_at(this.handle,observedFrame,op,target,owner,at,tau,...args));if(op===7)for(const[s,b]of this.bindings)if(b.owner===owner)this.bindings.delete(s);}
 sync(frame){this.alive();if(!canonical(frame))throw Error('Invalid live render clock');this.accept(this.e.ambience_spatial_sync(this.handle,frame));}
 render({sourceAudio=0,sourceParameters=sourceAudio,layerAudio=0,layerParameters=layerAudio,filterAudio=0,filterParameters=filterAudio,bed=0}={}){this.alive();for(const[v,max]of[[sourceAudio,524287],[sourceParameters,524287],[layerAudio,63],[layerParameters,63],[filterAudio,262143],[filterParameters,262143],[bed,2]])if(!integer(v,0,max))throw Error('Invalid explicit live activity');this.accept(this.e.ambience_spatial_live_render(this.handle,sourceAudio,sourceParameters,layerAudio,layerParameters,filterAudio,filterParameters,bed));}
 stats(){this.alive();return{rate:this.sampleRate,observedFrame:this.e.ambience_spatial_live_observed(this.handle),frame:this.e.ambience_spatial_stat(this.handle,1),calls:this.e.ambience_spatial_stat(this.handle,2),rejected:this.e.ambience_spatial_stat(this.handle,3),created:this.e.ambience_spatial_live_created(this.handle),coldBytes:this.memory.byteLength,contributions:this.bindings.size};}
 dispose(){if(!this.e)return;for(const h of this.phase)this.e.ambience_spatial_live_phase_free(h);for(const h of this.walk)this.e.ambience_spatial_live_walk_free(h);if(this.handle)this.e.ambience_spatial_free(this.handle);this.handle=0;this.e=null;this.memory=null;this.input=this.output=this.controls=null;this.phase=[];this.walk=[];}
}

return OwnedAmbienceSpatialLiveCore;})();
const AmbienceSpatialUploadReceiver=(()=>{
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max,hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Context-wide upload clock. It does not pull any bed input or advance its DSP.
 * Callback pacing is global, not per bed: <=1 4096-byte packet/actual quantum.
 * A suspended startup uses explicit one-step message pumps before any callback. */
class AmbienceSpatialUploadReceiver{
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

return AmbienceSpatialUploadReceiver;})();
const HostRenderClock=(()=>{
/** Translate the host's reported epoch into distinct canonical render callbacks.
 * Native clock/cursor probes show that a resumed AudioWorklet global frame may
 * remain stale while native audio advances. Each actual callback owns one quantum.
 * A forward host epoch can skip pulls; it does not create missing DSP samples.
 */
class HostRenderClock {
 constructor({quantum=128,maxLagFrames=8192}={}) {
  if(!Number.isSafeInteger(quantum)||quantum<=0||!Number.isSafeInteger(maxLagFrames)||maxLagFrames<quantum||maxLagFrames%quantum)throw Error('Invalid host render clock bounds');
  this.quantum=quantum;this.maxLagFrames=maxLagFrames;this.globalFrame=null;this.renderFrame=null;this.calls=0;this.recoveredCallbacks=0;this.maxObservedLagFrames=0;this.forwardGapFrames=0;
 }
 next(globalFrame) {
  if(!Number.isSafeInteger(globalFrame)||globalFrame<0||globalFrame%this.quantum)throw Error('Host render clock requires a canonical global frame');
  if(this.globalFrame!==null&&globalFrame<this.globalFrame)throw Error('Host render global frame moved backwards');
  const expected=this.renderFrame===null?globalFrame:this.renderFrame+this.quantum,frame=Math.max(globalFrame,expected),lag=frame-globalFrame;
  if(!Number.isSafeInteger(frame+this.quantum)||lag>this.maxLagFrames)throw Error('Host render clock exceeded declared stale-frame limit');
  if(lag)this.recoveredCallbacks++;
  if(lag>this.maxObservedLagFrames)this.maxObservedLagFrames=lag;
  if(globalFrame>expected)this.forwardGapFrames+=globalFrame-expected;
  this.globalFrame=globalFrame;this.renderFrame=frame;this.calls++;return frame;
 }
 snapshot(){return{quantum:this.quantum,maxLagFrames:this.maxLagFrames,globalFrame:this.globalFrame,renderFrame:this.renderFrame,calls:this.calls,recoveredCallbacks:this.recoveredCallbacks,maxObservedLagFrames:this.maxObservedLagFrames,forwardGapFrames:this.forwardGapFrames};}
}

return HostRenderClock;})();
const applyAmbienceSpatialTopology=(()=>{
const topologyInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
/** One audio-thread transaction: validate all topology/activity declarations,
 * then clear only authored channel transitions and publish demand atomically. */
function applyAmbienceSpatialTopology(slot,message){
 const core=slot.core,channels=message.channels,activity=message.activity,created=core.stats().created&63,owner=message.cancelOwner??0;
 if(core.e.ambience_spatial_live_topology_api?.()!==1||!Array.isArray(channels)||channels.length!==6||!channels.every(v=>topologyInt(v,0,2))||!topologyInt(owner,0,0xffffffff))throw Error('Invalid explicit spatial topology');
 for(const[k,max]of[['sourceAudio',524287],['sourceParameters',524287],['layerAudio',63],['layerParameters',63],['filterAudio',262143],['filterParameters',262143],['widthParameters',63],['bed',2]])if(!topologyInt(activity?.[k],0,max))throw Error('Invalid topology activity bounds');
 if(activity.sourceAudio&~activity.sourceParameters||activity.layerAudio&~activity.layerParameters||activity.filterAudio&~activity.filterParameters||activity.widthParameters&~activity.layerParameters||(activity.layerAudio|activity.layerParameters)&~created)throw Error('Invalid topology activity relationship');
 const connected=[0,0,0,0,0,0];let bound=0,found=false;
 for(const[source,binding]of core.bindings){if(owner&&binding.owner===owner){found=true;continue;}bound|=1<<source;connected[binding.layer]++;}
 if((activity.sourceAudio|activity.sourceParameters)&~bound||owner&&!found)throw Error('Unknown topology source owner');
 for(let i=0;i<6;i++){if(created&(1<<i)){if(channels[i]!== (connected[i]?2:1))throw Error('Declared channel count differs from authored source connections');}else if(channels[i]!==0)throw Error('Topology targets an uncreated layer');}
 if(owner&&(!topologyInt(message.observedFrame,0,1099511627648)||message.observedFrame%128||message.observedFrame<core.stats().observedFrame||!Number.isFinite(message.at)||message.at<0||message.at*core.sampleRate>1099511627648))throw Error('Invalid topology cancellation clock');
 if(owner)core.command(7,0,owner,message.at,0,[0,0,0,0,0,0],message.observedFrame);
 let transitions=0;for(let i=0;i<6;i++)if(channels[i]){const previous=core.e.ambience_spatial_live_input_channel_count(core.handle,i);if(!Number.isFinite(previous))throw Error('Unprepared topology channel state');if(previous!==channels[i])transitions++;if(!core.e.ambience_spatial_live_input_channels(core.handle,i,channels[i]))throw Error('Prevalidated topology transition refused');}
 if(!core.e.ambience_spatial_live_width_parameters(core.handle,activity.widthParameters))throw Error('Prevalidated width demand refused');
 slot.node.activity={...activity};
 return{transitions,channels:channels.slice(),activity:{...activity},core:core.stats()};
}

return applyAmbienceSpatialTopology;})();
const registries=new Map(),validInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
class SpatialPoolClock extends AudioWorkletProcessor{
 constructor({processorOptions:p}){super();this.registry=null;this.disposed=false;this.clock={calls:0,snapshot(){return{calls:this.calls};}};try{if(currentFrame!==0||p.originFrame!==0||registries.has(p.pool)||!validInt(p.slots,1,16))throw Error('Spatial arena requires virgin suspended context before active callbacks');const slots=[];try{for(let i=0;i<p.slots;i++){const core=new OwnedAmbienceSpatialLiveCore(p.module,{sampleRate});if(core.memory.byteLength>8*1024*1024)throw Error('Spatial cold slot memory budget');slots.push({core,generation:0,leased:false,node:null});}}catch(error){for(const s of slots)s.core.dispose();throw error;}
  const r=this.registry={id:p.pool,slots,port:null,closed:false,clock:this.clock,receiver:null,owner:this.port};r.receiver=new AmbienceSpatialUploadReceiver({slots,post:(m,transfer=[])=>r.port?.postMessage(m,transfer),onReady:resource=>this.port.postMessage({kind:'staged',id:resource.id,generation:resource.generation,slot:resource.slot,wave:resource.wave,identities:resource.identities}),onError:error=>this.port.postMessage({kind:'resource-error',...error})});registries.set(p.pool,r);this.port.onmessage=({data})=>this.message(data);this.port.postMessage({kind:'ready',stats:this.snapshot()});
 }catch(error){this.port.postMessage({kind:'error',error:error.message});}}
 snapshot(){const r=this.registry;return{slots:r?.slots.map(s=>({leased:s.leased,retired:!!s.retired,generation:s.generation,core:s.core.stats()}))??[],upload:r?.receiver.snapshot(),clock:this.clock.snapshot()};}
 message(m){try{const r=this.registry;if(!r||r.closed)throw Error('Closed spatial context owner');let result;
 if(m.kind==='attach'){if(r.port||!m.port)throw Error('Spatial preparation port already attached');r.port=m.port;r.port.onmessage=({data})=>{try{if(['resource','chunk','resource-ready'].includes(data.type))r.receiver.receive(data);else if(data.type==='cancelled')r.receiver.cancel(data.id,data.generation);else if(data.type==='resource-error')this.port.postMessage({kind:'resource-error',...data});if(!this.clock.calls&&r.receiver.count)this.port.postMessage({kind:'pump-needed'});}catch(error){if(data.type==='chunk'&&data.buffer instanceof ArrayBuffer)r.receiver.returnPacket(data,error.message);r.receiver.cancel(data.id,data.generation);this.port.postMessage({kind:'resource-error',id:data.id,generation:data.generation,error:error.message});}};r.port.start?.();}
 else if(m.kind==='pump'){r.receiver.coldPump();result={more:!r.receiver.hot&&r.receiver.count>0};}
 else if(m.kind==='acquire'){const index=r.slots.findIndex(s=>!s.leased&&!s.retired);if(index<0)throw Error('Prepared spatial slot capacity');const s=r.slots[index];if(s.generation>=Number.MAX_SAFE_INTEGER)throw Error('Spatial lease generation exhausted');s.core.begin(m.frame,m.offset);s.generation++;s.leased=true;if(s.node){s.node.generation=s.generation;s.node.failed=false;s.node.clock=new HostRenderClock();s.node.clock.renderFrame=s.core.stats().frame-128;s.node.activity={sourceAudio:0,sourceParameters:0,layerAudio:0,layerParameters:0,filterAudio:0,filterParameters:0,bed:0};}result={slot:index,generation:s.generation};}
 else if(m.kind==='stats')result=this.snapshot();
 else if(m.kind==='dispose'){for(const s of r.slots)if(s.leased)throw Error('Release each bed before retiring the context owner');for(const s of r.slots)s.core.dispose();r.closed=true;r.port?.close();registries.delete(r.id);this.disposed=true;this.port.postMessage({kind:'disposed',request:m.request});return;}
 else{const s=r.slots[m.slot];if(!s?.leased||s.generation!==m.generation)throw Error('Stale spatial bed lease');const core=s.core;
  switch(m.kind){case'release':r.receiver.retireSlot(m.slot,m.generation);s.leased=false;s.retired=m.quarantine===true;if(!s.node?.pooled)s.node=null;core.begin(m.frame,0);break;
   case'topology':result=applyAmbienceSpatialTopology(s,m);break;
   case'bind':core.bind(m.source,m.layer,m.owner);break;
   case'level-intrinsic':result={value:core.levelIntrinsic(m.layer),frame:core.stats().frame,observedFrame:core.stats().observedFrame};break;
   case'command':core.command(m.op,m.target,m.owner,m.at,m.tau,m.args,m.observedFrame);break;
   case'install':{const resource=r.receiver.take(m.id,m.generation);if(resource.slot!==m.slot)throw Error('Spatial resource slot differs');const a=m.action;let count=0;
    if(a.kind==='create'){if(!resource.phase||a.mode!==(resource.walk?1:0))throw Error('Spatial constructor resource kind');if(resource.walk&&resource.walk.kind!=='first'||m.observedFrame<core.stats().observedFrame)throw Error('Spatial constructor observation/order');if(!Number.isFinite(a.depth)||a.depth<0||a.depth>(resource.wave===6?.5:.8)||!Number.isFinite(a.tau)||a.tau<0||a.tau>480||typeof a.property!=='boolean'||!validInt(m.observedFrame,0,1099511627648)||m.observedFrame%128)throw Error('Invalid atomic constructor settings');count=core.createRecipe(resource.wave,{birth:a.birth,mode:a.mode,period:resource.recipe.periodBefore,offset:resource.recipe.offset,shape:a.shape});core.command(1,resource.wave,0,a.birth,a.tau,[a.mode,resource.recipe.periodAfter,a.depth,Number(a.property),0,0],m.observedFrame);}
    else if(a.kind==='activate')count=core.activateWalk(resource.wave,{birth:a.birth,period:resource.recipe.periodAfter,depth:a.depth,tau:a.tau,property:a.property,observedFrame:m.observedFrame});
    else if(a.kind==='refill'){if(resource.walk?.kind!=='refill'||resource.phase)throw Error('Spatial refill resource kind');core.refill(resource.wave,m.observedFrame);count=resource.walk.maxCount;}
    else throw Error('Unknown spatial publication');r.receiver.finish(m.id,m.generation);r.port.postMessage({type:'installed',id:m.id,generation:m.generation,count,birth:a.kind==='refill'?a.birth:a.birth});result={count,core:core.stats()};break;}
   case'activity':if(!s.node)throw Error('Unattached spatial renderer');{const a=m.activity;for(const[k,max]of[['sourceAudio',524287],['sourceParameters',524287],['layerAudio',63],['layerParameters',63],['filterAudio',262143],['filterParameters',262143],['bed',2]])if(!validInt(a?.[k],0,max))throw Error('Invalid typed spatial activity');if(a.sourceAudio&~a.sourceParameters||a.layerAudio&~a.layerParameters||a.filterAudio&~a.filterParameters)throw Error('Spatial audio activity requires parameter demand');s.node.activity=a;}break;
   default:throw Error('Unknown spatial context control');}}
 if(m.request!==undefined)this.port.postMessage({kind:'result',request:m.request,result});
 }catch(error){const slot=this.registry?.slots?.[m.slot];let core=null;try{if(slot?.core&&slot.leased)core=slot.core.stats();}catch{}this.port.postMessage({kind:'rejected',request:m.request,id:m.id,error:error.message,diagnostics:{kind:m.kind,slot:m.slot,generation:m.generation,op:m.op,target:m.target,layer:m.layer,observedFrame:m.observedFrame,at:m.at,tau:m.tau,args:Array.isArray(m.args)?m.args.slice(0,6):null,action:m.action?{kind:m.action.kind,birth:m.action.birth,mode:m.action.mode,depth:m.action.depth,tau:m.action.tau,shape:Array.isArray(m.action.shape)?m.action.shape.slice(0,5):null}:null,core}});}}
 process(_inputs,outputs){for(const o of outputs)for(const c of o)c.fill(0);if(this.disposed)return false;if(!this.registry)return false;try{this.clock.calls++;if(this.clock.calls===1)this.port.postMessage({kind:'hot'});this.registry.receiver.callback();return true;}catch(error){this.port.postMessage({kind:'error',error:error.message});return false;}}
}
class SpatialBed extends AudioWorkletProcessor{
 constructor({processorOptions:p}){super();this.registry=registries.get(p.pool);this.slot=p.slot;this.generation=p.generation;this.pooled=p.cold===true;this.clock=new HostRenderClock();this.activity={sourceAudio:0,sourceParameters:0,layerAudio:0,layerParameters:0,filterAudio:0,filterParameters:0,bed:0};this.failed=false;const s=this.registry?.slots[this.slot];if(!s||s.node||(this.pooled?(s.leased||currentFrame!==0||p.generation!==0):(!s.leased||s.generation!==this.generation))){this.failed=true;this.port.postMessage({kind:'error',error:'Invalid prepared spatial renderer lease'});}else{this.clock.renderFrame=s.core.stats().frame-128;s.node=this;this.port.postMessage({kind:'ready'});}}
 process(inputs,outputs){for(const o of outputs)for(const c of o)c.fill(0);const s=this.registry?.slots[this.slot];if(this.registry?.closed)return false;if(!s?.leased||s.generation!==this.generation)return this.pooled;if(this.failed)return this.pooled;try{const frame=this.clock.next(currentFrame),core=s.core;core.sync(frame);for(let i=0;i<19;i++)for(let ch=0;ch<2;ch++){const input=inputs[i]?.[ch];if(input){if(input.length!==128)throw Error('Spatial input quantum');core.input[i][ch].set(input);}else core.input[i][ch].fill(0);}core.render(this.activity);if(outputs.length!==7)throw Error('Spatial requires seven stereo outputs');for(let bus=0;bus<7;bus++)for(let ch=0;ch<2;ch++){if(outputs[bus][ch]?.length!==128)throw Error('Spatial output quantum');outputs[bus][ch].set(core.output[bus][ch]);}return true;}catch(error){this.failed=true;this.port.postMessage({kind:'error',error:error.message,clock:this.clock.snapshot(),core:s.core.stats()});return this.pooled;}}
}
registerProcessor('owned-ambience-spatial-topology-clock',SpatialPoolClock);
registerProcessor('owned-ambience-spatial-topology-bed',SpatialBed);

})();
