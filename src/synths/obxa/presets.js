// Factory sounds: original patches in the OB-Xa idiom, not copies of Oberheim's programs (those
// load from your own patch-book file on the "Patch book" shelf). Each is a set of overrides on the
// defaults; the layered ones use both layers.
import {sanitize,intoLayer} from './params';

const RAW=[
 {name:'Brass Ensemble',colour:'#e0a526',note:'Two saws, a swell on the 24 dB filter and a touch of detune: the brassy OB-Xa stack.',values:{
  osc2Detune:12,cutoff:150,res:.05,envAmount:.62,poles:1,fAttack:.07,fDecay:.9,fSustain:.4,fRelease:.4,
  aAttack:.03,aDecay:1,aSustain:.9,aRelease:.35,velFilter:.5,velAmp:.3,reverbMix:.2,volume:.57}},
 {name:'Sync Lead',colour:'#c8452b',note:'Oscillator 2 synced to 1 and swept by the filter envelope.',values:{
  osc2Pitch:7,osc2Detune:0,sync:1,fenvOsc2:1,osc1On:0,cutoff:900,res:.2,envAmount:.25,poles:1,track:1,
  fAttack:.002,fDecay:1,fSustain:.3,fRelease:.3,aAttack:.004,aDecay:1,aSustain:.9,aRelease:.25,portamento:.06,
  lfoRate:5.5,wheelDepth:.5,velFilter:.4,voices:8,reverbMix:.18,volume:.67}},
 {name:'Strings',colour:'#7fd0c8',note:'Pulse with slow width modulation on both oscillators; 12 dB filter.',values:{
  osc1Saw:0,osc1Pulse:1,osc2Saw:0,osc2Pulse:1,osc2Detune:14,pw:.3,lfoRate:.6,lfoPwDepth:.4,lfoPwOsc1:1,lfoPwOsc2:1,
  cutoff:1600,res:.05,envAmount:.1,poles:0,track:1,fAttack:.6,fDecay:2,fSustain:.8,fRelease:1.2,
  aAttack:.55,aDecay:2,aSustain:.9,aRelease:1.3,width:.7,reverbMix:.35,reverbDecay:4.5,volume:.43}},
 {name:'Rock Unison',colour:'#f3d38a',note:'All eight voices on one note, detuned, with portamento and a wheel vibrato.',values:{
  osc2Detune:10,unison:1,unisonDetune:.4,portamento:.08,cutoff:700,res:.2,envAmount:.3,poles:1,track:1,
  fAttack:.005,fDecay:.6,fSustain:.5,fRelease:.3,aAttack:.003,aDecay:.6,aSustain:.9,aRelease:.25,wheelDepth:.5,
  velFilter:.4,width:.5,reverbMix:.15,volume:.5}},
 {name:'Electric Piano',colour:'#d98b4a',note:'Pulse and a high saw: a decaying, bell-ish tine through the filter.',values:{
  osc1Saw:0,osc1Pulse:1,pw:.35,osc2Pitch:24,osc2Mix:1,osc2Detune:0,cutoff:300,res:.1,envAmount:.4,poles:1,track:1,
  fAttack:.001,fDecay:1.2,fSustain:.1,fRelease:.5,aAttack:.001,aDecay:2.2,aSustain:.15,aRelease:.5,velFilter:.6,velAmp:.6,
  reverbMix:.24,volume:.77}},
 {name:'Harp',colour:'#a7c4d9',note:'Plucked: a fast decay on both envelopes, resonance on the filter.',values:{
  osc2Detune:3,cutoff:250,res:.3,envAmount:.5,poles:1,track:1,fAttack:.001,fDecay:.35,fSustain:0,fRelease:.4,
  aAttack:.001,aDecay:1.4,aSustain:0,aRelease:.6,velFilter:.5,velAmp:.5,reverbMix:.35,volume:1}},
 {name:'Calliope',colour:'#8a8f98',note:'Square-ish pulses with noise and a little LFO pitch wobble.',values:{
  osc1Saw:0,osc1Pulse:1,osc2Saw:0,osc2Pulse:1,osc2Pitch:12,osc2Detune:2,noiseOn:1,cutoff:3000,res:.05,envAmount:.1,poles:0,
  lfoRate:5,lfoFreqDepth:.15,lfoToOsc1:1,lfoToOsc2:1,fSustain:1,aAttack:.01,aDecay:.4,aSustain:1,aRelease:.12,reverbMix:.2,volume:.39}},
 {name:'S/H Burble',colour:'#9b7fd1',note:'Sample & hold steps the resonant filter.',values:{
  osc2Pitch:-12,osc2Detune:5,cutoff:500,res:.7,envAmount:.1,poles:1,track:1,lfoRate:7,lfoSine:0,lfoSh:1,lfoFreqDepth:.5,lfoToFilter:1,
  aAttack:.004,aDecay:1,aSustain:.9,aRelease:.5,reverbMix:.3,volume:.64}},
 {name:'Bass',colour:'#3f6b4f',note:'Two low saws, snappy filter, 12 dB for a rounder tone.',values:{
  osc1Pitch:-12,osc2Pitch:-12,osc2Detune:5,cutoff:140,res:.3,envAmount:.45,poles:1,track:1,
  fAttack:.001,fDecay:.35,fSustain:.15,fRelease:.1,aAttack:.001,aDecay:.6,aSustain:.7,aRelease:.08,velFilter:.5,velAmp:.4,
  voices:4,width:.1,reverbMix:.03,volume:.76}},
 {name:'Wind',colour:'#4a62b8',note:'Noise only through a swept resonant filter.',values:{
  osc1On:0,osc2Mix:0,noiseOn:1,cutoff:500,res:.6,envAmount:.2,poles:1,track:1,fAttack:1.2,fDecay:3,fSustain:.6,fRelease:2,
  aAttack:1.2,aDecay:3,aSustain:.85,aRelease:2.2,lfoRate:.15,lfoFreqDepth:.4,lfoToFilter:1,width:.8,reverbMix:.45,reverbDecay:7,volume:.93}},
 {name:'Plain',colour:'#c9c3b4',note:'A neutral starting point: two slightly detuned saws.',values:{}},
];

const of=name=>RAW.find(p=>p.name===name).values;
const lower=values=>intoLayer(values,'lower');
RAW.push(
 {name:'Bass | Strings',colour:'#2f7a6d',note:'Split at G3: a bass below, strings above.',values:{
  ...of('Strings'),...lower(of('Bass')),keyMode:2,splitPoint:55}},
 {name:'Brass + Strings',colour:'#b5852d',note:'Double: brass and strings on every key, four voices each.',values:{
  ...of('Strings'),volume:.4,...lower({...of('Brass Ensemble'),volume:.45}),keyMode:1,balance:.5}},
);

export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));
