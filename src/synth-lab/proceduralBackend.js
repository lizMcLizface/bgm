import DrumKit from '../app/engine/drumKit';
import {cachedNoteBuffer,findNoteBuffer,noteCacheStats} from '../app/engine/noteBufferCache';
import {sanitizeProcedural} from './proceduralPatch';
import {bufferDescriptors,midiHz} from './proceduralBuffers';

const workerFactory=()=>new Worker(new URL('./procedural.worker.js',import.meta.url),{type:'module'});
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const key=d=>JSON.stringify(d.key),MAX_PREPARED=32*1024*1024;
/** Native buffer playback / native drums with the same source/effects boundary.
 * Only preparation runs in a Worker; note starts follow the AudioContext clock. */
export class ProceduralBackend {
 static async create(context,patch,options={}){return new ProceduralBackend(context,patch,options);}
 constructor(context,patch,{offline=false,onStats=()=>{},onError=()=>{},build=null}={}){
  this.context=context;this.settings=sanitizeProcedural(patch);this.kind='procedural';this.node=context.createGain();this.node.gain.value=this.settings.global.gain;this.offline=offline;this.onStats=onStats;this.onError=onError;this.build=build;this.buffers=new Map();this.records=new Set();this.ids=new Map();this.slots=[];this.nextId=1;this.pedal=false;this.disposed=false;this.steals=0;this.late=0;this.dropped=0;
  if(this.settings.family==='drums'){this.kit=new DrumKit({context,externalEffects:true});this.kit.scheduleSleep=()=>{};this.kit.setKit(this.settings.kit);this.kit.connect(this.node);}
  if(!offline)this.timer=setInterval(()=>this.onStats(this.stats()),1000);
 }
 async prepare(notes,{signal,onProgress=()=>{}}={}){
  if(this.disposed||signal?.aborted)throw Error('Source preparation cancelled.');
  const specs=new Map();for(const note of notes)for(const d of bufferDescriptors(this.settings,note,this.context.sampleRate))specs.set(key(d),d);
  if(specs.size>128)throw Error('Prepare shorter passages (maximum 128 distinct buffers).');
  let worker,pending;
  const cancel=()=>{worker?.terminate();pending?.(Error('Source preparation cancelled.'));pending=null;};this.cancelPreparation=cancel;signal?.addEventListener('abort',cancel,{once:true});
  try{for(const [id,d]of specs){if(this.disposed||signal?.aborted)throw Error('Source preparation cancelled.');let buffer=this.buffers.get(id)??findNoteBuffer(this.context,d.key);
   if(!buffer){onProgress('Preparing '+this.settings.name+'…');let samples;
    if(this.build)samples=await this.build(d);else{worker??=workerFactory();samples=await new Promise((resolve,reject)=>{pending=reject;worker.onmessage=({data})=>{pending=null;data.error?reject(Error(data.error)):resolve(data.samples);};worker.onerror=e=>{pending=null;reject(Error(e.message||'Procedural preparation failed.'));};worker.postMessage(d);});}
    if(this.disposed||signal?.aborted)throw Error('Source preparation cancelled.');buffer=cachedNoteBuffer(this.context,d.key,()=>samples);
   }
   if(!this.buffers.has(id)){const bytes=[...this.buffers.values()].reduce((s,b)=>s+b.length*4,0);if(bytes+buffer.length*4>MAX_PREPARED)throw Error('Prepared passage exceeds 32 MiB; use a shorter passage or lower sample rate.');this.buffers.set(id,buffer);}
  }}finally{worker?.terminate();signal?.removeEventListener('abort',cancel);this.cancelPreparation=null;}
 }
 connect(destination){this.node.connect(destination);}
 patch(raw){const p=sanitizeProcedural(raw);if(p.family!==this.settings.family)throw Error('Changing source family requires a new source.');this.settings=p;this.node.gain.setTargetAtTime(p.global.gain,this.context.currentTime,.02);this.kit?.setKit(p.kit);}
 stats(){const now=this.context.currentTime;return {active:[...this.records].filter(r=>r.start<=now&&r.end>now).length,steals:this.steals,late:this.late,dropped:this.dropped,preparedBytes:[...this.buffers.values()].reduce((s,b)=>s+b.length*4,0),cache:noteCacheStats(),native:true};}
 events(values){
  if(this.disposed)return;if(values.length>4096){this.dropped+=values.length;throw Error('Native source batch exceeds 4096 events.');}
  const sorted=values.map(e=>e.slice()).sort((a,b)=>a[2]-b[2]);
  // Validate before booking so an unsupported event cannot leave half a batch.
  for(const e of sorted){if(e.length<5||!e.every(Number.isFinite)||![0,1,2,5].includes(e[0])||(this.kit&&[2,5].includes(e[0])))throw Error('Unsupported or invalid prepared-source event.');}
  const ends=new Map(sorted.filter(e=>e[0]===1).map(e=>[e[1],e[2]/this.context.sampleRate]));
  for(const [type,id,frame,a,b]of sorted){let time=frame/this.context.sampleRate;if(time<this.context.currentTime){this.late++;time=this.context.currentTime;}
   if(type===0){if(this.kit)this.hit(id,a,b,time,Math.max(.01,(ends.get(id)??time+.25)-time));else this.start(id,a,b,time);}
   if(type===1&&!this.kit){const r=this.ids.get(id);if(r){if(this.pedal)r.pending=true;else this.release(r,time);}}
   if(type===2){this.pedal=a>=.5;if(!this.pedal)for(const r of this.ids.values())if(r.pending){r.pending=false;this.release(r,time);}}
   if(type===5)this.retune(id,a,b,time);
  }
 }
 start(id,midi,velocity,time){
  if(this.ids.has(id))throw Error('Note IDs must be unique until their sources end.');
  midi=clamp(midi,0,127);velocity=clamp(velocity,0,1);const p=this.settings,descriptors=bufferDescriptors(p,{midi,velocity},this.context.sampleRate),buffers=descriptors.map(d=>this.buffers.get(key(d))??findNoteBuffer(this.context,d.key));if(buffers.some(b=>!b))throw Error('Prepare this note and velocity before scheduling it.');
  let slot=this.slots.findIndex(r=>r.end<=time);if(slot<0&&this.slots.length<p.global.polyphony)slot=this.slots.length;
  if(slot<0){slot=this.slots.reduce((best,r,i)=>r.end<this.slots[best].end?i:best,0);const previous=this.slots[slot];this.release(previous,time,.008);this.ids.delete(previous.id);this.steals++;}
  const amp=this.context.createGain(),pan=this.context.createStereoPanner();pan.pan.value=0;amp.connect(pan);pan.connect(this.node);
  const env=p.envelope,record={id,midi,start:time,end:time+600,velocity,envelope:{...env},amp,pan,sources:[],pitch:[],pending:false,releaseAt:null};amp.gain.setValueAtTime(0,time);amp.gain.linearRampToValueAtTime(velocity,time+env.attack);amp.gain.linearRampToValueAtTime(velocity*env.sustain,time+env.attack+env.decay);
  buffers.forEach((buffer,i)=>{const source=this.context.createBufferSource();source.buffer=buffer;if(i>0){source.loop=true;source.playbackRate.value=midiHz(midi)*buffer.length/this.context.sampleRate;}source.connect(amp);const end=time+(i>0?600:buffer.duration);const item={source,end};record.sources.push(item);source.onended=()=>{source.disconnect();record.sources=record.sources.filter(s=>s!==item);if(!record.sources.length){amp.disconnect();pan.disconnect();this.records.delete(record);if(this.ids.get(id)===record)this.ids.delete(id);}};source.start(time);source.stop(end);});
  record.end=Math.max(...record.sources.map(s=>s.end));this.records.add(record);this.ids.set(id,record);this.slots[slot]=record;
 }
 level(record,time){const age=Math.max(0,time-record.start),e=record.envelope;if(record.releaseAt!==null&&time>=record.releaseAt)return record.releaseLevel*Math.max(0,1-(time-record.releaseAt)/record.releaseSeconds);if(age<e.attack)return record.velocity*age/e.attack;if(age<e.attack+e.decay)return record.velocity*(1-(1-e.sustain)*(age-e.attack)/e.decay);return record.velocity*e.sustain;}
 release(record,time,seconds=record.envelope.release){
  if(time>=record.end||record.releaseAt!==null&&seconds>=record.end-time)return;time=Math.max(time,record.start);const level=this.level(record,time);record.amp.gain.cancelScheduledValues(time);record.amp.gain.linearRampToValueAtTime(level,time);record.amp.gain.linearRampToValueAtTime(0,time+seconds);record.releaseAt=time;record.releaseSeconds=seconds;record.releaseLevel=level;record.end=Math.min(record.end,time+seconds);for(const item of record.sources){const end=Math.min(item.end,record.end);item.source.stop(end);item.end=end;}
 }
 hit(id,midi,velocity,time,duration){const sources=this.kit.scheduleNote(Math.round(midi),time,duration,velocity,0)??[];if(!sources.length)return;const record={id,start:time,end:time+8.1,sources:[...sources]};this.records.add(record);for(const source of sources){const previous=source.onended;source.onended=()=>{previous?.();source.disconnect();record.sources=record.sources.filter(s=>s!==source);if(!record.sources.length)this.records.delete(record);};}}
 retune(id,midi,seconds=.8,time=this.context.currentTime+.025){const r=this.ids.get(id);if(!r)return;const at=Math.max(time,r.start),target=(clamp(midi,0,127)-r.midi)*100,span=clamp(seconds,.002,8);let from=0;for(const e of r.pitch)if(at>=e.time)from=at>=e.time+e.seconds?e.target:e.from+(e.target-e.from)*(at-e.time)/e.seconds;for(const {source}of r.sources){source.detune.cancelScheduledValues(at);source.detune.setValueAtTime(from,at);source.detune.linearRampToValueAtTime(target,at+span);}r.pitch.push({time:at,seconds:span,from,target});}
 on(midi,velocity,time=this.context.currentTime+.025){const id=this.nextId++;this.events([[0,id,Math.round(time*this.context.sampleRate),midi,velocity]]);return id;}
 off(id,time=this.context.currentTime+.01){const r=this.ids.get(id);this.events([[1,id,Math.round(Math.max(time,(r?.start??0)+1/this.context.sampleRate)*this.context.sampleRate),0,0]]);}
 sustain(on){this.events([[2,0,Math.round((this.context.currentTime+.01)*this.context.sampleRate),on?1:0,0]]);}
 panic(){this.pedal=false;const now=this.context.currentTime;for(const r of this.records){if(r.amp){r.amp.gain.cancelScheduledValues(now);r.amp.gain.setValueAtTime(0,now);for(const item of r.sources)item.source.stop(now);}r.end=now;}this.kit?.silence(now);this.ids.clear();this.slots=[];}
 dispose(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.cancelPreparation?.();this.panic();for(const r of this.records){r.amp?.disconnect();r.pan?.disconnect();for(const item of r.sources){const source=item.source??item;source.onended=null;source.disconnect();}}this.records.clear();this.buffers.clear();this.kit?.dispose();this.kit?.bus.disconnect();Object.values(this.kit?.drumOut??{}).forEach(n=>n.disconnect());this.node.disconnect();}
}
