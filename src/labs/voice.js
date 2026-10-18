import Instrument from '../app/engine/Instrument';
import {WasmBackend} from '../synth-lab/backend';
import {FMBackend} from '../synth-lab/fmBackend';
import {createRoutedEffects,createInstrumentEffects,connectEnsembleChannel} from '../synth-lab/routedEffects';
import {createInstrumentInserts} from '../synth-lab/inserts';
import {insertsActive} from '../synth-lab/insertsConfig';
import {cloneFM} from '../synth-lab/fmPatch';
import {clonePatch} from '../synth-lab/patch';
import {noteEvents} from './noteEvents';
import {PreparedSource} from './PreparedSource';
import {preparedPatch} from './preparedPatch';
export {noteEvents} from './noteEvents';
export class LabVoice {
 static async create(context,spec,{notes=[],onError=()=>{}}={}){const v=new LabVoice(context,spec);try{await v.init(notes,onError);return v;}catch(e){v.dispose();throw e;}}
 constructor(context,spec){this.context=context;this.spec=structuredClone(spec);this.patch=structuredClone(spec.patch);this.output=context.createGain();this.output.gain.value=.7;this.nextId=100000;this.keys=new Map();this.released=new Set();this.pedal=false;this.level=1;this.disposed=false;}
 async init(notes,onError){
  const c=this.context;if(this.spec.kind==='legacy'){this.native=new Instrument({context:c,preset:this.patch,polyphony:this.spec.polyphony??12});this.native.connect(this.output);for(const n of notes)this.native.scheduleNote(n.midi,n.time,n.duration,n.velocity,n.detune,n.expression);return;}
  this.patch=this.spec.kind==='fm'?cloneFM(this.patch):this.spec.kind==='procedural'?preparedPatch(this.patch):clonePatch(this.patch);
  const Type=this.spec.kind==='fm'?FMBackend:this.spec.kind==='procedural'?PreparedSource:WasmBackend;this.backend=await Type.create(c,this.patch,{notes,offline:Number.isFinite(c.length),events:noteEvents(notes,c.sampleRate),onStats:s=>{this.stats=s;},onError});
  let source=this.backend.node;
  if(insertsActive(this.patch.inserts)){this.insert=await createInstrumentInserts(c,this.patch.inserts,{onError});source.connect(this.insert.input);source=this.insert.node;}
  this.room=await createRoutedEffects(c,this.patch.effects,{kind:this.patch.effects.reverb===0&&this.patch.effects.delay===0?'dry':'local',onError});if(this.room.echoRoomInput)this.echo=await createInstrumentEffects(c,this.room,{send:this.patch.effects.delay,delayMs:this.patch.effects.delayMs,feedback:this.patch.effects.feedback,tone:this.patch.effects.tone,pingPong:this.patch.effects.pingPong,roomSend:this.patch.effects.delayToReverb});
  this.channel=connectEnsembleChannel(c,source,this.echo??this.room,{gain:1,pan:0,sends:{dry:1,reverb:1,delay:1}});this.room.connect(this.output);
 }
 connect(node){this.output.connect(node);}
 on(midi,velocity=.7){if(this.disposed)return null;const id=this.native?this.native.startNote(midi,velocity):this.backend.on(midi,velocity);this.keys.set(id,midi);return id;}
 off(id){if(!this.keys.has(id))return;if(this.pedal){this.released.add(id);return;}this.release(id);}
 release(id){if(this.native)this.native.stopNote(id);else this.backend?.off(id);this.keys.delete(id);this.released.delete(id);}
 sustain(on){this.pedal=on;if(!on)for(const id of [...this.released])this.release(id);}
 schedule(midi,time,duration,velocity=.7,detune=0,expression=null){if(this.disposed)return;if(this.native){this.native.scheduleNote(midi,time,duration,velocity,detune,expression);return;}const base=this.nextId++;const events=noteEvents([{midi,time,duration,velocity,detune,expression}],this.context.sampleRate).map(e=>[e[0],base,...e.slice(2)]);this.backend.events(events);}
 controls({pressure=0,brightness=0,texture=0,motion=0,bend=0,level=1}={}){
  if(this.disposed)return;this.level=level;this.output.gain.setTargetAtTime(.7*level,this.context.currentTime,.025);
  if(this.native){this.native.set('filterFreq',Math.min(20000,(this.patch.filterFreq||4000)*2**(brightness*2)));this.native.set('vibratoDepth',(this.patch.vibratoDepth||0)+motion*12);return;}
  if(this.spec.kind==='procedural'){this.backend.controls({brightness,bend,motion});this.effectivePatch=structuredClone(this.patch);return;}
  const p=this.spec.kind==='fm'?cloneFM(this.patch):clonePatch(this.patch);p.global.bend=bend;
  if(this.spec.kind==='fm'){p.global.index=Math.min(3,p.global.index*(1+brightness*.7)+texture*.5);p.global.vibrato+=motion*12;p.global.breath=Math.min(1,p.global.breath+texture*.15);p.global.pressure=pressure;for(const o of p.operators)o.pressure=Math.max(.35,o.pressure);}
  else for(const l of p.layers){l.cutoff=Math.min(20000,l.cutoff*2**(brightness*2));l.bow=Math.min(1,l.bow+texture*.3);l.lfoPitch+=motion*12;l.pressureTone=Math.max(.5,l.pressureTone);p.global.pressure=pressure;}
  this.effectivePatch=p;this.backend.patch(p,{seconds:.06});
 }
 panic(){if(this.disposed)return;this.keys.clear();this.released.clear();this.pedal=false;this.native?.silence();this.native?.flushTails();this.backend?.panic();this.room?.clear?.();this.echo?.clear?.();this.insert?.clear?.();}
 dispose(){if(this.disposed)return;this.disposed=true;this.keys.clear();this.released.clear();this.native?.dispose();this.channel?.dispose();this.echo?.dispose();this.room?.dispose();this.insert?.dispose();this.backend?.dispose();this.output.disconnect();}
}
