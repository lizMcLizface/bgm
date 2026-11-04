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
 // Fifteen more, for the kinds of sound the Juno's own factory banks had and this set did not: choir, calliope, celeste,
 // steel drum, gong, timpani, accordion, koto, rising and rumbling effects, claps, a low bowed string, a fanfare, and
 // the voice modes (glide and unison).
 {name:'Aah Voices',category:'voices',styles:['vocal','airy'],colour:'#d6849b',note:'Breathy pulse with a little noise and slow width movement; a soft aah.',values:{
  saw:0,pulse:1,pwm:.5,pwmSource:0,noise:.1,sub:.15,lfoRate:.55,lfoDelay:.4,lfoDco:.06,modDepth:.7,hpf:2,cutoff:1500,res:.3,env:.04,kybd:.9,
  attack:.55,decay:1.5,sustain:.85,release:1.1,chorus:2,velVcf:.2,velVca:.25,voices:8,reverbMix:.35,reverbDecay:5,volume:.64}},
 {name:'Fairground',category:'organ',styles:['fairground','pipes'],colour:'#7fb36a',note:'Bright square with chiff from a quick filter pop; hold the gate open.',values:{
  saw:0,pulse:1,pwm:0,pwmSource:1,range:2,noise:.06,sub:.2,hpf:2,cutoff:6500,res:.08,env:.08,kybd:1,vcaMode:1,sustain:1,
  lfoRate:5.8,lfoDelay:.5,lfoDco:.12,chorus:1,velVcf:0,velVca:0,voices:8,reverbMix:.2,volume:0.47}},
 {name:'Glass Celeste',category:'bells',styles:['glassy','high'],colour:'#7fd0c8',note:'Soft pulse bell an octave up with a quick ping and a long glassy tail.',values:{
  saw:0,pulse:1,pwm:.2,pwmSource:1,range:2,cutoff:2800,res:.12,env:.24,kybd:1,attack:.0015,decay:1.5,sustain:0,release:1.6,
  chorus:2,velVcf:.5,velVca:.5,voices:8,reverbMix:.45,reverbDecay:5.5,volume:0.66}},
 {name:'Pan Drum',category:'bells',styles:['steel','tuned'],colour:'#7fd0c8',note:'Hollow tuned pluck with the filter pinging shut; chorus I keeps it dry and bright.',values:{
  saw:0,pulse:1,pwm:.15,pwmSource:1,sub:.25,noise:.04,cutoff:520,res:.45,env:.26,kybd:.9,attack:.0015,decay:.38,sustain:0,release:.3,
  chorus:1,velVcf:.5,velVca:.55,voices:8,reverbMix:.3,level:1,volume:0.94}},
 {name:'Temple Gong',category:'fx',styles:['metal','long'],colour:'#9b6bd6',note:'Noise and a low square through a ringing filter that sweeps shut over seconds.',values:{
  saw:0,pulse:1,pwm:.5,pwmSource:1,range:0,sub:.8,noise:.35,hpf:1,cutoff:320,res:.78,env:.36,kybd:.3,attack:.0015,decay:6,sustain:0,release:5,
  chorus:2,velVcf:.5,velVca:.5,voices:4,reverbMix:.5,reverbDecay:8,volume:0.62}},
 {name:'Kettle Drum',category:'fx',styles:['drum','low'],colour:'#9b6bd6',note:'A low pulse thump with a short resonant drop; play it low.',values:{
  saw:0,pulse:1,pwm:.5,pwmSource:1,range:0,sub:.9,noise:.1,hpf:0,cutoff:180,res:.5,env:.3,kybd:.35,attack:.0015,decay:.5,sustain:0,release:.4,
  chorus:0,velVcf:.5,velVca:.6,voices:3,reverbMix:.25,level:1,volume:.8}},
 {name:'Squeeze Box',category:'organ',styles:['reed','folk'],colour:'#7fb36a',note:'Saw and pulse beating together through the faster chorus; a reed bellows swell.',values:{
  saw:1,pulse:1,pwm:.4,pwmSource:0,lfoRate:.35,sub:.2,hpf:2,cutoff:2600,res:.15,env:.05,kybd:.8,attack:.06,decay:.6,sustain:.9,release:.12,
  chorus:3,velVcf:.25,velVca:.3,voices:8,reverbMix:.2,volume:0.79}},
 {name:'Zither',category:'bells',styles:['plucked','bright'],colour:'#7fd0c8',note:'A fast bright saw pluck with a touch of noise on the attack; strummed strings.',values:{
  saw:1,pulse:0,noise:.05,hpf:2,cutoff:700,res:.3,env:.32,kybd:.8,attack:.0015,decay:.7,sustain:0,release:.5,
  chorus:1,velVcf:.6,velVca:.5,voices:8,reverbMix:.3,level:1,volume:1}},
 {name:'Rising Sweep',category:'fx',styles:['riser','resonant'],colour:'#9b6bd6',note:'Resonant noise and saw: the filter climbs for seconds, then falls away.',values:{
  saw:1,noise:.45,hpf:2,cutoff:220,res:.7,env:.3,kybd:.2,attack:3,decay:1.8,sustain:.3,release:1.5,lfoRate:.25,lfoVcf:.1,
  chorus:2,velVcf:0,velVca:.2,voices:6,reverbMix:.45,reverbDecay:6,volume:0.95}},
 {name:'Rumble',category:'fx',styles:['storm','noise'],colour:'#9b6bd6',note:'Low filtered noise, slowly churning; play low and hold.',values:{
  saw:0,noise:1,range:0,hpf:0,cutoff:420,res:.3,env:.12,kybd:.2,attack:.8,decay:4,sustain:.6,release:3,lfoRate:.4,lfoVcf:.3,
  chorus:0,velVcf:0,velVca:.3,voices:4,reverbMix:.45,reverbDecay:7,level:1,volume:1}},
 {name:'Clap',category:'fx',styles:['percussion','noise'],colour:'#9b6bd6',note:'A burst of band-passed noise with a very short envelope.',values:{
  saw:0,noise:1,hpf:3,cutoff:3600,res:.5,env:.1,kybd:.2,attack:.0015,decay:.3,sustain:.25,release:.25,
  chorus:0,velVcf:.3,velVca:.5,voices:6,reverbMix:.3,reverbDecay:2,level:1,volume:1}},
 {name:'Low Bow',category:'pads',styles:['cello','slow'],colour:'#5b8fd9',note:'A single dark bowed line: saw with slow attack and delayed vibrato.',values:{
  saw:1,pulse:0,range:0,sub:.2,pwm:0,lfoRate:5.2,lfoDelay:.6,lfoDco:.14,modDepth:.8,hpf:1,cutoff:900,res:.12,env:.1,kybd:.7,
  attack:.18,decay:1.2,sustain:.85,release:.4,chorus:1,velVcf:.4,velVca:.4,voices:3,reverbMix:.3,volume:0.68}},
 {name:'Herald',category:'brass',styles:['fanfare','bold'],colour:'#e0a526',note:'Octave-up saw brass with a pushed attack; a short fanfare tone.',values:{
  saw:1,pulse:1,pwm:.1,pwmSource:1,range:2,sub:.15,cutoff:520,res:.18,env:.3,kybd:.6,attack:.03,decay:.5,sustain:.7,release:.25,
  lfoRate:5,lfoDelay:.5,lfoDco:.05,chorus:1,velVcf:.6,velVca:.4,voices:6,reverbMix:.3,volume:0.76}},
 {name:'Glide Lead',category:'lead',styles:['portamento','mono'],colour:'#c8452b',note:'One voice sliding between notes with portamento; play it legato.',values:{
  saw:1,pulse:1,pwm:.3,pwmSource:1,sub:.2,cutoff:2200,res:.28,env:.14,kybd:.7,attack:.005,decay:.7,sustain:.8,release:.25,
  lfoRate:5.4,lfoDelay:.45,lfoDco:.12,porta:1,portaTime:.25,voices:1,chorus:1,velVcf:.4,velVca:.3,reverbMix:.25,volume:0.93}},
 {name:'Unison Stack',category:'lead',styles:['unison','fat'],colour:'#c8452b',note:'Every voice on one key, detuned: a thick monophonic saw.',values:{
  saw:1,pulse:0,sub:.25,cutoff:1800,res:.22,env:.18,kybd:.7,attack:.005,decay:.9,sustain:.7,release:.3,
  unison:1,unisonDetune:.45,voices:6,chorus:2,velVcf:.4,velVca:.3,reverbMix:.25,level:1,volume:0.81}},
];

/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'pads',colour:'#5b8fd9',label:'Pads & strings',blurb:'Chorused washes and thin ensembles'},
 {id:'brass',colour:'#e0a526',label:'Brass',blurb:'Saw brass that opens with velocity'},
 {id:'bass',colour:'#3f9b6a',label:'Bass',blurb:'Pulse, sub and the bass boost'},
 {id:'keys',colour:'#d98b4a',label:'Keys',blurb:'Pianos, tines, harpsichords and clavs'},
 {id:'organ',colour:'#7fb36a',label:'Organs',blurb:'Drawbars, pipes, combos and carousels'},
 {id:'bells',colour:'#7fd0c8',label:'Bells & plucks',blurb:'Mallets, chimes, harps and pizzicato'},
 {id:'voices',colour:'#d6849b',label:'Winds & reeds',blurb:'Flutes, clarinets, oboes and saxes'},
 {id:'lead',colour:'#c8452b',label:'Leads',blurb:'Hollow pulses, bowed solos and the singing filter'},
 {id:'fx',colour:'#9b6bd6',label:'Effects & sweeps',blurb:'Space sounds, creatures, drums and wind'},
 {id:'init',colour:'#c9c3b4',label:'Init',blurb:'Neutral starting points'},
];
// The patch-book sounds (bookPresets.js) through the imported-patch mapping (book.js).
const BOOK=BOOK_SOUNDS.map(({panel,volume,note,...p})=>({...p,note:note??'Read off a panel drawing and approximated.',values:{...bookEngineValues(panel),reverbMix:.15,volume}}));

export const PRESETS=[...RAW,...BOOK].map(p=>({...p,values:sanitize(p.values)}));
