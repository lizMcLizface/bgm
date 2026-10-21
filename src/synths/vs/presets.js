// Factory sounds: original programs in the vector-synthesis idiom, built on the built-in waves
// (not copies of Sequential's programs: those load from your own .syx and wave files on the
// "VS programs" shelf). Each is a set of overrides on the defaults; `at` puts every mix-envelope
// point at one vector position.
import {sanitize,engineValues} from './params';
import {SUITE,SUITE_FIELDS} from './suitePresets';
import {generateProgram} from './generate';

const point=(i,x,y)=>({['mixX'+i]:x,['mixY'+i]:y});
const path=(...points)=>Object.assign({},...points.map(([x,y],i)=>point(i,x,y)));

const RAW=[
 {name:'Vector Pad',category:'vector',styles:['evolving', 'digital'],colour:'#9b7fd1',note:'The mix envelope loops back and forth around the diamond: a pad that never quite repeats.',values:{
  waveA:33,waveB:48,waveC:64,waveD:80,coarseB:12,coarseD:7,fineC:30,...path([-64,0],[0,-64],[63,0],[0,63],[-64,0]),
  mixRate1:37,mixRate2:37,mixRate3:37,mixRate4:29,mixRate4A:29,mixLoop:4,
  cutoff:70,resonance:12,filterEnvAmount:20,filterLevel1:80,filterLevel2:50,filterLevel3:60,filterRate1:49,filterRate2:49,filterRate3:39,
  ampRate1:44,ampRate2:19,ampRate3:19,ampRate4:44,ampLevel0:0,ampLevel1:99,ampLevel2:90,ampLevel3:95,
  unison:2,pan0:-50,pan1:50,pan2:-35,pan3:35,pan4:-20,pan5:20,pan6:-10,pan7:10,chorusMix:.5,reverbMix:.25,volume:34}},
 {name:'Glass Bell',category:'bells',styles:['glassy', 'bell'],colour:'#a7c4d9',note:'Inharmonic partials from two high waves, struck: a bright bell that darkens as it rings.',values:{
  waveA:32,waveB:96,waveC:100,waveD:36,coarseB:19,coarseC:24,coarseD:12,fineC:12,...path([-20,-20],[10,-30],[20,10],[0,0],[0,0]),
  mixRate1:19,mixRate2:39,mixRate3:39,cutoff:85,filterEnvAmount:30,filterLevel0:99,filterLevel1:60,filterLevel2:30,filterLevel3:10,filterRate1:0,filterRate2:39,filterRate3:39,
  ampRate1:0,ampRate2:49,ampRate3:49,ampRate4:44,ampLevel0:0,ampLevel1:99,ampLevel2:35,ampLevel3:0,reverbMix:.35,volume:70}},
 {name:'Sweep',category:'vector',styles:['sweep'],colour:'#c8452b',note:'One slow sweep along the vector from a thin wave to a bright one, and a filter that opens with it.',values:{
  waveA:3,waveB:12,waveC:28,waveD:60,coarseC:12,...path([-64,0],[-20,-30],[30,-10],[63,0],[63,0]),
  mixRate1:44,mixRate2:44,mixRate3:44,cutoff:45,filterEnvAmount:70,filterLevel0:0,filterLevel1:70,filterLevel2:90,filterLevel3:99,filterRate1:44,filterRate2:39,filterRate3:39,
  ampRate1:39,ampRate2:0,ampRate3:0,ampRate4:39,ampLevel0:0,ampLevel1:99,ampLevel2:99,ampLevel3:99,resonance:25,pan0:-30,pan1:30,pan2:-30,pan3:30,chorusMix:.4,reverbMix:.2,volume:24}},
 {name:'Digital Brass',category:'brass',styles:['brass', 'digital'],colour:'#e0a526',note:'A square-ish and a saw-ish wave with a quick opening filter and velocity.',values:{
  waveA:20,waveB:2,waveC:34,waveD:6,coarseB:12,...path([-30,10],[-10,0],[0,0],[0,0],[0,0]),
  cutoff:30,filterEnvAmount:75,filterLevel0:0,filterLevel1:99,filterLevel2:70,filterLevel3:60,filterRate1:19,filterRate2:39,filterRate3:29,filterRate4:39,
  ampRate1:14,ampRate2:0,ampRate3:0,ampRate4:39,ampLevel0:0,ampLevel1:99,ampLevel2:99,ampLevel3:92,velocityAmount:60,velocityDest:1,
  lfo1Rate:48,lfo1Amount:12,lfo1Dest:1,modWheelDest:1,chorusMix:.3,reverbMix:.15,volume:30}},
 {name:'Formant Choir',category:'voices',styles:['vowel', 'choir'],colour:'#7fd0c8',note:'Formant waves with a slow vector drift and vibrato from the wheel.',values:{
  waveA:36,waveB:41,waveC:50,waveD:57,coarseC:12,...path([-30,-30],[30,-20],[10,30],[-30,10],[0,0]),
  mixRate1:51,mixRate2:51,mixRate3:51,mixRate4:39,mixRate4A:39,mixLoop:5,cutoff:75,resonance:8,
  ampRate1:49,ampRate2:0,ampRate3:0,ampRate4:49,ampLevel0:0,ampLevel1:99,ampLevel2:99,ampLevel3:99,unison:1,
  lfo1Shape:0,lfo1Rate:48,lfo1Amount:20,lfo1Dest:15,modWheelDest:1,chorusMix:.5,reverbMix:.3,volume:42}},
 {name:'Pluck Stack',category:'plucks',styles:['short'],colour:'#e86a92',note:'Short decaying pluck: a filter and a mix point that move once, then settle.',values:{
  waveA:1,waveB:5,waveC:17,waveD:9,coarseB:12,coarseC:7,...path([-64,0],[0,-40],[20,20],[0,0],[0,0]),
  mixRate1:0,mixRate2:14,mixRate3:14,cutoff:30,resonance:25,filterEnvAmount:70,filterLevel0:99,filterLevel1:50,filterLevel2:20,filterLevel3:10,filterRate1:0,filterRate2:24,filterRate3:29,
  ampRate1:0,ampRate2:29,ampRate3:29,ampRate4:39,ampLevel0:0,ampLevel1:99,ampLevel2:25,ampLevel3:0,velocityAmount:70,velocityDest:9,chorusMix:.25,reverbMix:.25,volume:99}},
 {name:'Rhythmic Gate',category:'plucks',styles:['rhythmic', 'looping'],colour:'#d98b4a',note:'A looping amplifier envelope pulses the sound while the key is held.',values:{
  waveA:18,waveB:34,waveC:52,waveD:20,coarseB:12,...path([-64,0],[0,-64],[63,0],[0,63],[0,0]),
  mixRate1:29,mixRate2:29,mixRate3:29,mixLoop:4,cutoff:72,
  ampRate1:0,ampRate2:15,ampRate3:7,ampRate4:19,ampLevel0:0,ampLevel1:99,ampLevel2:10,ampLevel3:99,ampLoop:2,chorusMix:.3,reverbMix:.2,volume:33}},
 {name:'Sine Organ',category:'organ',styles:['organ', 'joystick'],colour:'#8a8f98',note:'Four sines an octave apart; the joystick (Joy X/Y, or the vector pad) blends the drawbars.',values:{
  waveA:32,waveB:32,waveC:32,waveD:32,coarseB:12,coarseC:19,coarseD:24,...path([0,0],[0,0],[0,0],[0,0],[0,0]),
  ampRate1:0,ampRate2:0,ampRate3:0,ampRate4:14,ampLevel0:0,ampLevel1:99,ampLevel2:99,ampLevel3:99,cutoff:99,chorusMix:.3,reverbMix:.2,volume:30}},
 {name:'Init',category:'init',styles:['neutral'],colour:'#c9c3b4',note:'A neutral starting point: one saw-like wave through an open filter.',values:{
  ...path([-64,0],[-64,0],[-64,0],[-64,0],[-64,0]),waveA:3,volume:27}},
];

/** This synth's sound categories, in picker order (each sound names one). */
/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'vector',label:'Vector motion',blurb:'Looping and sweeping around the diamond'},
 {id:'pads',label:'Pads',blurb:'Wide, slow and shimmering'},
 {id:'voices',label:'Voices',blurb:'Choirs and vowels'},
 {id:'strings',label:'Strings',blurb:'Digital sections'},
 {id:'bells',label:'Bells & mallets',blurb:'Glass, metal and gamelan'},
 {id:'keys',label:'Keys',blurb:'Tines and electric pianos'},
 {id:'organ',label:'Organs',blurb:'Stops and reeds'},
 {id:'brass',label:'Brass',blurb:'Digital horns'},
 {id:'winds',label:'Winds',blurb:'Flutes and pipes'},
 {id:'plucks',label:'Plucks & gates',blurb:'Struck, plucked and rhythmically gated'},
 {id:'bass',label:'Bass',blurb:'Low end'},
 {id:'lead',label:'Leads',blurb:'Solo lines'},
 {id:'percussion',label:'Percussion',blurb:'Hits and knocks'},
 {id:'fx',label:'Effects',blurb:'Radios, storms, machines and swarms'},
 {id:'init',label:'Init',blurb:'Neutral starting points'},
];
// The VectorVS suite (suitePresets.js): programs generated in the spirit of classic vector-synth banks.
const COLOURS={vector:'#9b7fd1',pads:'#5b8fd9',voices:'#d98bb6',strings:'#7fa8d9',bells:'#8f7fd1',keys:'#e0a526',organ:'#7fb36a',brass:'#c8792b',winds:'#c25b8f',plucks:'#a8784a',bass:'#2f7a6d',lead:'#d9534f',percussion:'#8a8f96',fx:'#4fb3c2'};
const SUITE_SOUNDS=SUITE.map(({program,volume,seed,...p})=>({...p,colour:COLOURS[p.category],note:'Generated in the spirit of classic vector-synth banks.',
 values:{...engineValues(Object.fromEntries(SUITE_FIELDS.map((k,i)=>[k,program[i]]))),reverbMix:.15,volume}}));

// every built-in sound plays on the built-in waves (the page switches back to them)
export const PRESETS=[...RAW,...SUITE_SOUNDS].map(p=>({...p,builtinWaves:true,values:sanitize(p.values)}));

/** A fresh program for a category (the picker's "New" button). */
export const GENERATES=CATEGORIES.map(c=>c.id).filter(id=>id!=='init');
export function generate(category,seed){
 const values=sanitize({...engineValues(generateProgram(category,seed)),reverbMix:.15});
 return {name:`${CATEGORIES.find(c=>c.id===category)?.label??'Sound'} ✦${seed%10000}`,category,styles:['generated'],colour:COLOURS[category]??'#c9c3b4',
  note:'Freshly generated from the vector-synth bank statistics.',builtinWaves:true,values};
}
