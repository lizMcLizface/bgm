import {PIANO_TYPES} from '../../modular-audio/pianoCompiler';
export function pianoStemTap(instrument,assertHost=()=>{},{captureTime}={}){
 const voice=instrument?.voice,native=voice?.native??(instrument?.synthMix?instrument:null);
 function current(){
  assertHost();const p=native?.preset,v=native?.voices?.[0],filter=v?.filter;
  if(!native||instrument.disposed||voice?.disposed||native.disposed||instrument.loading||instrument.voice!==voice||p?.stringModel!=='piano'||!PIANO_TYPES.includes(p.pianoType??'felt')||!native.synthMix?.getNode||!filter)throw Error('Select a ready supported piano voice.');
  if(filter.getType()!=='lowpass')throw Error('Piano preview currently requires lowpass filtering.');
  if(native.voices.some(v=>v.stringPitchEnabled)&&!native.voices.every(v=>v.stringPitchEnabled))throw Error('Nonuniform native piano pitch wiring is unsupported.');
  if((native.voices.some(v=>v.stringPitchEnabled)||native.filterWanderConnected||p.filterLfoDepth>0)&&!native.captureVoiceModulation)throw Error('This piano has no portable shared modulation capture.');
  const type=p.pianoType??'felt';
  return {version:1,type,voices:native.polyphony,cutoff:filter.getConfiguredFreq(),q:filter.getConfiguredQ(),pitch:p.pitchEnvAmount||0,pitchDecay:p.pitchEnvDecay||0,gainEnv:structuredClone(native.gainEnv),filterEnv:structuredClone(native.filterEnv),filterKeyTrack:p.filterKeyTrack||0,filterVelocity:p.filterVelocity||0,frequencies:Array.from({length:128},(_,m)=>native.noteInfo(m).freq),modulationSettings:native.voiceModulationSettings?.(),settings:{decay:p.pianoDecay,brightness:p.pianoBrightness,hammer:p.pianoHammer,unison:p.pianoUnison,seed:p.pianoSeed>>>0,resonance:p.pianoResonance??0,softness:0,sustain:PIANO_TYPES.indexOf(type)>=2?0:p.pianoSustain??0,wear:p.pianoWear??0}};
 }
 const patch=current(),signature=JSON.stringify(patch);
 const controls=native.captureVoiceModulation?.(captureTime)??[];if(controls.length)patch.controls=controls;
 const assertCurrent=()=>{if(JSON.stringify(current())!==signature)throw Error('The piano source changed; prepare a new preview.');};
 return {input:native.synthMix.getNode(),kind:'piano',patch,assertCurrent,activate(){assertCurrent();return native.holdSourceInput();}};
}
