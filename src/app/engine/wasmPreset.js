import DEFAULTS from './presetDefaults';
import {dynamicsOf} from '../composition/dynamics';
import {initialPatch,sanitizePatch} from '../../synth-lab/patch';
import {initialFM,sanitizeFM,topology} from '../../synth-lab/fmPatch';
const wave=s=>({off:0,sine:1,triangle:10,sawtooth:3,square:4,square_dc:4,organ:5,hollow:6,choir:7,glass:8,reed:9}[s]??1);
const curve=(shape,exponent)=>shape==='linear'?1:shape==='exponential'?exponent:1;
// The subtractive kernel plays the original's other shapes itself: the exponent, and which curve it bends (0 power, 1 mirrored = logarithmic, 2 sine)
const layerCurve=(shape,exponent)=>shape==='linear'?1:exponent;
const shapeMode=shape=>shape==='logarithmic'?1:shape==='sine'?2:0;
const resonance=p=>Math.max(0,Math.min(1,(Math.SQRT2-1/(p.filterType==='bandpass'?Math.max(.1,p.filterQ):10**(p.filterQ/20)))/(Math.SQRT2-.15)));

// The modulation effects, as the original synth built them against the inserts kernel's (tools/modulationCompare.mjs measures the two side by side).
// Chorus: three delayed voices at 0.3 each, crossfaded against the dry, so the output falls as the amount rises (-3 dB at 0.3, -5 dB at 0.5); the kernel's stays level.
const chorusLevel=a=>10*Math.log10((1-a)**2+.27*a*a);
// The original chorus swings its delays a little further than the kernel's for the same depth setting, in level and in pitch.
const CHORUS_DEPTH=1.15;
// and the kernel's wet is half the amount (its mix 1 is half wet), so a chorus mix of 1.25 times the amount puts the wet a little nearer the original's.
// Phaser: six second-order allpass stages (the kernel's are first-order, so it takes twelve), swept linearly by +-depth Hz around the centre, never past 80% of it.
// The kernel sweeps in octaves around a geometric centre, so the same range is the centre the sweep's ends meet at and half the octaves between them.
const phaserSweep=p=>{const s=Math.min(p.phaserDepth/p.phaserFrequency,.8);return {octaves:.5*Math.log2((1+s)/(1-s)),centre:p.phaserFrequency*Math.sqrt(1-s*s)};};
// Flanger and phaser: the original's come out about 3 and 1 dB above the kernel's at the amounts the voices use. The kernel's mix 1 is half wet for both, so the mixes are 2 and 2.5 times the amount.
const flangerLevel=a=>3*Math.min(1,a/.3);
const phaserLevel=a=>1*Math.min(1,a/.2);
const FLANGER_DEPTH=1;
const insertGain=p=>Math.max(-18,Math.min(6,Math.min(6,Math.max(0,20*Math.log10(Math.max(1e-6,p.masterVolume*.95)/.8)))+(p.chorusAmount>0?chorusLevel(Math.min(1,p.chorusAmount)):0)+(p.flangerAmount>0?flangerLevel(p.flangerAmount):0)+(p.phaserAmount>0?phaserLevel(p.phaserAmount):0)));
// A noise bed of its own: enough noise, its band-pass at the note on, and nothing else shaping the voice.
const pitchedNoise=p=>p?.noiseMix>=.3&&!!p.noiseFilterEnabled&&(p.filterType??'lowpass')==='lowpass'&&(p.filterFreq??22050)>=11000&&!p.filterEnvAmount&&!p.filterLfoDepth;
// `dynamics`: the scene's (settings.dynamics) - velocity → softer attack in the kernel, and velocity → filter on top of the sound's own.
export function translatedWasmPreset(raw={},polyphony=8,dynamics=null){
 const p={...DEFAULTS,...raw},out=initialPatch(),l=out.layers[0];out.name='Translated voice';
 // The original attack is an exponential approach with the attack as its time constant, and the decay starts after one time constant: the peak is 63% of the amount, not all of it.
 // Architecture init values are musical choices, not legacy defaults.
 Object.assign(out.global,{model:1,polyphony:Math.min(16,polyphony),unison:Math.min(8,p.voiceCount||1),spread:p.detuneSpread*(p.voiceCount===2?.5:1),gain:Math.min(.8,p.masterVolume*.95),width:p.stereoSpread/100,chorus:0});
 Object.assign(l,{waveA:wave(p.vcoType),waveB:wave(p.osc2Type),levelA:1,levelB:p.osc2Type==='off'?0:p.osc2Amount,pulse:p.vcoDutyCycle,pulseB:p.osc2DutyCycle-p.vcoDutyCycle,coarseA:12*Math.log2(p.allThemPitches||1),coarseB:p.osc2OctaveOffset*12,fineB:p.osc2Detune,
  cutoff:p.filterFreq*2**(-p.filterVelocity*.1/1200),resonance:resonance(p),filter:p.filterType==='highpass'?3:p.filterType==='bandpass'?2:0,filterAmount:p.filterAttack||p.filterDecay?p.filterEnvAmount/1200*(p.filterAttack>0?1-Math.exp(-1):1):0,keytrack:p.filterKeyTrack,velocityTone:p.filterVelocity/1200,
  attack:p.gainAttack,decay:p.gainDecay,sustain:p.gainSustain,release:p.gainRelease,legacyAmp:1,ampAttackCurve:layerCurve(p.envelopeAttackShape,p.envelopeAttackExponent),ampDecayCurve:layerCurve(p.envelopeDecayShape,p.envelopeDecayExponent),ampReleaseCurve:layerCurve(p.envelopeReleaseShape,p.envelopeReleaseExponent),ampAttackShape:shapeMode(p.envelopeAttackShape),ampDecayShape:shapeMode(p.envelopeDecayShape),ampReleaseShape:shapeMode(p.envelopeReleaseShape),
  filterAttack:Math.max(.002,p.filterAttack),filterDecay:Math.max(.002,p.filterDecay*4.2),filterSustain:0,filterRelease:Math.max(.002,p.filterRelease),filterDecayCurve:.5,
  lfoPitch:p.vibratoDepth,lfoRate:Math.max(.01,p.vibratoRate),lfo2Filter:p.filterLfoDepth/1200,lfo2Rate:Math.max(.01,p.filterLfoRate),noise:p.noiseMix,breath:p.breathAmount,formant:p.formantAmount,vowel:p.formantVowel==='oo'?1:p.formantVowel==='ee'?2:0,formantShift:p.formantShift,
  noiseType:{white:0,pink:1,brown:2}[p.noiseType]??0,polyPitch:0,sub:0,drift:0,drive:0,pressureTone:0,highpass:p.masterFilterType==='highpass'?p.masterFilterFreq:10,highResonance:p.masterFilterType==='highpass'?(Math.SQRT2-1/10**(p.masterFilterQ/20))/(Math.SQRT2-.15):0});
 const d=dynamicsOf(dynamics);l.velocityAttack=d.attack;l.velocityTone=Math.min(4,l.velocityTone+d.brightness*1.5);
 // The pitch sweep is the kernel's own: cents → semitones, and the original settles with time constant decay/3.
 if(p.pitchEnvAmount)Object.assign(l,{pitchEnvAmount:Math.max(-24,Math.min(24,p.pitchEnvAmount/100)),pitchEnvDecay:Math.max(.01,p.pitchEnvDecay/3)});
 // The original filters its noise alone with a band-pass sitting on the note. The kernel mixes noise ahead of the voice filter, so a noise bed
 // whose own filter is the only one (the main filter wide open) becomes a key-tracked band-pass at the note: the oscillator is at that pitch and passes.
 if(pitchedNoise(p)){Object.assign(l,{filter:2,cutoff:261.63,keytrack:1,filterAmount:0,velocityTone:0,resonance:Math.max(0,Math.min(1,(Math.SQRT2-1/Math.max(.1,p.noiseFilterQ))/(Math.SQRT2-.15)))});}
 // The original rises to the hold level, holds, then moves to the sustain level (which can be above it: a swell). The kernel does the same.
 if(p.gainHold>0)Object.assign(l,{ampHold:Math.min(4,p.gainHold),ampHoldLevel:Math.max(.05,Math.min(1,p.gainHoldLevel||1))});
 // The old sub is OFF at octave zero; active subs keep their actual shape.
 if(p.subOscOctaveOffset!==0&&p.subOscType!=='off'){
  out.global.model=2;out.layers[1]={...l,waveA:wave(p.subOscType),waveB:0,levelA:.5,levelB:0,coarseA:l.coarseA+p.subOscOctaveOffset*12,coarseB:0,fineB:0};
 }
 // Tremolo and auto-pan are effects after the voice (engine/voiceFx.js), not its LFOs.
 const ping=p.pingPongAmount>p.delayAmount;
 out.effects={...out.effects,dry:1,reverb:Math.min(.8,p.reverbAmount),decay:p.reverbDecay,size:p.reverbSize,damping:p.reverbDamping,predelay:p.reverbPredelay*1000,delay:Math.min(.8,Math.max(p.delayAmount,p.pingPongAmount)),delayMs:Math.max(40,(ping?p.pingPongDelayTime:p.delayTime)*1000||375),feedback:ping?p.pingPongFeedback:p.delayFeedback,tone:ping?p.pingPongTone:p.delayTone,pingPong:ping?1:0,delayToReverb:0};
 out.inserts={...out.inserts,gain:insertGain(p),chorus:Math.min(.8,1.25*p.chorusAmount),chorusRate:p.chorusRate,chorusDepth:p.chorusDepth*1000*CHORUS_DEPTH,phaser:Math.min(1,2.5*p.phaserAmount),phaserRate:p.phaserRate,phaserDepth:phaserSweep(p).octaves,phaserFreq:phaserSweep(p).centre,phaserStages:12,phaserFeedback:p.phaserFeedback,flanger:Math.min(1,2*p.flangerAmount),flangerRate:p.flangerRate,flangerDepth:p.flangerDepth*1000*FLANGER_DEPTH,flangerDelay:p.flangerDelay*1000,flangerFeedback:p.flangerFeedback,lowGain:p.eqLowGain,lowFreq:p.eqLowFreq,midGain:p.eqMidGain,midFreq:p.eqMidFreq,midQ:p.eqMidQ,highGain:p.eqHighGain,highFreq:p.eqHighFreq,saturation:p.distortionAmount*.3};
 return sanitizePatch(out);
}

export function translatedWasmVoice(raw={},polyphony=8,dynamics=null){
 if(!(raw.fmIndex>0||raw.fmEnvAmount>0))return {kind:'subtractive',patch:translatedWasmPreset(raw,polyphony,dynamics)};
 const p={...DEFAULTS,...raw},base=translatedWasmPreset(p,polyphony,dynamics),f=initialFM();Object.assign(f,topology(4,3));f.routes.forEach(row=>row.fill(0));f.routes[0][1]=1;
 const extra=p.osc2Type!=='off'&&p.osc2Amount>0,sub=p.subOscType!=='off'&&p.subOscOctaveOffset!==0;
 f.carriers=[0,1,extra?p.osc2Amount:0,sub?.5:0,0,0];const count=f.carriers.reduce((a,b)=>a+b,0),index=p.fmIndex+p.fmEnvAmount;
 Object.assign(f.global,{operators:4,polyphony:Math.min(16,polyphony),quality:1,gain:Math.min(.6,p.masterVolume*.7*count),index:1,feedback:0,vibrato:p.vibratoDepth,lfoRate:Math.max(.01,p.vibratoRate),breath:p.breathAmount,formant:p.formantAmount,vowel:base.layers[0].vowel,formantShift:p.formantShift,tremolo:0});
 const tuning=p.allThemPitches||1;
 for(const [i,o]of f.operators.entries())Object.assign(o,{enabled:i<4?1:0,ratio:tuning*(i===0?p.fmRatio:i===2?2**p.osc2OctaveOffset:i===3?2**p.subOscOctaveOffset:1),level:i===0?index:1,detune:i===2?p.osc2Detune:0,
  attack:i===0?0:p.gainAttack,peak:1,decay1:i===0?Math.max(.002,p.fmDecay*1.3):Math.max(.002,p.gainDecay),breakpoint:i===0?(index>0?p.fmIndex/index:0):p.gainSustain,decay2:.002,sustain:i===0?(index>0?p.fmIndex/index:0):p.gainSustain,release:i===0?12:p.gainRelease,
  velocity:i===0?dynamicsOf(dynamics).brightness*.8:1,keyScale:0,rateScale:0,pan:0,legacyEnvelope:i===0?0:1,attackCurve:i===0?1:curve(p.envelopeAttackShape,p.envelopeAttackExponent),decayCurve:i===0?1:curve(p.envelopeDecayShape,p.envelopeDecayExponent),releaseCurve:i===0?4:curve(p.envelopeReleaseShape,p.envelopeReleaseExponent)});
 f.effects=base.effects;f.inserts=base.inserts;return {kind:'fm',patch:sanitizeFM(f)};
}
// The kernel's noise comes in white, pink and brown. Noise through a band-pass on the note is the pitched noise bed (wind, rain): DI-Poly takes it as a key-tracked
// band-pass (`poly`), the front page's engine still plays it from the original. Noise with any other shaping around it stays on the original engine.
const coloursNoise=(p,poly)=>p?.noiseMix>=.3&&p.noiseFilterEnabled&&!(poly&&pitchedNoise(p));
// The kernel has no bit crusher; a light touch is close enough, a clear one stays on the original engine. DI-Poly puts it in the effects chain (`poly`).
const crushes=(p,poly)=>!poly&&p?.bitCrushAmount>=.2;
export const needsNativeSource=(p,{poly=false}={})=>p?.stringModel==='piano'||p?.stringModel==='plucked'||!!coloursNoise(p,poly)||!!crushes(p,poly);

// Availability is not a fidelity claim. Keep unresolved mappings visible while
// the original Instrument remains the reference for existing presets.
export function wasmMappingNotes(raw={}){
 const p={...DEFAULTS,...raw},notes=[];
 if(p.reverbAmount>0)notes.push('FDN room replaces the original impulse response');
 if(p.chorusAmount>0||p.flangerAmount>0||p.phaserAmount>0)notes.push('modulation-effect topology differs');
 if(p.fmIndex>0||p.fmEnvAmount>0){if(p.vcoType!=='sine'||p.osc2Amount>0&&p.osc2Type!=='sine'||p.voiceCount>1)notes.push('FM waveform/unison mapping incomplete');if(p.filterType!=='lowpass'||p.filterFreq<11000||p.filterEnvAmount||p.filterLfoDepth)notes.push('FM filter mapping incomplete');}
 if(p.fmIndex>0&&p.gainHold>0||[p.envelopeAttackShape,p.envelopeDecayShape,p.envelopeReleaseShape].some(s=>!(p.fmIndex>0||p.fmEnvAmount>0?['linear','exponential']:['linear','exponential','logarithmic','sine']).includes(s)))notes.push('hold/custom envelope shape not mapped');
 if(p.voiceCount>8)notes.push('unison limited to eight');
 if(p.delayAmount>0&&p.pingPongAmount>0)notes.push('two delay chains reduced to one');
 if(p.octaveRatio!==2||Object.keys(p).some(k=>/^pitch[A-G]/.test(k)&&k!=='pitchEnvAmount'&&k!=='pitchEnvDecay'&&p[k]!==1))notes.push('custom note tuning not mapped');
  if(p.noiseMix>=.3&&p.noiseFilterEnabled&&!pitchedNoise(p))notes.push('noise filter not mapped');
 if(p.bitCrushAmount>0)notes.push('bit crusher not mapped');
 return notes;
}
