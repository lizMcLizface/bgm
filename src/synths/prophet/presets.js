// Factory sounds: original patches in the Prophet-5 idiom, not copies of
// Sequential's programs (those load from their own .syx file on the "P5 bank"
// shelf). Each is a set of overrides on the defaults.
import {sanitize} from './params';

const RAW=[
 {name:'Poly Brass',colour:'#e0a526',note:'Two detuned saws; the filter envelope blooms with velocity.',values:{
  aSaw:1,bSaw:1,bFine:9,mixA:1,mixB:.9,cutoff:210,res:.12,fEnv:.42,track:1,fAttack:.06,fDecay:.9,fSustain:.45,fRelease:.35,
  aAttack:.03,aDecay:1,aSustain:.85,aRelease:.35,velFilter:.6,velAmp:.35,reverbMix:.2,volume:.57}},
 {name:'Sync Lead',colour:'#c8452b',note:'Osc A synced to B and swept by the filter envelope through Poly-Mod.',values:{
  aSaw:1,sync:1,aFreq:7,bSaw:1,bFreq:0,bFine:0,mixA:1,mixB:0,cutoff:650,res:.2,fEnv:.25,track:2,fAttack:.002,fDecay:.9,fSustain:.3,fRelease:.3,
  pmEnv:.42,pmFreqA:1,aAttack:.004,aDecay:1,aSustain:.9,aRelease:.25,lfoRate:5.5,lfoTri:1,wmFreqA:1,wmFreqB:1,glide:.06,
  velFilter:.4,velAmp:.3,voices:5,reverbMix:.18,volume:.64}},
 {name:'Soft Strings',colour:'#7fd0c8',note:'Pulse and saw with slow LFO width movement on both oscillators.',values:{
  aSaw:1,aPulse:1,aPw:.38,bPulse:1,bSaw:0,bPw:.62,bFine:12,mixA:.85,mixB:.85,cutoff:1050,res:.05,fEnv:.1,track:1,
  fAttack:.6,fDecay:2,fSustain:.8,fRelease:1.2,aAttack:.55,aDecay:2,aSustain:.9,aRelease:1.3,
  lfoRate:.6,lfoTri:1,lfoAmount:.35,wmPwA:1,wmPwB:1,velFilter:.2,velAmp:.25,width:.6,reverbMix:.32,reverbDecay:4.5,volume:.46}},
 {name:'Fifths Bass',colour:'#3f6b4f',note:'Osc B a fifth above Osc A, tight envelope, half key tracking.',values:{
  aSaw:1,aFreq:-12,bSaw:1,bPulse:1,bPw:.4,bFreq:-5,bFine:3,mixA:1,mixB:.75,cutoff:110,res:.3,fEnv:.4,track:1,
  fAttack:.001,fDecay:.35,fSustain:.15,fRelease:.12,aAttack:.001,aDecay:.6,aSustain:.7,aRelease:.08,velFilter:.5,velAmp:.4,
  voices:5,width:.1,reverbMix:.03,volume:.64}},
 {name:'Poly-Mod Bell',colour:'#9b7fd1',note:'Osc B frequency-modulates Osc A at audio rate: clangorous, bell-like partials.',values:{
  aSaw:0,aPulse:1,aPw:.5,bTri:1,bSaw:0,bFreq:19,bFine:0,mixA:.9,mixB:0,pmOscB:.55,pmFreqA:1,cutoff:950,res:.08,fEnv:.3,track:2,fAttack:.001,fDecay:2.2,fSustain:0,fRelease:1.2,
  pmEnv:0,aAttack:.001,aDecay:3.5,aSustain:0,aRelease:1.8,velFilter:.5,velAmp:.5,reverbMix:.35,reverbDecay:5,volume:.645}},
 {name:'Resonant Pluck',colour:'#e86a92',note:'A short, wet filter pluck with the resonance near the edge.',values:{
  aSaw:1,bSaw:1,bFine:6,mixA:1,mixB:.6,cutoff:65,res:.62,fEnv:.48,track:2,fAttack:.001,fDecay:.32,fSustain:0,fRelease:.25,
  aAttack:.001,aDecay:.7,aSustain:0,aRelease:.35,velFilter:.6,velAmp:.5,reverbMix:.25,volume:.92}},
 {name:'Unison Lead',colour:'#f3d38a',note:'All five voices on one note, detuned, last-note priority with glide.',values:{
  aSaw:1,bSaw:1,bFine:5,mixA:1,mixB:.9,cutoff:325,res:.25,fEnv:.3,track:2,fAttack:.005,fDecay:.6,fSustain:.5,fRelease:.3,
  aAttack:.003,aDecay:.6,aSustain:.9,aRelease:.25,unison:1,unisonVoices:5,unisonDetune:.35,priority:1,glide:.08,
  lfoRate:5,lfoTri:1,wmFreqA:1,wmFreqB:1,velFilter:.4,velAmp:.25,width:.5,reverbMix:.18,volume:.54}},
 {name:'PWM Organ',colour:'#8a8f98',note:'Osc B in low-frequency mode sweeps Osc A\'s pulse width through Poly-Mod.',values:{
  aSaw:0,aPulse:1,aPw:.5,bLow:1,bFreq:-4,bTri:1,bSaw:0,bKybd:0,mixA:1,mixB:0,pmOscB:.6,pmPwA:1,
  cutoff:1050,res:0,fEnv:0,track:2,aAttack:.004,aDecay:.4,aSustain:1,aRelease:.08,velFilter:0,velAmp:.15,reverbMix:.25,volume:.41}},
 {name:'Filter Sweep Pad',colour:'#4a62b8',note:'A slow filter envelope opens and closes under a held chord.',values:{
  aSaw:1,bSaw:1,bFreq:-12,bFine:8,mixA:1,mixB:.7,mixNoise:.08,cutoff:90,res:.45,fEnv:.55,track:1,
  fAttack:3,fDecay:4,fSustain:.3,fRelease:3,aAttack:.8,aDecay:3,aSustain:.85,aRelease:3,velFilter:.2,velAmp:.2,
  width:.7,reverbMix:.4,reverbDecay:6,volume:.62}},
 {name:'Electric Keys',colour:'#d98b4a',note:'A decaying pulse-and-triangle tone with a touch of Osc B on the filter.',values:{
  aSaw:0,aPulse:1,aPw:.3,bTri:1,bSaw:0,bFreq:12,bFine:2,mixA:.9,mixB:.5,cutoff:225,res:.1,fEnv:.3,track:2,
  fAttack:.001,fDecay:1.4,fSustain:.15,fRelease:.6,pmOscB:.08,pmFilter:1,aAttack:.001,aDecay:2.4,aSustain:.2,aRelease:.6,
  velFilter:.6,velAmp:.6,voices:8,reverbMix:.24,volume:.69}},
 {name:'Noise Wind',colour:'#a7c4d9',note:'Noise only, slowly swept by the LFO through a resonant filter.',values:{
  aSaw:0,bSaw:0,mixA:0,mixB:0,mixNoise:1,cutoff:350,res:.72,fEnv:.15,track:1,fAttack:1.2,fDecay:3,fSustain:.7,fRelease:2,
  aAttack:1.2,aDecay:3,aSustain:.85,aRelease:2.2,lfoRate:.15,lfoTri:1,lfoAmount:.5,wmFilter:1,velFilter:.1,velAmp:.2,
  width:.8,reverbMix:.45,reverbDecay:7,volume:.73}},
 {name:'Plain',colour:'#c9c3b4',note:'A neutral starting point: two saws, a slightly open filter.',values:{}},
];

export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));
