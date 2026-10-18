import DEFAULTS from './presetDefaults';
import {initialPatch,sanitizePatch} from '../../synth-lab/patch';
import {initialFM,sanitizeFM,topology} from '../../synth-lab/fmPatch';
const wave=s=>({off:0,sine:1,triangle:10,sawtooth:3,square:4,square_dc:4,organ:5,hollow:6,choir:7,glass:8,reed:9}[s]??1);
const curve=(shape,exponent)=>shape==='linear'?1:shape==='exponential'?exponent:1;
const resonance=p=>Math.max(0,Math.min(1,(Math.SQRT2-1/(p.filterType==='bandpass'?Math.max(.1,p.filterQ):10**(p.filterQ/20)))/(Math.SQRT2-.15)));

export function translatedWasmPreset(raw={},polyphony=8){
 const p={...DEFAULTS,...raw},out=initialPatch(),l=out.layers[0];out.name='Translated voice';
 // Architecture init values are musical choices, not legacy defaults.
 Object.assign(out.global,{model:1,polyphony:Math.min(16,polyphony),unison:Math.min(4,p.voiceCount||1),spread:p.detuneSpread*(p.voiceCount===2?.5:1),gain:Math.min(.8,p.masterVolume*.95),width:p.stereoSpread/100,chorus:0});
 Object.assign(l,{waveA:wave(p.vcoType),waveB:wave(p.osc2Type),levelA:1,levelB:p.osc2Type==='off'?0:p.osc2Amount,pulse:p.vcoDutyCycle,pulseB:p.osc2DutyCycle-p.vcoDutyCycle,coarseA:12*Math.log2(p.allThemPitches||1),coarseB:p.osc2OctaveOffset*12,fineB:p.osc2Detune,
  cutoff:p.filterFreq*2**(-p.filterVelocity*.1/1200),resonance:resonance(p),filter:p.filterType==='highpass'?3:p.filterType==='bandpass'?2:0,filterAmount:p.filterAttack||p.filterDecay?p.filterEnvAmount/1200:0,keytrack:p.filterKeyTrack,velocityTone:p.filterVelocity/1200,
  attack:p.gainAttack,decay:p.gainDecay,sustain:p.gainSustain,release:p.gainRelease,legacyAmp:1,ampAttackCurve:curve(p.envelopeAttackShape,p.envelopeAttackExponent),ampDecayCurve:curve(p.envelopeDecayShape,p.envelopeDecayExponent),ampReleaseCurve:curve(p.envelopeReleaseShape,p.envelopeReleaseExponent),
  filterAttack:Math.max(.002,p.filterAttack),filterDecay:Math.max(.002,p.filterDecay*3),filterSustain:0,filterRelease:Math.max(.002,p.filterRelease),filterDecayCurve:.5,
  lfoPitch:p.vibratoDepth,lfoRate:Math.max(.01,p.vibratoRate),lfo2Filter:p.filterLfoDepth/1200,lfo2Rate:Math.max(.01,p.filterLfoRate),noise:p.noiseMix,breath:p.breathAmount,formant:p.formantAmount,vowel:p.formantVowel==='oo'?1:p.formantVowel==='ee'?2:0,formantShift:p.formantShift,
  polyPitch:0,sub:0,drift:0,drive:0,pressureTone:0,highpass:p.masterFilterType==='highpass'?p.masterFilterFreq:10,highResonance:p.masterFilterType==='highpass'?(Math.SQRT2-1/10**(p.masterFilterQ/20))/(Math.SQRT2-.15):0});
 if(p.pitchEnvAmount){Object.assign(l,{modAttack:.002,modDecay:Math.max(.002,p.pitchEnvDecay*1.3),modSustain:0,modRelease:.002,modDecayCurve:.25,modSource4:3,modTarget4:1,modDepth4:p.pitchEnvAmount/100});}
 // The old sub is OFF at octave zero; active subs keep their actual shape.
 if(p.subOscOctaveOffset!==0&&p.subOscType!=='off'){
  out.global.model=2;out.layers[1]={...l,waveA:wave(p.subOscType),waveB:0,levelA:.5,levelB:0,coarseA:l.coarseA+p.subOscOctaveOffset*12,coarseB:0,fineB:0};
 }
 if(p.tremoloDepth>0){
  if(!p.filterLfoDepth){l.lfo2Rate=p.tremoloRate;l.lfo2Amp=p.tremoloDepth;}
  else if(!p.vibratoDepth){l.lfoRate=p.tremoloRate;l.modSource1=1;l.modTarget1=4;l.modDepth1=p.tremoloDepth/(2-p.tremoloDepth);l.mix=1-p.tremoloDepth/2;}
 }
 if(p.autoPanDepth>0&&!p.vibratoDepth&&(!p.tremoloDepth||!p.filterLfoDepth)){l.lfoRate=p.autoPanRate;l.modSource2=1;l.modTarget2=5;l.modDepth2=p.autoPanDepth;}
 else if(p.autoPanDepth>0&&!p.filterLfoDepth&&!p.tremoloDepth){l.lfo2Rate=p.autoPanRate;l.modSource2=2;l.modTarget2=5;l.modDepth2=p.autoPanDepth;}
 if(out.global.model===2)for(const key of ['lfoRate','lfo2Rate','lfo2Amp','mix','modSource1','modTarget1','modDepth1','modSource2','modTarget2','modDepth2'])out.layers[1][key]=l[key];
 const ping=p.pingPongAmount>p.delayAmount;
 out.effects={...out.effects,dry:1,reverb:Math.min(.8,p.reverbAmount),decay:8,delay:Math.min(.8,Math.max(p.delayAmount,p.pingPongAmount)),delayMs:Math.max(40,(ping?p.pingPongDelayTime:p.delayTime)*1000||375),feedback:ping?p.pingPongFeedback:p.delayFeedback,tone:ping?p.pingPongTone:p.delayTone,pingPong:ping?1:0,delayToReverb:0};
 out.inserts={...out.inserts,chorus:p.chorusAmount,chorusRate:p.chorusRate,chorusDepth:p.chorusDepth*1000,phaser:p.phaserAmount,phaserRate:p.phaserRate,phaserDepth:p.phaserDepth/800,phaserFreq:p.phaserFrequency,phaserFeedback:p.phaserFeedback,flanger:p.flangerAmount,flangerRate:p.flangerRate,flangerDepth:p.flangerDepth*1000,flangerDelay:p.flangerDelay*1000,flangerFeedback:p.flangerFeedback,lowGain:p.eqLowGain,lowFreq:p.eqLowFreq,highGain:p.eqHighGain,highFreq:p.eqHighFreq,saturation:p.distortionAmount*.3};
 return sanitizePatch(out);
}

export function translatedWasmVoice(raw={},polyphony=8){
 if(!(raw.fmIndex>0||raw.fmEnvAmount>0))return {kind:'subtractive',patch:translatedWasmPreset(raw,polyphony)};
 const p={...DEFAULTS,...raw},base=translatedWasmPreset(p,polyphony),f=initialFM();Object.assign(f,topology(4,3));f.routes.forEach(row=>row.fill(0));f.routes[0][1]=1;
 const extra=p.osc2Type!=='off'&&p.osc2Amount>0,sub=p.subOscType!=='off'&&p.subOscOctaveOffset!==0;
 f.carriers=[0,1,extra?p.osc2Amount:0,sub?.5:0,0,0];const count=f.carriers.reduce((a,b)=>a+b,0),index=p.fmIndex+p.fmEnvAmount;
 Object.assign(f.global,{operators:4,polyphony:Math.min(16,polyphony),quality:1,gain:Math.min(.6,p.masterVolume*.7*count),index:1,feedback:0,vibrato:p.vibratoDepth,lfoRate:Math.max(.01,p.vibratoRate),breath:p.breathAmount,formant:p.formantAmount,vowel:base.layers[0].vowel,formantShift:p.formantShift,tremolo:p.tremoloDepth});
 const tuning=p.allThemPitches||1;
 for(const [i,o]of f.operators.entries())Object.assign(o,{enabled:i<4?1:0,ratio:tuning*(i===0?p.fmRatio:i===2?2**p.osc2OctaveOffset:i===3?2**p.subOscOctaveOffset:1),level:i===0?index:1,detune:i===2?p.osc2Detune:0,
  attack:i===0?0:p.gainAttack,peak:1,decay1:i===0?Math.max(.002,p.fmDecay*1.3):Math.max(.002,p.gainDecay),breakpoint:i===0?(index>0?p.fmIndex/index:0):p.gainSustain,decay2:.002,sustain:i===0?(index>0?p.fmIndex/index:0):p.gainSustain,release:i===0?12:p.gainRelease,
  velocity:i===0?0:1,keyScale:0,rateScale:0,pan:0,legacyEnvelope:i===0?0:1,attackCurve:i===0?1:curve(p.envelopeAttackShape,p.envelopeAttackExponent),decayCurve:i===0?1:curve(p.envelopeDecayShape,p.envelopeDecayExponent),releaseCurve:i===0?4:curve(p.envelopeReleaseShape,p.envelopeReleaseExponent)});
 f.effects=base.effects;f.inserts=base.inserts;return {kind:'fm',patch:sanitizeFM(f)};
}
export const needsNativeSource=p=>p?.stringModel==='piano'||p?.stringModel==='plucked';

// Availability is not a fidelity claim. Keep unresolved mappings visible while
// the original Instrument remains the reference for existing presets.
export function wasmMappingNotes(raw={}){
 const p={...DEFAULTS,...raw},notes=[];
 if(p.reverbAmount>0)notes.push('FDN room replaces the original impulse response');
 if(p.chorusAmount>0||p.flangerAmount>0||p.phaserAmount>0)notes.push('modulation-effect topology differs');
 if(p.fmIndex>0||p.fmEnvAmount>0){if(p.vcoType!=='sine'||p.osc2Amount>0&&p.osc2Type!=='sine'||p.voiceCount>1)notes.push('FM waveform/unison mapping incomplete');if(p.filterType!=='lowpass'||p.filterFreq<11000||p.filterEnvAmount||p.filterLfoDepth)notes.push('FM filter mapping incomplete');}
 if(p.gainHold>0||[p.envelopeAttackShape,p.envelopeDecayShape,p.envelopeReleaseShape].some(s=>!['linear','exponential'].includes(s)))notes.push('hold/custom envelope shape not mapped');
 if(p.voiceCount>4)notes.push('unison limited to four');
 if(p.delayAmount>0&&p.pingPongAmount>0)notes.push('two delay chains reduced to one');
 if(p.octaveRatio!==2||Object.keys(p).some(k=>/^pitch[A-G]/.test(k)&&k!=='pitchEnvAmount'&&k!=='pitchEnvDecay'&&p[k]!==1))notes.push('custom note tuning not mapped');
 if(p.pitchEnvAmount)notes.push('pitch transient approximated');
 if(p.noiseMix>0&&(p.noiseType!=='white'||p.noiseFilterEnabled))notes.push('noise colour/filter not mapped');
 return notes;
}
