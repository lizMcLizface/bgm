// Factory sounds: original patches in the Minimoog idiom (panel settings in the spirit
// of Moog's sound charts, not copies of them). Each is a set of overrides on the defaults.
import {sanitize} from './params';

const RAW=[
 {name:'Fat Bass',colour:'#b07a4a',note:'Two saws and a square, all at 16 feet; a snappy filter contour with a little emphasis.',values:{
  osc1Range:2,osc1Wave:2,osc2Range:2,osc2Wave:2,osc2Tune:.08,osc3Range:1,osc3Wave:3,mix1:.6,mix2:.55,mix3On:1,mix3:.5,drive:.45,
  cutoff:170,emphasis:.3,contour:.5,kbdThird:1,kbdTwoThirds:0,fAttack:.002,fDecay:.35,fSustain:.15,aAttack:.002,aDecay:.4,aSustain:.75,decayOn:0,
  velContour:.5,velLevel:.4,volume:.71,reverbMix:.03}},
 {name:'Classic Lead',colour:'#c8452b',note:'Two saws a hair apart with glide; play legato for the single-trigger glide.',values:{
  osc1Range:3,osc2Range:3,osc2Tune:.1,osc3Range:3,osc3Wave:3,osc3Tune:7,mix3On:1,mix3:.3,drive:.4,
  cutoff:1100,emphasis:.3,contour:.35,kbdThird:1,kbdTwoThirds:1,fDecay:.6,fSustain:.5,aSustain:.9,glideOn:1,glide:.08,
  modAmount:0,velContour:.3,reverbMix:.2,volume:.69}},
 {name:'Brass',colour:'#e0a526',note:'Saws with a slow attack on the contours, release following the decay.',values:{
  osc1Range:3,osc2Range:3,osc2Tune:.12,osc3Range:3,mix3On:1,mix3:.4,drive:.5,
  cutoff:350,emphasis:.12,contour:.5,kbdThird:1,kbdTwoThirds:1,fAttack:.09,fDecay:.9,fSustain:.5,aAttack:.05,aDecay:1,aSustain:.85,decayOn:1,
  velContour:.5,velLevel:.3,reverbMix:.2,volume:.7}},
 {name:'Wow Bass',colour:'#3f6b4f',note:'Oscillator 3 free-runs as an LFO on the filter: a rolling wow.',values:{
  osc1Range:2,osc1Wave:2,osc2Range:2,osc2Wave:3,osc2Tune:-.05,mix2:.45,
  osc3Range:0,osc3Wave:0,osc3Kbd:0,osc3Tune:1,modFilter:1,modOsc:0,modAmount:.45,modMix:0,
  cutoff:300,emphasis:.45,contour:.25,kbdThird:1,kbdTwoThirds:0,fDecay:.5,fSustain:.5,aSustain:.9,drive:.4,volume:.7,reverbMix:.04}},
 {name:'Pluck Pulse',colour:'#e86a92',note:'Narrow pulses and a quick, resonant contour; short and percussive.',values:{
  osc1Range:3,osc1Wave:5,osc2Range:4,osc2Wave:4,osc2Tune:.05,mix1:.55,mix2:.45,
  cutoff:260,emphasis:.45,contour:.6,kbdThird:1,kbdTwoThirds:1,fAttack:.001,fDecay:.22,fSustain:0,aAttack:.001,aDecay:.3,aSustain:0,decayOn:1,
  velContour:.5,velLevel:.5,reverbMix:.15,volume:.98}},
 {name:'Vibrato Lead',colour:'#f3d38a',note:'Triangle oscillators; the mod wheel brings in vibrato from oscillator 3.',values:{
  osc1Range:3,osc1Wave:1,osc2Range:3,osc2Wave:0,osc2Tune:.07,osc3Range:0,osc3Wave:0,osc3Kbd:0,osc3Tune:3,modOsc:1,modAmount:0,modMix:0,
  mix1:.55,mix2:.5,cutoff:1500,emphasis:.15,contour:.3,kbdThird:1,kbdTwoThirds:1,fDecay:.8,fSustain:.6,aSustain:.9,glideOn:1,glide:.05,
  reverbMix:.22,volume:.75}},
 {name:'Singing Filter',colour:'#9b7fd1',note:'No oscillators: the emphasis at the top makes the filter sing at the pitch you play.',values:{
  mix1:0,mix2:0,mix1On:0,mix2On:0,mix3On:0,noiseOn:0,cutoff:261,emphasis:1,contour:0,kbdThird:1,kbdTwoThirds:1,
  fSustain:1,aAttack:.03,aDecay:1,aSustain:1,decayOn:1,velLevel:.3,reverbMix:.3,volume:.38}},
 {name:'Zap',colour:'#4a62b8',note:'A noise burst through a wide, resonant contour sweep: lasers and percussion.',values:{
  osc1Range:3,mix1:.2,noiseOn:1,noise:.7,noisePink:1,cutoff:120,emphasis:.65,contour:.95,kbdThird:0,kbdTwoThirds:1,
  fAttack:.001,fDecay:.35,fSustain:0,aAttack:.001,aDecay:.45,aSustain:0,decayOn:1,velContour:.3,reverbMix:.2,volume:1}},
 {name:'Wind',colour:'#a7c4d9',note:'Pink noise swept slowly by the contour, with a gentle wobble from oscillator 3.',values:{
  mix1On:0,mix2On:0,noiseOn:1,noise:.9,noisePink:1,osc3Range:0,osc3Kbd:0,osc3Tune:-3,modFilter:1,modOsc:0,modAmount:.3,
  cutoff:450,emphasis:.55,contour:.3,kbdThird:0,fAttack:1.5,fDecay:3,fSustain:.5,aAttack:1.2,aDecay:3,aSustain:.85,decayOn:1,reverbMix:.4,reverbDecay:6,volume:.84}},
 {name:'Organ Stack',colour:'#8a8f98',note:'Square waves at 16, 8 and 4 feet with the loudness contour as a gate.',values:{
  osc1Range:2,osc1Wave:3,osc2Range:3,osc2Wave:3,osc3Range:4,osc3Wave:3,mix3On:1,mix1:.5,mix2:.5,mix3:.35,drive:.15,
  cutoff:5000,emphasis:0,contour:0,kbdThird:1,kbdTwoThirds:1,aAttack:.003,aDecay:.3,aSustain:1,decayOn:0,reverbMix:.25,volume:.62}},
 {name:'Overdrive Growl',colour:'#d98b4a',note:'Everything up: the mixer overloads the filter and the output is fed back in.',values:{
  osc1Range:2,osc1Wave:2,osc2Range:2,osc2Wave:2,osc2Tune:.15,mix1:1,mix2:1,mix3On:1,mix3:.8,osc3Range:1,drive:1,feedback:.35,
  cutoff:420,emphasis:.4,contour:.3,kbdThird:1,kbdTwoThirds:0,fDecay:.4,fSustain:.4,aSustain:.9,volume:.62,reverbMix:.05}},
 {name:'Plain',colour:'#c9c3b4',note:'A neutral starting point: two saws and a half-open filter.',values:{}},
];

export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));
