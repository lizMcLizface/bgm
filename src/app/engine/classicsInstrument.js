import {startLiveSynth,loadKernel,loadClassicsWorklet} from '../../synths/engine/liveSynth';
import {createRack} from '../../synths/effects/graph';
import {SYNTHS} from '../../synths/models';
import {builtinWaves} from '../../synths/vs/waves';
import {packWaves,DEFAULT_WAVES} from '../../synths/wt/waves';
// the waves a synth plays with: the vector synth's own, the wavetable synth's four (a patch brings them), else none
const wavesOf=(synth,spec)=>synth.id==='vs'?builtinWaves():synth.id==='wt'?packWaves(spec.waves??DEFAULT_WAVES):null;
import {rackPackets} from '../../synths/effects/params';
import {effectTail} from '../../synth-lab/effectsConfig';
import {insertsTail} from '../../synth-lab/insertsConfig';
import {KITS} from '../../synths/drums/kits';
import {DRUMS} from '../percussion';
import {DRUM_TRACKS} from '../drumMappings';

// Drum machines as the percussion role: each of the generator's drums (percussion.js DRUMS)
// plays one of the machine's pads, which sit at MIDI 36 + track (drums.rs note_on).
const drumNotes=id=>DRUM_TRACKS[id]&&DRUMS.map(name=>36+KITS[id].tracks.findIndex(([key])=>key===DRUM_TRACKS[id][name]));
// Monophonic synths play chord parts as a stack of single-voice kernels, one per held note;
// single lines keep one kernel, with its own legato and glide.
const MONO=new Set(['minimoog']);

/** The generator's instrument contract, on its own clock and role output. */
export default class ClassicsInstrument {
 static async create({context,preset,polyphony=8,sourceNodeFactory,rackPluginFactory}){
  const inst=new ClassicsInstrument(context,preset,polyphony),synth=SYNTHS[preset.classics.synth];
  inst.sourceNodeFactory=sourceNodeFactory;
  try{
   if(Number.isFinite(context.length)){
    if(!sourceNodeFactory)[inst.module]=await Promise.all([loadKernel(),loadClassicsWorklet(context)]);inst.offlineEvents=[];
    inst.outboard=await createRack(context,preset.classics.rack,{pluginFactory:rackPluginFactory,onError:error=>{inst.error=error;}});inst.outboard.connect(inst.output);inst.output.gain.value=preset.masterVolume??1;return inst;
   }
   const start=()=>startLiveSynth({context,sourceNodeFactory,rackPluginFactory,destination:inst.output,model:synth.model,polyphony,params:inst.pairs(preset.classics.values),waves:wavesOf(synth,preset.classics),rack:preset.classics.rack,onStats:s=>{inst.stats=s;},onError:error=>{inst.error=error;}});
   const preparations=Array.from({length:MONO.has(synth.id)&&polyphony>2?Math.min(polyphony,preset.classics.light?2:4):1},start);
   if(sourceNodeFactory){const results=await Promise.allSettled(preparations);inst.lives=results.filter(r=>r.status==='fulfilled').map(r=>r.value);const failure=results.find(r=>r.status==='rejected');if(failure){await Promise.all(inst.lives.map(l=>l.close()));inst.lives=[];throw failure.reason;}}else inst.lives=await Promise.all(preparations);inst.live=inst.lives[0];inst.freeAt=inst.lives.map(()=>0);
   inst.output.gain.value=preset.masterVolume??1;
   return inst;
  }catch(error){inst.dispose();throw error;}
 }
 constructor(context,preset,polyphony){this.AC=context;this.preset={gainRelease:.5,...preset};this.polyphony=polyphony;this.output=context.createGain();this.nextId=1;this.reverb={settled:true,hear(){}};this.drums=drumNotes(preset.classics.synth);this.kit=null;this.held=new Map();this.disposed=false;this.sourceInputs=0;}
 pairs(values){const synth=SYNTHS[this.preset.classics.synth],effective={...values};if('voices'in effective)effective.voices=Math.min(effective.voices,this.polyphony);if(this.preset.classics.light&&'oversample'in effective)effective.oversample=0;return (this.preset.classics.moved?synth.params.toEnginePairs??synth.params.toPairs:synth.params.toPairs)(effective);}
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
  if(this.disposed)throw Error('Classic instrument is disposed');
  if(!this.offlineEvents||this.offlineNode)return this.offlinePreparation;
  if(this.offlinePreparation)return this.offlinePreparation;
  const synth=SYNTHS[this.preset.classics.synth],options={model:synth.model,params:this.pairs(this.preset.classics.values),polyphony:this.polyphony,waves:wavesOf(synth,this.preset.classics),events:this.offlineEvents.map(e=>e.slice()).sort((a,b)=>a[4]-b[4])};
  const publish=node=>{if(this.disposed)throw Error('Classic instrument disposed during offline source preparation');this.offlineNode=node;node.port.onmessage=({data})=>{node.handleOwnedMessage?.(data);if(data.type==='error')this.error=Error(data.message);};node.connect(this.outboard.input);};
  // Preserve the existing one-kernel offline policy, including Mercury D.
  if(!this.sourceNodeFactory){publish(new AudioWorkletNode(this.AC,'calmbgm-classics',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module:this.module,...options}}));return;}
  this.offlinePreparation=(async()=>{let node;try{node=await this.sourceNodeFactory(this.AC,options);if(!node?.ready)throw Error('Owned classic offline source must expose ready');await node.ready;publish(node);}catch(error){this.error=error;if(node){await node.disposeOwned?.();node.disconnect();}throw error;}})();return this.offlinePreparation;
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
 /** One of the machine's own tracks by key (bd, mt, cl, ...), for the step sequencer; `drum` is the nearest generator drum, for its level. */
 hitTrack(key,drum,start,velocity,params={}){
  const index=KITS[this.preset.classics.synth]?.tracks.findIndex(([k])=>k===key);
  if(!this.drums||index===undefined||index<0)return this.hit(drum,start,velocity);
  const pad=this.kit?.[DRUMS[drum]];if(pad?.on===false)return null;
  const id=this.nextId++,note=36+index,v=Math.min(1,velocity*(pad?.level??1));
  for(const [name,field] of [['accent',1],['tune',2],['decay',3]])if(Number.isFinite(params[name])&&params[name]!==0)this.pressure(index*4+field,params[name],start);
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
 effectsAwake(){return this.sourceInputs>0||(this.stats?.peak??0)>0;}
 /** Native composite output, before this kernel's existing external rack. */
 captureSource(){if(this.disposed||this.error||this.offlineEvents||this.lives?.length!==1||!this.live?.captureSource)throw Error('Select a ready single-kernel classic source');return this.live.captureSource();}
 captureSources(){if(this.disposed||this.error||this.offlineEvents||!this.lives?.length||this.lives.some(l=>!l?.captureSource||!l.sourceInput))throw Error('Select a ready classic source stack');return this.lives.map(l=>l.captureSource());}
 holdSourceInputs(){this.captureSources();if(this.held.size)throw Error('Release the classic keyboard before previewing');const releases=[];try{for(const l of this.lives)releases.push(l.holdSourceInput());}catch(error){for(const release of releases)release();throw error;}this.sourceInputs++;let done=false;return ()=>{if(done)return;done=true;this.sourceInputs--;for(const release of releases)release();};}
 holdSourceInput(){this.captureSource();if(this.held.size)throw Error('Release the classic keyboard before previewing');const release=this.live.holdSourceInput();this.sourceInputs++;let done=false;return ()=>{if(done)return;done=true;this.sourceInputs--;release();};}
 activeEffects(){return ['Instrument rack'];}
 dispose(){if(this.disposed)return;this.disposed=true;for(const l of this.lives??[this.live])l?.close();if(this.offlineNode?.disposeOwned)this.offlineNode.disposeOwned();else this.offlineNode?.port.close();this.offlineNode?.disconnect();this.outboard?.dispose();this.output.disconnect();}
}
