// Factory sounds for the wavetable synthesizer. Each is a set of overrides on the defaults plus the four waves it plays.
import {sanitize} from './params';
import {shape,harmonics,DEFAULT_WAVES} from './waves';
import {BANK,BANK_CATEGORIES} from './bank';

// harmonic amplitude lists
const odd=(n,f=h=>1/h)=>Array.from({length:n},(_,i)=>(i+1)%2?f(i+1):0);
const all=(n,f=h=>1/h)=>Array.from({length:n},(_,i)=>f(i+1));
const peaks=(n,centres,width)=>Array.from({length:n},(_,i)=>centres.reduce((s,[c,a])=>s+a*Math.exp(-(((i+1-c)/width)**2)),0)/Math.sqrt(i+1)**.3);
const partials=(list,n=40)=>Array.from({length:n},(_,i)=>list[i+1]??0);

const RAW=[
 {name:'Init',category:'init',styles:['neutral'],colour:'#c9c3b4',note:'A saw through a soft low-pass: the neutral starting point. Move the joystick to morph into the other three waves.',
  waves:DEFAULT_WAVES,values:{}},
 {name:'Quad Lead',category:'leads',styles:['unison','bright'],colour:'#d9534f',note:'Five detuned voices of a saw morphing into a narrow pulse; the filter snaps open on each note.',
  waves:[shape('saw'),shape('pulse',.25),shape('saw'),shape('pulse',.125)],
  values:{joyX:.35,joyY:.25,uniVoices:5,uniDetune:22,uniSpread:.7,cutoff:2600,res:.18,filterEnv:.45,fAttack:.002,fDecay:.35,fSustain:.35,keyFollow:.7,aAttack:.004,aDecay:.2,aSustain:.85,aRelease:.2,lfo1Rate:5.5,lfo1Pitch:12,volume:.55}},
 {name:'Vector Pad',category:'pads',styles:['evolving','wide'],colour:'#9b7fd1',note:'Four different waves; a slow envelope and an LFO walk the joystick around the diamond so the pad never sits still.',
  waves:[shape('sine'),harmonics(odd(24,h=>h**-1.4)),harmonics(all(32,h=>h**-1.1)),shape('pulse',.2)],
  values:{joyX:-.6,joyY:0,vecX:1.2,vecY:.8,vAttack:2.2,vDecay:3,vSustain:.55,vRelease:2,lfo1Rate:.16,lfo1Shape:1,lfo1X:.5,lfo1Y:.35,lfo2Rate:.11,lfo2Shape:0,lfo2Y:.4,uniVoices:4,uniDetune:16,uniSpread:.9,cutoff:3200,res:.1,filterEnv:.15,fAttack:1.5,fDecay:2,fSustain:.8,aAttack:1.1,aDecay:1.5,aSustain:.9,aRelease:1.6,volume:.5,reverbMix:.3,chorusMix:.3}},
 {name:'Glass Bell',category:'bells',styles:['inharmonic','struck'],colour:'#a7c4d9',note:'Sparse partials, with two of the four waves tuned up a twelfth and two octaves: a bright bell that darkens as it rings.',
  waves:[harmonics(partials({1:1,4:.55,7:.4,11:.3,16:.18,22:.1})),harmonics(partials({1:1,3:.5,8:.35,13:.25,19:.12})),shape('sine'),harmonics(partials({1:1,2:.3,5:.45,9:.25,14:.15}))],
  values:{joyX:-.2,joyY:.35,coarse3:19,coarse4:24,fine2:7,vecX:.5,vecY:-.7,vAttack:.002,vDecay:1.4,vSustain:0,cutoff:9000,res:.08,filterEnv:-.3,fAttack:.001,fDecay:.6,fSustain:.3,keyFollow:.9,aAttack:.001,aDecay:2.8,aSustain:0,aRelease:1.2,velAmp:.6,volume:.55,reverbMix:.3}},
 {name:'Hollow Keys',category:'keys',styles:['pulse','soft'],colour:'#e0a526',note:'Narrow pulses and a squared sine: a hollow electric-piano colour that brightens with velocity.',
  waves:[shape('pulse',.25),shape('tri'),shape('sinesq'),shape('halfsine')],
  values:{joyX:-.45,joyY:.4,vecY:-.5,vDecay:.5,vSustain:.2,vAttack:.002,cutoff:3600,res:.12,filterEnv:.4,fAttack:.001,fDecay:.45,fSustain:.2,keyFollow:.6,aAttack:.002,aDecay:1.4,aSustain:.2,aRelease:.35,velAmp:.7,velFilter:.5,lfo1Rate:5,lfo1Pitch:6,volume:.6,chorusMix:.25,reverbMix:.15}},
 {name:'Sub Foundation',category:'bass',styles:['deep','clean'],colour:'#2f7a6d',note:'A sine with a touch of triangle underneath a soft saw; the filter stays low and closes on release.',
  waves:[shape('sine'),shape('tri'),shape('saw'),shape('sinesq')],
  values:{joyX:-.7,joyY:.15,coarse3:-12,cutoff:520,res:.15,filterEnv:.35,fDecay:.25,fSustain:.4,keyFollow:.3,aAttack:.003,aDecay:.3,aSustain:.9,aRelease:.15,drive:.15,volume:.62}},
 {name:'Wobble',category:'bass',styles:['lfo','resonant'],colour:'#3f6b4f',note:'A saw and a square through a resonant ladder that an LFO opens and closes; the same LFO nudges the joystick.',
  waves:[shape('saw'),shape('square'),shape('saw'),shape('pulse',.3)],
  values:{joyX:.5,joyY:-.2,filterType:0,cutoff:380,res:.45,filterEnv:.1,keyFollow:.6,lfo1Rate:2.5,lfo1Shape:1,lfo1Cut:.55,lfo1X:.25,aAttack:.002,aDecay:.2,aSustain:.9,aRelease:.12,drive:.3,uniVoices:2,uniDetune:12,volume:.55}},
 {name:'Pluck Frame',category:'plucks',styles:['plucked','bright'],colour:'#a8784a',note:'A saw and a square with a quick filter drop and a vector that falls to a dull wave as the note decays.',
  waves:[shape('saw'),shape('square'),shape('tri'),shape('sine')],
  values:{joyX:.6,joyY:.2,vecX:-1,vecY:-.6,vAttack:.001,vDecay:.35,vSustain:0,cutoff:1400,res:.2,filterEnv:.6,fAttack:.001,fDecay:.28,fSustain:0,keyFollow:.8,aAttack:.001,aDecay:.55,aSustain:0,aRelease:.2,velAmp:.5,velFilter:.4,volume:.62,reverbMix:.12}},
 {name:'Formant Choir',category:'voices',styles:['vowel','morph'],colour:'#c25b8f',note:'Four spectra with energy in the places vowels have it; the joystick, an LFO and a slow envelope morph between them.',
  waves:[harmonics(peaks(40,[[3,1],[9,.7]],1.6)),harmonics(peaks(40,[[2,1],[12,.5]],1.4)),harmonics(peaks(40,[[4,1],[7,.9]],1.3)),harmonics(peaks(40,[[2,.8],[5,.8],[16,.4]],1.5))],
  values:{joyX:0,joyY:0,vecX:.7,vecY:-.5,vAttack:1.2,vDecay:2,vSustain:.7,lfo1Rate:.3,lfo1Shape:1,lfo1X:.4,lfo1Y:.4,lfo1Pitch:8,lfo2Rate:5.2,lfo2Pitch:10,uniVoices:3,uniDetune:9,uniSpread:.6,cutoff:5200,res:.08,aAttack:.45,aDecay:1,aSustain:.9,aRelease:.8,keyFollow:.5,volume:.55,reverbMix:.3}},
 {name:'Wide Strings',category:'pads',styles:['strings','unison'],colour:'#5b8fd9',note:'Seven detuned saws blended with a thin pulse; slow attack and a filter that never quite closes.',
  waves:[shape('saw'),shape('pulse',.125),shape('saw'),shape('tri')],
  values:{joyX:.1,joyY:.2,uniVoices:7,uniDetune:28,uniSpread:1,cutoff:3600,res:.08,filterEnv:.2,fAttack:.8,fDecay:1.5,fSustain:.75,keyFollow:.6,aAttack:.55,aDecay:1,aSustain:.9,aRelease:.9,lfo1Rate:5.8,lfo1Pitch:5,volume:.45,chorusMix:.3,reverbMix:.3}},
 {name:'Drawbar Organ',category:'keys',styles:['organ','additive'],colour:'#7fb36a',note:'Four additive spectra in the manner of a drawbar organ: the joystick moves between registrations.',
  waves:[harmonics([1,0,.8,0,0,0,0,.4]),harmonics([1,.6,.9,0,.6,0,0,.3]),harmonics([1,.2,.4,.7,0,.8,0,.5,0,.3]),harmonics([.4,1,0,.8,0,.6,0,.5])],
  values:{joyX:.2,joyY:.2,keyFollow:1,cutoff:9000,res:.05,aAttack:.004,aDecay:.1,aSustain:1,aRelease:.08,lfo1Rate:6.2,lfo1Shape:0,lfo1Pitch:5,lfo1Amp:.12,volume:.55,chorusMix:.3}},
 {name:'Reed',category:'winds',styles:['reedy','breathy'],colour:'#c8792b',note:'Odd harmonics with a nasal peak, a little vibrato after a delay and a filter that opens with the breath.',
  waves:[harmonics(odd(40,h=>h**-1.2)),harmonics(peaks(40,[[3,1],[7,.6],[11,.4]],1.5)),shape('square'),harmonics(all(40,h=>h**-1.6))],
  values:{joyX:-.2,joyY:.4,filterType:1,cutoff:2400,res:.3,filterEnv:.35,fAttack:.12,fDecay:.4,fSustain:.6,keyFollow:.7,aAttack:.07,aDecay:.2,aSustain:.9,aRelease:.2,lfo1Rate:5.2,lfo1Pitch:14,velFilter:.4,volume:.55}},
 {name:'Ice Pad',category:'pads',styles:['bright','airy'],colour:'#8fc7d9',note:'Bright, almost-sine spectra a fifth and an octave apart under a high-pass filter; the vector drifts slowly.',
  waves:[harmonics(all(30,h=>h<4?.3:h**-.7)),shape('sine'),harmonics(odd(30,h=>h**-.8)),shape('tri')],
  values:{joyX:-.3,joyY:.1,coarse2:7,coarse4:12,vecX:.9,vecY:.7,vAttack:4,vDecay:4,vSustain:.5,lfo1Rate:.12,lfo1Shape:1,lfo1X:.45,lfo2Rate:.07,lfo2Y:.4,uniVoices:5,uniDetune:24,uniSpread:1,filterType:3,cutoff:600,res:.1,aAttack:1.6,aDecay:2,aSustain:.9,aRelease:2.4,keyFollow:.4,volume:.42,reverbMix:.4,chorusMix:.35}},
 {name:'Morph Drone',category:'texture',styles:['drone','evolving'],colour:'#8a8f96',note:'A held drone: two LFOs at unrelated rates drive both joystick axes across four dissimilar waves.',
  waves:[harmonics(all(40,h=>h**-.9)),harmonics(odd(40,h=>h**-0.6)),shape('pulse',.1),harmonics(peaks(40,[[5,1],[14,.8]],1.6))],
  values:{joyX:0,joyY:0,lfo1Rate:.071,lfo1Shape:0,lfo1X:1,lfo1Y:.35,lfo2Rate:.043,lfo2Shape:1,lfo2X:.4,lfo2Y:1,lfo1Cut:.2,uniVoices:3,uniDetune:10,cutoff:2400,res:.2,keyFollow:.5,aAttack:2.5,aDecay:2,aSustain:1,aRelease:3,volume:.5,reverbMix:.4}},
];

export const CATEGORIES=[
 {id:'leads',label:'Leads',blurb:'Solo lines'},
 {id:'pads',label:'Pads',blurb:'Slow, wide and evolving'},
 {id:'keys',label:'Keys',blurb:'Struck and additive'},
 {id:'bells',label:'Bells',blurb:'Inharmonic and struck'},
 {id:'bass',label:'Bass',blurb:'Low end'},
 {id:'plucks',label:'Plucks',blurb:'Short and bright'},
 {id:'voices',label:'Voices',blurb:'Vowels and formants'},
 {id:'winds',label:'Winds',blurb:'Reeds and breath'},
 {id:'texture',label:'Textures',blurb:'Drones and motion'},
 {id:'init',label:'Init',blurb:'Neutral starting points'},
 ...BANK_CATEGORIES,
];

export const PRESETS=[...RAW,...BANK].map(p=>({...p,values:sanitize(p.values)}));
