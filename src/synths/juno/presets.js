// Factory sounds: original patches in the Juno-106 idiom, not copies of its
// factory banks or of any recording. Each is a set of overrides on the defaults.
import {sanitize} from './params';
import {bookEngineValues} from './book';
import {BOOK_SOUNDS} from './bookPresets';

const RAW=[
 {name:'Classic Pad',category:'pads',styles:['warm', 'chorus'],colour:'#5b8fd9',note:'Saw and pulse with slow LFO width movement through chorus II.',values:{
  saw:1,pulse:1,pwm:.55,pwmSource:0,sub:.3,lfoRate:.7,cutoff:1800,res:.15,env:0.107,kybd:.5,attack:.45,decay:2.2,sustain:.8,release:1.6,
  chorus:2,velVcf:.25,velVca:.3,reverbMix:.3,reverbDecay:4.5,volume:.68}},
 {name:'Brass Section',category:'brass',styles:['velocity'],colour:'#e0a526',note:'Saw brass; velocity opens the filter.',values:{
  saw:1,sub:.25,cutoff:480,res:.2,env:0.279,kybd:.6,attack:.035,decay:.8,sustain:.6,release:.3,chorus:1,velVcf:.55,velVca:.35,
  reverbMix:.2,volume:.78}},
 {name:'Bass 106',category:'bass',styles:['round', 'punchy'],colour:'#3f6b4f',note:'Pulse and sub at 16 feet with the bass-boost high-pass.',values:{
  range:0,saw:0,pulse:1,pwm:.3,pwmSource:1,sub:.85,hpf:0,cutoff:260,res:.35,env:0.229,kybd:.4,attack:.0015,decay:.4,sustain:.35,release:.1,
  chorus:0,velVcf:.4,velVca:.4,voices:4,reverbMix:.04,volume:.66}},
 {name:'Thin Strings',category:'pads',styles:['bright', 'chorus'],colour:'#7fd0c8',note:'Bright, thin ensemble strings: LFO width modulation, high-pass at 2, chorus I.',values:{
  saw:1,pulse:1,pwm:.6,pwmSource:0,lfoRate:.9,hpf:2,cutoff:3600,res:.05,env:0.05,kybd:.7,attack:.5,decay:2,sustain:.9,release:1.5,
  chorus:1,velVcf:.2,velVca:.25,voices:8,reverbMix:.32,reverbDecay:4,volume:.7}},
 {name:'Chorus Organ',category:'organ',styles:['organ', 'chorus'],colour:'#8a8f98',note:'Square and sub with the VCA in gate mode and the fast I+II chorus.',values:{
  saw:0,pulse:1,pwm:0,pwmSource:1,sub:.55,hpf:2,cutoff:5200,res:0,env:0,kybd:1,vcaMode:1,sustain:1,chorus:3,velVcf:0,velVca:0,
  voices:8,reverbMix:.25,volume:.49}},
 {name:'Pluck Arp',category:'fx',styles:['resonant', 'rhythmic'],colour:'#e86a92',note:'Resonant envelope pluck; play it fast.',values:{
  saw:1,sub:.3,cutoff:380,res:.48,env:0.3,kybd:.7,attack:.0015,decay:.45,sustain:0,release:.28,chorus:1,velVcf:.6,velVca:.5,
  level:1,reverbMix:.22,volume:.9}},
 {name:'Filter Whistle',category:'lead',styles:['resonant', 'whistle'],colour:'#f3d38a',note:'No oscillators at all: the self-oscillating filter tracks the keyboard and sings.',values:{
  saw:0,pulse:0,sub:0,noise:0,cutoff:262,res:1,env:0,kybd:1,attack:.03,decay:1,sustain:1,release:.35,lfoRate:5.2,lfoDelay:.7,lfoVcf:0.014,
  chorus:2,velVcf:0,velVca:.4,voices:6,reverbMix:.35,reverbDecay:5,volume:.51}},
 {name:'Wind Sweep',category:'fx',styles:['noise', 'airy'],colour:'#4a62b8',note:'Filtered noise swept slowly by the LFO.',values:{
  saw:0,noise:1,cutoff:900,res:.72,env:0.121,kybd:.5,lfoRate:.18,lfoVcf:0.4,attack:1,decay:3,sustain:.8,release:2.2,chorus:2,
  velVcf:.2,velVca:.3,reverbMix:.45,reverbDecay:7,volume:1}},
 {name:'Synth Keys',category:'keys',styles:['velocity'],colour:'#d98b4a',note:'A touch-sensitive keyboard tone with a decaying filter.',values:{
  saw:1,pulse:1,pwm:.35,pwmSource:1,cutoff:850,res:.12,env:0.193,kybd:.8,attack:.0015,decay:1.7,sustain:.18,release:.5,chorus:1,
  velVcf:.6,velVca:.65,voices:8,reverbMix:.22,volume:.83}},
 {name:'Hollow Lead',category:'lead',styles:['hollow', 'vibrato'],colour:'#c8452b',note:'Narrow pulse with delayed vibrato; push the touch pad right for more.',values:{
  saw:0,pulse:1,pwm:.72,pwmSource:1,sub:.3,cutoff:2400,res:.3,env:0.071,kybd:.6,lfoRate:5.6,lfoDelay:.55,lfoDco:.18,modDepth:.9,
  attack:.01,decay:1,sustain:.85,release:.35,chorus:0,velVcf:.35,velVca:.35,voices:4,reverbMix:.3,volume:.67}},
 {name:'Inverted Sweep',category:'fx',styles:['sweep'],colour:'#9b6bd6',note:'Negative envelope: the filter closes on the attack and opens as it decays.',values:{
  saw:1,pulse:1,pwm:.4,pwmSource:0,lfoRate:.5,envPolarity:1,cutoff:4200,res:.35,env:0.229,kybd:.5,attack:1.4,decay:4,sustain:.5,release:2,
  chorus:2,velVcf:.1,velVca:.25,reverbMix:.38,reverbDecay:6,volume:.86}},
 {name:'Plain',category:'init',styles:['neutral'],colour:'#c9c3b4',note:'A neutral starting point: one saw, open filter, chorus I.',values:{volume:.71}},
];

/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'pads',label:'Pads & strings',blurb:'Chorused washes and thin ensembles'},
 {id:'brass',label:'Brass',blurb:'Saw brass that opens with velocity'},
 {id:'bass',label:'Bass',blurb:'Pulse, sub and the bass boost'},
 {id:'keys',label:'Keys',blurb:'Pianos, tines, harpsichords and clavs'},
 {id:'organ',label:'Organs',blurb:'Drawbars, pipes, combos and carousels'},
 {id:'bells',label:'Bells & plucks',blurb:'Mallets, chimes, harps and pizzicato'},
 {id:'voices',label:'Winds & reeds',blurb:'Flutes, clarinets, oboes and saxes'},
 {id:'lead',label:'Leads',blurb:'Hollow pulses, bowed solos and the singing filter'},
 {id:'fx',label:'Effects & sweeps',blurb:'Space sounds, creatures, drums and wind'},
 {id:'init',label:'Init',blurb:'Neutral starting points'},
];
// The patch-book sounds (bookPresets.js) through the imported-patch mapping (book.js).
const BOOK=BOOK_SOUNDS.map(({panel,volume,note,...p})=>({...p,note:note??'Read off a panel drawing and approximated.',values:{...bookEngineValues(panel),reverbMix:.15,volume}}));

export const PRESETS=[...RAW,...BOOK].map(p=>({...p,values:sanitize(p.values)}));
