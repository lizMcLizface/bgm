import {ProceduralBackend} from '../synth-lab/proceduralBackend';
import {noteEvents} from './noteEvents';

// The same prepared piano/string sources used by the source comparisons,
// with cancellable, serialized first-note preparation for live piano input.
export class PreparedSource {
 static async create(context,patch,{notes=[],...options}={}){
  const source=new PreparedSource(context,await ProceduralBackend.create(context,patch,options),options.onError);
  try{if(notes.length){await source.backend.prepare(notes);source.backend.events(noteEvents(notes,context.sampleRate));}return source;}catch(e){source.dispose();throw e;}
 }
 constructor(context,backend,onError=()=>{}){
  this.context=context;this.backend=backend;this.onError=onError;this.serial=Promise.resolve();this.pending=new Map();this.epoch=0;this.nextId=1000000;this.disposed=false;
  this.node=context.createBiquadFilter();this.node.type='lowpass';this.node.frequency.value=18000;this.node.Q.value=.707;backend.node.connect(this.node);
  this.bend=context.createConstantSource();this.bend.offset.value=0;this.bend.start();this.lfo=context.createOscillator();this.lfo.frequency.value=5;this.depth=context.createGain();this.depth.gain.value=0;this.lfo.connect(this.depth);this.lfo.start();
  const start=backend.start.bind(backend);backend.start=(...args)=>{start(...args);for(const item of backend.ids.get(args[0]).sources){this.bend.connect(item.source.detune);this.depth.connect(item.source.detune);const ended=item.source.onended;item.source.onended=()=>{this.bend.disconnect(item.source.detune);this.depth.disconnect(item.source.detune);ended?.();};}};
 }
 queue(work){const epoch=this.epoch;this.serial=this.serial.catch(()=>{}).then(async()=>{if(this.disposed||epoch!==this.epoch)return;await work(()=>!this.disposed&&epoch===this.epoch);}).catch(e=>{if(!this.disposed&&epoch===this.epoch)this.onError(e);});return this.serial;}
 async prepare(notes){
  // Sources already scheduled retain their AudioBuffer references. Clearing
  // the live preparation map does not interrupt them; the global LRU is bounded.
  if(this.backend.stats().preparedBytes>20*1024*1024)this.backend.buffers.clear();
  await this.backend.prepare(notes);
 }
 on(midi,velocity){const id=this.nextId++;this.pending.set(id,true);void this.queue(async alive=>{await this.prepare([{midi,velocity}]);if(!alive()||!this.pending.has(id))return;this.pending.delete(id);this.backend.events([[0,id,Math.round((this.context.currentTime+.005)*this.context.sampleRate),midi,velocity]]);});return id;}
 off(id){if(this.pending.delete(id))return;this.backend.off(id);}
 events(events){const notes=events.filter(e=>e[0]===0).map(e=>({midi:e[3],velocity:e[4]}));void this.queue(async alive=>{await this.prepare(notes);if(!alive())return;const rate=this.context.sampleRate,now=Math.round((this.context.currentTime+.005)*rate),ends=new Map(events.filter(e=>e[0]===1).map(e=>[e[1],e[2]])),live=events.filter(e=>!ends.has(e[1])||ends.get(e[1])>now),shifts=new Map(live.filter(e=>e[0]===0).map(e=>[e[1],Math.max(0,now-e[2])]));this.backend.events(live.map(e=>[e[0],e[1],e[2]+(shifts.get(e[1])??0),...e.slice(3)]));});}
 patch(p){this.backend.patch(p);}
 controls({brightness=0,bend=0,motion=0}={}){const t=this.context.currentTime;this.node.frequency.setTargetAtTime(Math.min(20000,18000*2**(brightness*3)),t,.025);this.bend.offset.setTargetAtTime(bend*100,t,.025);this.depth.gain.setTargetAtTime(motion*12,t,.025);}
 panic(){this.epoch++;this.pending.clear();this.backend.panic();}
 dispose(){if(this.disposed)return;this.disposed=true;this.epoch++;this.pending.clear();this.backend.dispose();this.bend.stop();this.bend.disconnect();this.lfo.stop();this.lfo.disconnect();this.depth.disconnect();this.node.disconnect();}
}
