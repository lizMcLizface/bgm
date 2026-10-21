import {startLiveSynth,loadKernel,loadClassicsWorklet} from '../../synths/engine/liveSynth';
import {createRack} from '../../synths/effects/graph';
import {SYNTHS} from '../../synths/models';
import {builtinWaves} from '../../synths/vs/waves';
import {rackPackets} from '../../synths/effects/params';
import {effectTail} from '../../synth-lab/effectsConfig';
import {insertsTail} from '../../synth-lab/insertsConfig';
import {KITS} from '../../synths/drums/kits';
import {DRUMS} from '../percussion';

// Drum machines as the percussion role: each of the generator's drums (percussion.js DRUMS)
// plays one of the machine's pads, which sit at MIDI 36 + track (drums.rs note_on).
const DRUM_TRACKS={
 tr808:{kick:'bd',punch:'bd',brush:'sd',snare:'sd',shaker:'ma',rim:'rs',hat:'ch',sizzle:'ch',swish:'oh',tom:'lt',clap:'cp',ride:'cy',crash:'cy',bell:'cb'},
 tr909:{kick:'bd',punch:'bd',brush:'sd',snare:'sd',shaker:'ch',rim:'rs',hat:'ch',sizzle:'ch',swish:'oh',tom:'lt',clap:'cp',ride:'rd',crash:'cr',bell:'rd'},
};
const drumNotes=id=>DRUM_TRACKS[id]&&DRUMS.map(name=>36+KITS[id].tracks.findIndex(([key])=>key===DRUM_TRACKS[id][name]));
// Monophonic synths play chord parts as a stack of single-voice kernels, one per held note;
// single lines keep one kernel, with its own legato and glide.
const MONO=new Set(['minimoog']);

/** The generator's instrument contract, on its own clock and role output. */
export default class ClassicsInstrument {
 static async create({context,preset,polyphony=8}){
  const inst=new ClassicsInstrument(context,preset,polyphony),synth=SYNTHS[preset.classics.synth];
  try{
   if(Number.isFinite(context.length)){
    [inst.module]=await Promise.all([loadKernel(),loadClassicsWorklet(context)]);inst.offlineEvents=[];
    inst.outboard=await createRack(context,preset.classics.rack,{onError:error=>{inst.error=error;}});inst.outboard.connect(inst.output);inst.output.gain.value=preset.masterVolume??1;return inst;
   }
   const start=()=>startLiveSynth({context,destination:inst.output,model:synth.model,polyphony,params:inst.pairs(preset.classics.values),waves:synth.id==='vs'?builtinWaves():null,rack:preset.classics.rack,onStats:s=>{inst.stats=s;},onError:error=>{inst.error=error;}});
   inst.lives=await Promise.all(Array.from({length:MONO.has(synth.id)&&polyphony>2?Math.min(polyphony,preset.classics.light?2:4):1},start));inst.live=inst.lives[0];inst.freeAt=inst.lives.map(()=>0);
   inst.output.gain.value=preset.masterVolume??1;
   return inst;
  }catch(error){inst.dispose();throw error;}
 }
 constructor(context,preset,polyphony){this.AC=context;this.preset={gainRelease:.5,...preset};this.polyphony=polyphony;this.output=context.createGain();this.nextId=1;this.reverb={settled:true,hear(){}};this.drums=drumNotes(preset.classics.synth);this.kit=null;this.held=new Map();}
 pairs(values){const synth=SYNTHS[this.preset.classics.synth],effective={...values};if('voices'in effective)effective.voices=Math.min(effective.voices,this.polyphony);if(this.preset.classics.light&&'oversample'in effective)effective.oversample=0;return synth.params.toPairs(effective);}
 connect(node){this.output.connect(node);}
 /** The kernel for a note from `start` to `end`: the first that is free by then, else the one freed soonest. */
 voiceFor(start,end){
  if(!this.lives||this.lives.length===1)return this.live;
  let pick=this.freeAt.findIndex(t=>t<=start);if(pick<0)pick=this.freeAt.indexOf(Math.min(...this.freeAt));
  this.freeAt[pick]=end;return this.lives[pick];
 }
 scheduleNote(midi,start,duration,velocity=.7,detune=0,expression){
  if(this.drums)return this.hit(midi,start,velocity);
  const id=this.nextId++,end=start+duration*(expression?.gateScale??1);
  const note=Math.max(0,Math.min(127,midi+detune/100+(expression?.bend??0)));
  if(this.offlineEvents)this.offlineEvents.push([0,id,note,velocity,start],[1,id,0,0,end]);
  else{const live=this.voiceFor(start,end);live.noteOn(id,note,velocity,start);live.noteOff(id,end);if(Number.isFinite(expression?.pressure))live.pressure(id,expression.pressure,start);return id;}
  if(Number.isFinite(expression?.pressure))this.pressure(id,expression.pressure,start);
  return id;
 }
 prepareOffline(){
  if(!this.offlineEvents||this.offlineNode)return;
  const synth=SYNTHS[this.preset.classics.synth];
  this.offlineNode=new AudioWorkletNode(this.AC,'calmbgm-classics',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module:this.module,model:synth.model,params:this.pairs(this.preset.classics.values),polyphony:this.polyphony,waves:synth.id==='vs'?builtinWaves():null,events:this.offlineEvents.sort((a,b)=>a[4]-b[4])}});
  this.offlineNode.port.onmessage=({data})=>{if(data.type==='error')this.error=Error(data.message);};this.offlineNode.connect(this.outboard.input);
 }
 /** One drum: its pad, at the kit's level for that drum (settings.drumKit), or nothing when it is off. */
 hit(drum,start,velocity){
  const pad=this.kit?.[DRUMS[drum]],note=this.drums[drum];
  if(note===undefined||note<36||pad?.on===false)return null;
  const id=this.nextId++,v=Math.min(1,velocity*(pad?.level??1));
  if(this.offlineEvents)this.offlineEvents.push([0,id,note,v,start],[1,id,0,0,start+.05]);
  else{this.live.noteOn(id,note,v,start);this.live.noteOff(id,start+.05);}
  return id;
 }
 setKit(kit){this.kit=kit;}
 setVoicePreset(){}
 futureBookings(){return [];}
 startNote(midi,velocity=.7){const id=this.nextId++,live=this.voiceFor(this.AC.currentTime,Infinity);this.held.set(id,live);live.noteOn(id,midi,velocity);return id;}
 stopNote(id){const live=this.held.get(id)??this.live;this.held.delete(id);live.noteOff(id);if(this.lives?.length>1)this.freeAt[this.lives.indexOf(live)]=this.AC.currentTime;}
 pressure(id,value,time){if(this.offlineEvents)this.offlineEvents.push([2,id,value,0,time]);else (this.held.get(id)??this.live).pressure(id,value,time);}
 setValues(values){const synth=SYNTHS[this.preset.classics.synth];const clean=synth.params.sanitize(values);this.preset={...this.preset,classics:{...this.preset.classics,values:clean}};for(const l of this.lives??[this.live])l.setParams(this.pairs(clean));}
 setRack(rack){this.preset={...this.preset,classics:{...this.preset.classics,rack}};for(const l of this.lives??[this.live])l.setRack(rack);}
 silence(){for(const l of this.lives??[this.live])l?.panic();this.held.clear();this.freeAt?.fill(0);}
 stopAll(){this.silence();}
 flushTails(){this.silence();}
 tailSeconds(){const {effects,inserts}=rackPackets(this.preset.classics.rack);return Math.max(this.preset.classics.values.reverbDecay??0,effectTail(effects)+insertsTail(inserts));}
 awakeVoices(){return this.stats?.active??0;}
 effectsAwake(){return (this.stats?.peak??0)>0;}
 activeEffects(){return ['Instrument rack'];}
 dispose(){for(const l of this.lives??[this.live])l?.close();this.offlineNode?.disconnect();this.offlineNode?.port.close();this.outboard?.dispose();this.output.disconnect();}
}
