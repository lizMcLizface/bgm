import DEFAULTS from './presetDefaults';
import {translatedWasmVoice,needsNativeSource} from './wasmPreset';
import {LabVoice} from '../../labs/voice';
import {effectTail} from '../../synth-lab/effectsConfig';
import {nativeWasmVoice} from '../../synth-lab/voiceLibrary';
import {FX_KEYS,fxTail} from './voiceFx';

// Keep the generator's Instrument contract, including native physical sources.
export default class WasmInstrument {
 static async create({context,preset={},polyphony=8,notes=[],spec=null,roomPool=null,dynamics=null}){
  const i=new WasmInstrument(context,preset,polyphony);i.overrideSpec=spec;i.roomPool=roomPool;i.dynamics=dynamics;
  try{i.voice=await LabVoice.create(context,i.spec(),{notes,roomPool,onError:e=>{i.error=e;console.error('Wasm voice failed',e);}});i.attachVoice(i.voice);i.reverb=i.voice.native?.reverb??i.reverb;i.preScheduled=Number.isFinite(context.length);return i;}
  catch(e){i.dispose();throw e;}
 }
 constructor(context,preset,polyphony){this.AC=context;this.polyphony=polyphony;this.preset={...DEFAULTS,...preset};this.output=context.createGain();this.roomOutput=context.createGain();this.roomInput=context.createGain();this.ready=Promise.resolve();this.revision=0;this.disposed=false;this.reverb={settled:true,hear(){},setLevel(){}};this.held=new Map();this.nextId=1;this.syncEnvelope();}
 spec(){return this.overrideSpec??nativeWasmVoice(this.preset,this.polyphony)??(needsNativeSource(this.preset)?{kind:'legacy',patch:this.preset,polyphony:this.polyphony}:{...translatedWasmVoice(this.preset,this.polyphony,this.dynamics),fx:this.preset});}
 /** Timbre drift (composition/timbreDrift.js): the source patched live from the preset and these values, the preset unchanged. */
 setDrift(values,seconds=.5){if(!this.voice||this.loading)return;const spec=this.spec();if(spec.kind==='legacy'){this.voice.native?.setDrift?.(values);return;}if(this.overrideSpec||spec.kind!=='subtractive'||this.preset.wasmVoice)return;const drifted=values?translatedWasmVoice({...this.preset,...values},this.polyphony,this.dynamics):spec;if(drifted.kind!==spec.kind||JSON.stringify([drifted.patch.effects,drifted.patch.inserts])!==JSON.stringify([spec.patch.effects,spec.patch.inserts]))return;this.voice.patchSource(drifted.patch,{seconds});}
 /** The scene's dynamics (settings.dynamics): part of the translated patch, so a change rebuilds the voice. */
 setDynamics(dynamics){const before=JSON.stringify(this.spec());this.dynamics=dynamics;if(this.voice&&JSON.stringify(this.spec())!==before)this.applyPreset(this.preset,this.overrideSpec);}
 syncEnvelope(){this.gainEnv={attack:this.preset.gainAttack,decay:this.preset.gainDecay,sustain:this.preset.gainSustain,release:this.preset.gainRelease};}
 attachVoice(voice){voice.connect(this.output);this.roomInput.disconnect();if(voice.roomOutput)voice.roomOutput.connect(this.roomOutput);if(voice.sharedRoomInput)this.roomInput.connect(voice.sharedRoomInput);}
 connect(node){this.output.connect(node);}
 applyPreset(preset,override=null){
  const previous=this.preset;this.preset={...DEFAULTS,...preset};this.overrideSpec=override;this.syncEnvelope();const revision=++this.revision,spec=this.spec();
  this.loading=true;this.error=null;
  this.ready=LabVoice.create(this.AC,spec,{roomPool:this.roomPool,onError:error=>{this.error=error;console.error('Wasm voice failed',error);}}).then(voice=>{
   if(this.disposed||revision!==this.revision){voice.dispose();return;}
   const old=this.voice;this.attachVoice(voice);this.voice=voice;this.reverb=voice.native?.reverb??{settled:true,hear(){},setLevel(){}};old?.dispose();for(const [id,note]of this.held)if(note.voice)this.held.delete(id);this.loading=false;if(this.wander)this.setWander(this.wander);
  }).catch(error=>{if(revision===this.revision){this.loading=false;this.preset=previous;this.syncEnvelope();this.error=error;}console.error('Could not change Wasm voice',error);});
 }
 morphTo(preset){this.applyPreset(preset);}
 set(key,value){
  const before=this.spec();this.preset={...this.preset,[key]:value};this.syncEnvelope();const after=this.spec();
  if(!this.loading&&before.kind===after.kind&&this.voice){
   if(after.kind==='legacy'){this.voice.patch={...this.preset};this.voice.native.set(key,value);return;}
   // tape, tremolo, compressor, shimmer, freeze: set on the voice's VoiceFx as they are
   if(FX_KEYS.has(key)&&this.voice.fx){this.voice.fx.set(this.preset);this.voice.spec.fx=this.preset;return;}
   if(JSON.stringify([before.patch.effects,before.patch.inserts])===JSON.stringify([after.patch.effects,after.patch.inserts])){this.voice.patch=structuredClone(after.patch);this.voice.patchSource(after.patch,{seconds:.06});return;}
   // An insert edit (phaser, EQ, ...) on a voice that already has its inserts: patched in place, so a drag neither cuts notes nor tails.
   if(this.voice.insert&&JSON.stringify(before.patch.effects)===JSON.stringify(after.patch.effects)){this.voice.patch=structuredClone(after.patch);this.voice.insert.patch(after.patch.inserts);this.voice.patchSource(after.patch,{seconds:.06});return;}
  }
  // Coalesce editor drags without reallocating a graph per pointer event.
  clearTimeout(this.editTimer);this.ready=new Promise(resolve=>{this.editResolve?.();this.editResolve=resolve;this.editTimer=setTimeout(()=>{this.editResolve=null;this.applyPreset(this.preset);this.ready.then(resolve);},70);});
 }
 /** A new spec (a DIY patch's edits): patched in place, or rebuilt (coalesced) when its effects change. */
 setSpec(spec){
  const before=this.spec();
  if(!this.loading&&this.voice&&before.kind===spec.kind&&JSON.stringify([before.patch.effects,before.patch.inserts])===JSON.stringify([spec.patch.effects,spec.patch.inserts])){this.overrideSpec=spec;this.voice.patch=structuredClone(spec.patch);this.voice.patchSource(spec.patch,{seconds:.06});return;}
  this.overrideSpec=spec;clearTimeout(this.editTimer);this.ready=new Promise(resolve=>{this.editResolve?.();this.editResolve=resolve;this.editTimer=setTimeout(()=>{this.editResolve=null;this.applyPreset(this.preset,this.overrideSpec);this.ready.then(resolve);},70);});
 }
 async afterReady(action){let pending;do{pending=this.ready;await pending;}while(!this.disposed&&pending!==this.ready);if(!this.disposed)action();}
 scheduleNote(midi,time,duration,velocity=.7,detune=0,expression){const until=time+duration,epoch=this.epoch??0;void this.afterReady(()=>{if(epoch!==(this.epoch??0)||until<=this.AC.currentTime)return;const start=Math.max(time,this.AC.currentTime+.003);this.voice.schedule(midi,start,Math.max(.005,until-start),velocity,detune,expression);});}
 startNote(midi,velocity){const id=this.nextId++,record={voice:null,note:null};this.held.set(id,record);void this.afterReady(()=>{if(this.held.get(id)===record){record.voice=this.voice;record.note=this.voice.on(midi,velocity);}});return id;}
 stopNote(id){const record=this.held.get(id);record?.voice?.off(record.note);this.held.delete(id);}
 silence(){this.epoch=(this.epoch??0)+1;this.held.clear();this.voice?.panic();}
 flushTails(){this.voice?.panic();}
 tailSeconds(){const p=this.spec();return Math.min(30,p.kind==='legacy'?this.voice?.native?.tailSeconds()??1:fxTail(p.fx)+effectTail({...p.patch.effects,...(p.patch.routing?.room==='private'&&Number.isFinite(p.patch.routing.roomDecay)?{decay:p.patch.routing.roomDecay}:{})}));}
 setWander(value){
  this.wander=value;if(!this.voice)return;if(this.voice.native){this.voice.native.setWander(value);return;}
  // Pan/level wander stays native. Pitch/filter use the new source's slow
  // modulation; old oscillator phases and Brownian paths are approximated.
  const p=structuredClone(this.voice.patch),period=value.periods?.pitch??60;
  if(this.voice.spec.kind==='fm'){p.global.wanderCents=Math.min(20,value.pitch);p.global.wanderRate=Math.max(.01,1/period);}
  else for(const l of p.layers){l.wanderCents=Math.min(20,value.pitch);l.wanderRate=Math.max(.01,1/period);if(value.filter){l.lfo2Filter+=value.filter/1200;l.lfo2Rate=Math.max(.01,1/(value.periods?.filter??60));}}
  this.voice.patchSource(p,{seconds:.3});
 }
 activeEffects(){return this.voice?.native?.activeEffects()??['Wasm source','Instrument delay','FDN room'];}
 effectsAwake(){return !this.disposed;}
 awakeVoices(){return this.voice?.native?.awakeVoices()??this.voice?.stats?.active??this.voice?.keys.size??0;}
 dispose(){if(this.disposed)return;this.disposed=true;this.revision++;clearTimeout(this.editTimer);this.editResolve?.();this.silence();this.voice?.dispose();this.output.disconnect();this.roomOutput.disconnect();this.roomInput.disconnect();}
}
