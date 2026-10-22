import {translatedWasmPreset,translatedWasmVoice,needsNativeSource,wasmMappingNotes} from './wasmPreset';
import voices from '../../library/voices.json';
const preset=name=>Object.values(voices).find(group=>group[name])?.[name];
it('selects FM for existing FM sounds and keeps physical sources explicit',()=>{
 const fm=translatedWasmVoice({fmIndex:2,fmRatio:3},8);expect(fm.kind).toBe('fm');expect(fm.patch.global.quality).toBe(1);expect(fm.patch.routes[0][1]).toBe(1);expect(fm.patch.operators[0].ratio).toBe(3);expect(needsNativeSource({stringModel:'piano'})).toBe(true);expect(needsNativeSource({stringModel:'plucked'})).toBe(true);expect(needsNativeSource({vcoType:'sawtooth'})).toBe(false);
});
it('does not add a square sub, analogue drift, drive or a second chorus to clean existing voices',()=>{
 for(const name of ['Celesta','Bell Lead','Felt Piano (classic)','Soft Keys (classic)','Tine Keys (classic)']){
  const p=translatedWasmPreset(preset(name));expect(p.layers[0]).toMatchObject({sub:0,drift:0,drive:0,legacyAmp:1,ampAttackCurve:2,ampDecayCurve:2,ampReleaseCurve:2});expect(p.global.chorus).toBe(0);
 }
 const p=translatedWasmPreset({vcoType:'sine',subOscType:'sine',subOscOctaveOffset:0,gainAttack:0,gainDecay:0});expect(p.layers[0]).toMatchObject({sub:0,attack:0,decay:0});
});
it('retains the haunting FM attack, sustained inharmonicity and independently detuned high overtone',()=>{
 const old=preset('Haunted Celesta'),{patch:p}=translatedWasmVoice(old);
 expect(p.routes[0][1]).toBe(1);expect(p.routes[0][2]).toBe(0);expect(p.operators[0].level).toBeCloseTo(old.fmIndex+old.fmEnvAmount);expect(p.operators[0].sustain*p.operators[0].level).toBeCloseTo(old.fmIndex);
 expect(p.operators[2]).toMatchObject({ratio:4,detune:9});expect(p.carriers[2]).toBeCloseTo(.38);expect(p.operators[1]).toMatchObject({legacyEnvelope:1,decay1:1.1,sustain:.12,velocity:1});
 expect(translatedWasmVoice({fmEnvAmount:1,fmIndex:0}).kind).toBe('fm');
});
it('preserves organ/hollow waveforms and active sine subs rather than substituting generic sine/square voices',()=>{
 expect(translatedWasmPreset(preset('Organ Whistle')).layers[0].waveA).toBe(5);
 for(const name of ['Spore Haze','Underwater'])expect(translatedWasmPreset(preset(name)).layers[0]).toMatchObject({waveA:6,sub:0,drift:0,drive:0,lfo2Rate:preset(name).filterLfoRate});
 expect(translatedWasmPreset(preset('Underwater')).global.spread).toBe(4);
 const warm=translatedWasmPreset(preset('Warm Organ'));expect(warm.global.model).toBe(2);expect(warm.layers[1]).toMatchObject({waveA:1,waveB:0,levelA:.5,coarseA:-12});
 // tremolo and auto-pan are effects after the voice now (engine/voiceFx.js), not its LFOs
 const tremolo=translatedWasmPreset(preset('Tremolo Organ'));expect(tremolo.layers[0]).toMatchObject({lfo2Amp:0,modDepth1:0,modDepth2:0});
});
it('carries the requested delay tone and modulation rates into the translated effect chain',()=>{
 const p=translatedWasmPreset({chorusAmount:.3,chorusRate:.8,chorusDepth:.002,flangerAmount:.2,flangerRate:.1,flangerDepth:.003,flangerDelay:.006,flangerFeedback:.6,delayAmount:.24,delayTime:.3,delayFeedback:.75,delayTone:7775});
 expect(p.inserts).toMatchObject({chorus:.3,chorusRate:.8,chorusDepth:2,flanger:.2,flangerRate:.1,flangerDepth:3,flangerDelay:6,flangerFeedback:.6});expect(p.effects).toMatchObject({delay:.24,feedback:.75,tone:7775,delayMs:300,pingPong:0,delayToReverb:0});
});
it('exposes unresolved source/effect mappings instead of treating availability as parity',()=>{
 expect(wasmMappingNotes({vcoType:'sine'})).toEqual([]);
 expect(wasmMappingNotes({vcoType:'triangle',fmIndex:1,voiceCount:6,gainHold:1,reverbAmount:.3})).toEqual(expect.arrayContaining(['FM waveform/unison mapping incomplete','hold/custom envelope shape not mapped','unison limited to four','FDN room replaces the original impulse response']));
});
it('translates oscillator/envelope/effect controls into bounded source parameters',()=>{
 const {kind,patch:p}=translatedWasmVoice({vcoType:'sawtooth',osc2Type:'square',gainAttack:.7,gainRelease:2,filterFreq:1400,pingPongAmount:.4,pingPongDelayTime:.6,voiceCount:8},32);expect(kind).toBe('subtractive');expect(p.global.polyphony).toBe(16);expect(p.global.unison).toBe(4);expect(p.layers[0]).toMatchObject({waveA:3,waveB:4,attack:.7,release:2,cutoff:1400});expect(p.effects).toMatchObject({pingPong:1,delayMs:600});expect(Object.values(p.global).every(Number.isFinite)).toBe(true);
});

it('carries the mid EQ band and the room controls into the translated patch',()=>{
 const p=translatedWasmPreset({reverbAmount:.3,reverbDecay:3,reverbSize:.4,reverbDamping:2500,reverbPredelay:.06,eqMidGain:-4,eqMidFreq:800,eqMidQ:1.2});
 expect(p.effects).toMatchObject({decay:3,size:.4,damping:2500,predelay:60});expect(p.inserts).toMatchObject({midGain:-4,midFreq:800,midQ:1.2});
 expect(translatedWasmPreset({reverbAmount:.3}).effects).toMatchObject({decay:8,size:.7,damping:6000,predelay:25});
});
