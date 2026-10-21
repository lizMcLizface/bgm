// Factory sounds: original patches in the Jupiter-8 idiom, not copies of Roland's
// factory patches (those load from a tape recording on the "JP-8 tape" shelf).
// Each is a set of overrides on the defaults. The single-layer sounds play in Whole
// mode; the last ones use both layers (Split or Dual), as the original's panel presets could.
import {sanitize,intoLayer} from './params';
import {engineValues} from './patch';
import {SHEET_SOUNDS} from './sheetPresets';

const RAW=[
 {name:'Big Brass',category:'brass',styles:['fat', 'swell'],colour:'#e0a526',note:'Two saws a few cents apart, 24 dB filter opened by ENV-1 with a slight swell.',values:{
  vco1Wave:1,vco2Wave:1,vco2Fine:9,sourceMix:.5,cutoff:180,res:.1,slope:1,envMod:.45,envSource:0,keyFollow:.6,
  e1Attack:.08,e1Decay:.8,e1Sustain:.45,e1Release:.4,e2Attack:.04,e2Decay:1,e2Sustain:.85,e2Release:.4,velVcf:.5,velVca:.3,reverbMix:.2,volume:.525}},
 {name:'Swept Sync',category:'lead',styles:['sync', 'sweep'],colour:'#c8452b',note:'VCO-2 synced to VCO-1 and swept up by ENV-1 through VCO modulation.',values:{
  vco1Wave:2,pw:.2,pwSource:1,vco2Wave:1,sync:1,vco2Range:5,vcoModEnv:.45,vcoModDest:2,sourceMix:1,cutoff:600,res:.2,slope:1,envMod:.25,keyFollow:.8,
  e1Attack:.001,e1Decay:1.2,e1Sustain:.2,e1Release:.4,e2Attack:.002,e2Decay:1,e2Sustain:.9,e2Release:.3,lfoRate:5.5,velVcf:.4,velVca:.3,reverbMix:.18,volume:.67}},
 {name:'Wide Strings',category:'strings',styles:['wide'],colour:'#7fd0c8',note:'Saw and LFO-modulated pulse into the brighter 12 dB filter; slow attack.',values:{
  vco1Wave:1,vco2Wave:2,pw:.55,pwSource:0,lfoRate:.7,vco2Fine:12,sourceMix:.5,cutoff:900,res:.05,slope:0,envMod:.1,keyFollow:.6,
  e1Attack:.6,e1Decay:2,e1Sustain:.8,e1Release:1,e2Attack:.7,e2Decay:2,e2Sustain:.9,e2Release:1.3,velVcf:.2,velVca:.25,width:.7,reverbMix:.35,reverbDecay:4.5,volume:.41}},
 {name:'Cross-Mod Bell',category:'bells',styles:['metallic', 'cross-mod'],colour:'#9b7fd1',note:'VCO-2 frequency-modulates VCO-1 for clangorous partials; long decay.',values:{
  vco1Wave:0,vco2Wave:0,vco2Range:19,crossMod:.45,sourceMix:0,cutoff:1400,res:.05,slope:1,envMod:.3,keyFollow:1,
  e1Attack:.001,e1Decay:2,e1Sustain:0,e1Release:1.5,e2Attack:.001,e2Decay:3.5,e2Sustain:0,e2Release:2,e2Key:1,velVcf:.5,velVca:.5,reverbMix:.35,reverbDecay:5,volume:.76}},
 {name:'Funk Clav',category:'keys',styles:['percussive', 'funky'],colour:'#d98b4a',note:'Narrow pulse, resonant 24 dB pluck, fast key-following envelopes.',values:{
  vco1Wave:2,pw:.7,pwSource:1,vco2Wave:2,vco2Range:12,sourceMix:.35,hpf:120,cutoff:300,res:.4,slope:1,envMod:.4,keyFollow:.8,
  e1Attack:.001,e1Decay:.25,e1Sustain:0,e1Release:.1,e1Key:1,e2Attack:.001,e2Decay:.5,e2Sustain:0,e2Release:.12,e2Key:1,velVcf:.6,velVca:.5,reverbMix:.12,volume:1,level:1}},
 {name:'Unison Lead',category:'lead',styles:['unison', 'glide'],colour:'#f3d38a',note:'All voices on one note, detuned, with portamento and delayed vibrato.',values:{
  vco1Wave:1,vco2Wave:1,vco2Fine:7,sourceMix:.5,cutoff:350,res:.25,slope:1,envMod:.3,keyFollow:1,
  e1Attack:.005,e1Decay:.6,e1Sustain:.5,e1Release:.3,e2Attack:.003,e2Decay:.6,e2Sustain:.9,e2Release:.25,
  assign:1,unisonDetune:.35,portamento:.08,lfoRate:5.5,lfoDelay:.6,vcoModLfo:.12,velVcf:.4,velVca:.25,width:.5,reverbMix:.18,volume:.5}},
 {name:'Arp Pluck',category:'motion',styles:['arpeggio', 'rhythmic'],colour:'#e86a92',note:'Arpeggiator up over two octaves; hold the chord. Turn Hold on to latch it.',values:{
  vco1Wave:2,pw:.4,pwSource:1,vco2Wave:1,vco2Range:12,vco2Fine:5,sourceMix:.4,cutoff:250,res:.45,slope:1,envMod:.42,keyFollow:.8,
  e1Attack:.001,e1Decay:.18,e1Sustain:0,e1Release:.15,e2Attack:.001,e2Decay:.3,e2Sustain:0,e2Release:.2,
  arp:1,arpMode:0,arpRange:2,arpRate:9,velVcf:.3,velVca:.2,reverbMix:.25,volume:.79}},
 {name:'Soft Organ',category:'organ',styles:['organ', 'soft'],colour:'#8a8f98',note:'Triangle and sine an octave apart, ENV-2 as an organ gate.',values:{
  vco1Wave:0,vco2Wave:0,vco2Range:12,sourceMix:.45,cutoff:4000,res:0,slope:1,envMod:0,keyFollow:1,
  e2Attack:.004,e2Decay:.4,e2Sustain:1,e2Release:.06,vcaLfo:1,lfoRate:6,velVcf:0,velVca:.15,reverbMix:.25,volume:.42}},
 {name:'Inverted Sweep',category:'motion',styles:['sweep'],colour:'#4a62b8',note:'ENV-1 inverted: the filter dips on the attack and blooms as the note is held.',values:{
  vco1Wave:1,vco2Wave:2,pw:.4,pwSource:0,lfoRate:.5,vco2Fine:10,sourceMix:.5,cutoff:2500,res:.35,slope:1,envMod:.35,e1Invert:1,keyFollow:.5,
  e1Attack:1.2,e1Decay:3,e1Sustain:.4,e1Release:2,e2Attack:.6,e2Decay:3,e2Sustain:.85,e2Release:2,velVcf:.1,velVca:.25,width:.7,reverbMix:.4,reverbDecay:6,volume:.455}},
 {name:'Sample & Hold',category:'motion',styles:['random', 'resonant'],colour:'#3f6b4f',note:'The random LFO steps the resonant filter: classic burbling.',values:{
  vco1Wave:1,vco2Wave:2,vco2Range:-12,sourceMix:.5,cutoff:500,res:.75,slope:1,envMod:.15,keyFollow:.6,
  lfoWave:3,lfoRate:7,vcfLfo:.5,e2Attack:.004,e2Decay:1,e2Sustain:.9,e2Release:.6,velVcf:.2,velVca:.3,reverbMix:.3,volume:.49}},
 {name:'Breath Flute',category:'lead',styles:['breathy', 'vibrato'],colour:'#a7c4d9',note:'Triangle with a little noise through the 12 dB filter, delayed vibrato.',values:{
  vco1Wave:0,vco2Wave:3,sourceMix:.18,cutoff:500,res:.1,slope:0,envMod:.3,keyFollow:1,
  e1Attack:.12,e1Decay:.6,e1Sustain:.7,e1Release:.3,e2Attack:.09,e2Decay:.8,e2Sustain:.95,e2Release:.3,
  lfoRate:5,lfoDelay:.5,vcoModLfo:.1,vcoModDest:0,velVcf:.3,velVca:.4,reverbMix:.3,volume:.59}},
 {name:'Plain',category:'init',styles:['neutral'],colour:'#c9c3b4',note:'A neutral starting point: two saws, 24 dB filter half open.',values:{}},
];

const of=name=>RAW.find(p=>p.name===name).values;
const lower=values=>intoLayer(values,'lower');
const SOLO_BASS={vco1Wave:1,vco1Range:0,vco2Wave:2,vco2Range:-12,pw:.3,pwSource:1,sourceMix:.4,cutoff:120,res:.3,slope:1,envMod:.4,keyFollow:.5,
 e1Attack:.001,e1Decay:.35,e1Sustain:.2,e1Release:.1,e2Attack:.001,e2Decay:.6,e2Sustain:.7,e2Release:.08,assign:0,portamento:.03,velVcf:.5,velVca:.4};
RAW.push(
 {name:'Bass | Strings',category:'layers',styles:['split', 'mono bass'],colour:'#2f7a6d',note:'Split at G3: a solo (mono) bass with a touch of glide below, Wide Strings above.',values:{
  ...of('Wide Strings'),...lower({...SOLO_BASS,volume:.6}),keyMode:2,splitPoint:55}},
 {name:'Brass + Strings',category:'layers',styles:['dual'],colour:'#b5852d',note:'Dual: Big Brass and Wide Strings on every key, sharing the voices 4 + 4.',values:{
  ...of('Wide Strings'),volume:.39,...lower({...of('Big Brass'),volume:.44}),keyMode:1,balance:.5}},
 {name:'Arp | Pad',category:'layers',styles:['split', 'arpeggio'],colour:'#c25b8f',note:'Split at C4: the arpeggiator plays the lower half (hold a chord with the left hand), a soft pad above.',values:{
  ...of('Inverted Sweep'),...lower({...of('Arp Pluck'),volume:.79}),keyMode:2,splitPoint:60}},
);

/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'brass',label:'Brass',blurb:'Fat 24 dB stacks'},
 {id:'lead',label:'Leads',blurb:'Sync, unison and breath'},
 {id:'strings',label:'Strings',blurb:'Sections, ensembles and bowed solos'},
 {id:'keys',label:'Keys',blurb:'Clavs, tines, pianos and harpsichords'},
 {id:'organ',label:'Organs',blurb:'Drawbars, pipes, combos and chorus'},
 {id:'bells',label:'Bells & plucks',blurb:'Cross-mod partials, mallets, chimes and blips'},
 {id:'bass',label:'Bass',blurb:'Pedals and plucked low end'},
 {id:'voices',label:'Winds & voices',blurb:'Reeds, flutes, whistles and choirs'},
 {id:'motion',label:'Arps & motion',blurb:'The arpeggiator, sample & hold, echoes and rhythms'},
 {id:'fx',label:'Effects & scenes',blurb:'Engines, winds, creatures and starships'},
 {id:'layers',label:'Splits & layers',blurb:'Two patches at once: split or dual'},
 {id:'init',label:'Init',blurb:'Neutral starting points'},
];
// The patch-sheet sounds (sheetPresets.js) through the tape decoder's panel → engine mapping.
const ASSIGN={solo:0,unison:1,poly1:2,poly2:3};
const SHEETS=SHEET_SOUNDS.map(({panel,volume,...p})=>({...p,note:'Read off a panel drawing and approximated.',values:{...engineValues(panel),assign:ASSIGN[panel.assign],reverbMix:.15,volume}}));

export const PRESETS=[...RAW,...SHEETS].map(p=>({...p,values:sanitize(p.values)}));
