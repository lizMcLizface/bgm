export function pluckedStemTap(instrument,assertHost=()=>{},{captureTime}={}){
 const voice=instrument?.voice,native=voice?.native??(instrument?.synthMix?instrument:null);
 function current(){
  assertHost();const p=native?.preset,voices=native?.voices,filter=voices?.[0]?.filter;
  if(!native||instrument.disposed||voice?.disposed||native.disposed||instrument.loading||instrument.voice!==voice||p?.stringModel!=='plucked'||!native.synthMix?.getNode||!filter||native.held?.size)throw Error('Select a ready released plucked voice');
  if(native.busyUntil?.some(t=>t>native.AC.currentTime))throw Error('Stop existing plucked bookings before preparing a finite preview');
  if(p.breathAmount>0)throw Error('Plucked preview requires its independent breath-noise branch to be off');
  if(voices.some(v=>v.filter.getType()!=='lowpass'||v.filter.getConfiguredFreq()!==filter.getConfiguredFreq()||v.filter.getConfiguredQ()!==filter.getConfiguredQ()||Math.fround(v.volume.getGain())!==Math.fround(.2)))throw Error('Plucked preview requires uniform native lowpass filters and0.2 voice gain');
  if(voices.some(v=>v.stringPitchEnabled)&&!voices.every(v=>v.stringPitchEnabled))throw Error('Nonuniform plucked pitch wiring is unsupported');
  if((voices.some(v=>v.stringPitchEnabled)||native.filterWanderConnected||p.filterLfoDepth>0)&&!native.captureVoiceModulation)throw Error('Plucked voice has no finite modulation capture');
  return {version:1,voices:native.polyphony,cutoff:filter.getConfiguredFreq(),q:filter.getConfiguredQ(),pitch:p.pitchEnvAmount||0,pitchDecay:p.pitchEnvDecay||0,gainEnv:structuredClone(native.gainEnv),filterEnv:structuredClone(native.filterEnv),filterKeyTrack:p.filterKeyTrack||0,filterVelocity:p.filterVelocity||0,frequencies:Array.from({length:128},(_,m)=>native.noteInfo(m).freq),modulationSettings:native.voiceModulationSettings?.(),settings:{decay:p.stringDecay,damping:p.stringDamping,position:p.stringPosition,body:p.stringBody,resonance:p.stringResonance??0,bodyType:p.stringBodyType??'guitar',seed:p.stringSeed>>>0,softness:0}};
 }
 const patch=current(),signature=JSON.stringify(patch);patch.controls=native.captureVoiceModulation?.(captureTime)??[];
 const assertCurrent=()=>{if(JSON.stringify(current())!==signature)throw Error('The plucked source changed; prepare a new preview');};
 return {kind:'plucked',input:native.synthMix.getNode(),patch,assertCurrent,activate(){assertCurrent();return native.holdSourceInput();}};
}
