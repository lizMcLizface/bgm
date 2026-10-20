// The OB-Xa factory patch book (measured from the scanned drawings by tools/obxa-patch-book, which
// writes the git-ignored banks/oberheim-ob-xa/patch-book.json) → engine values. Nothing from the
// book ships with the site: the file is loaded on this machine, or picked by hand. The values are
// facsimile readings (about ±0.3 of a knob division), the oscillator pitches are the printed notes.

const knob=x=>(x??0)/10;
const expMap=(lo,hi,x)=>lo*(hi/lo)**knob(x);

/** The printed pitch notes → semitones above the keyboard pitch; null when the oscillator is off. */
export const PITCH_NOTES={
 'Normal Pitch':0,'One Octave Up':12,'Two Octaves Up':24,'Three Octaves Up':36,'Four Octaves Up':48,
 'Major Seventh Up':11,'Perfect Fifth Up':7,'Tenth Up':16,'One Octave Plus Minor Third Up':15,'One Octave Plus Perfect Fifth Up':19,
 'Two Octaves Plus Fourth Up':29,'Two Octaves and a Major Seventh Up':35,'Maximum Transpose Up':60,'Off':null,
};
export const semitones=note=>PITCH_NOTES[note]??0;

/** Units for the engine, all estimates (knob 0–10 → exponential ranges) until checked by ear or against recordings. */
export const CALIBRATION={
 // the service manual's filter calibration: at cutoff 0 with key tracking on, the filter rings at the key's own pitch, so the lowest key (C0, 65.4 Hz) is the zero point
 cutoffHz:[65.4,16000],attackS:[.001,8],decayS:[.003,15],lfoHz:[.1,30],wheelHz:[.5,12],portamentoS:2,detuneCents:100,
};

const flag=b=>b?1:0;
/** One patch of the book → engine values for one layer (plain keys). */
export function engineValues(p){
 const C=CALIBRATION,o=p.oscillators,m=p.mixer,f=p.filter,fe=p.filter_envelope,ae=p.amp_envelope,l=p.lfo,c=p.control,w=p.performance;
 const env=(prefix,e)=>({[prefix+'Attack']:expMap(...C.attackS,e.attack),[prefix+'Decay']:expMap(...C.decayS,e.decay),[prefix+'Sustain']:knob(e.sustain),[prefix+'Release']:expMap(...C.decayS,e.release)});
 const osc1Off=p.pitch.osc1==='Off'||!m.osc1,osc2Mix=p.pitch.osc2==='Off'?0:{off:0,half:1,full:2}[m.osc2];
 return {
  osc1Pitch:semitones(p.pitch.osc1),osc1Saw:flag(o.osc1_waves.includes('saw')),osc1Pulse:flag(o.osc1_waves.includes('pulse')),osc1On:flag(!osc1Off),
  osc2Pitch:semitones(p.pitch.osc2),osc2Saw:flag(o.osc2_waves.includes('saw')),osc2Pulse:flag(o.osc2_waves.includes('pulse')),osc2Mix,
  osc2Detune:(knob(o.osc2_detune)-.5)*2*C.detuneCents,pw:knob(o.pulse_width),sync:flag(o.sync),fenvOsc2:flag(o.filter_env_to_osc2),noiseOn:flag(m.noise),
  cutoff:expMap(...C.cutoffHz,f.cutoff),res:knob(f.resonance),envAmount:knob(f.env_amount),poles:flag(f.four_pole),track:f.key_track?1:0,
  ...env('f',fe),...env('a',ae),
  lfoRate:expMap(...C.lfoHz,l.rate),lfoSine:flag(l.waves.includes('sine')),lfoSquare:flag(l.waves.includes('square')),lfoSh:flag(l.waves.includes('sample & hold')),
  lfoFreqDepth:knob(l.freq_depth),lfoToOsc1:flag(l.freq_to.includes('osc1')),lfoToOsc2:flag(l.freq_to.includes('osc2')),lfoToFilter:flag(l.freq_to.includes('filter')),
  lfoPwDepth:knob(l.pw_depth),lfoPwOsc1:flag(l.pw_to.includes('osc1')),lfoPwOsc2:flag(l.pw_to.includes('osc2')),
  portamento:knob(c.portamento)*C.portamentoS,unison:flag(c.unison),
  wheelRate:expMap(...C.wheelHz,w.wheel_rate),wheelDepth:knob(w.wheel_depth),wheelOsc1:flag(w.wheel_mod.includes('osc1')),wheelOsc2:flag(w.wheel_mod.includes('osc2')),
  bendOsc2Only:flag(w.bend.includes('osc2 only')),transpose:w.transpose.includes('up')?12:w.transpose.includes('down')?-12:0,
  chorusMix:0,reverbMix:0,
 };
}
