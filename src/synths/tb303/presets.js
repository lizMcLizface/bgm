// Factory sounds: panel settings in the acid-bass idiom, plus starter lines.
import {sanitize} from './params';

const RAW=[
 {name:'Acid',category:'acid',styles:['classic'],colour:'#e0a526',note:'The classic: saw, resonant filter, a swept envelope.',values:{cutoff:420,resonance:.72,envMod:.75,decay:.32,accent:.6,drive:.25,reverbMix:.1}},
 {name:'Squelch',category:'acid',styles:['resonant'],colour:'#c8452b',note:'Near self-oscillation with a short sweep; hits hard on accents.',values:{cutoff:330,resonance:.9,envMod:.85,decay:.22,accent:.85,drive:.4,reverbMix:.08}},
 {name:'Sub',category:'bass',styles:['deep', 'round'],colour:'#5b8fd9',note:'Square wave, closed filter, long and round.',values:{wave:1,cutoff:200,resonance:.25,envMod:.35,decay:.6,accent:.4,drive:.1,reverbMix:.05}},
 {name:'Open',category:'bass',styles:['bright'],colour:'#7fd0c8',note:'A bright, open saw with a gentle envelope.',values:{cutoff:1400,resonance:.35,envMod:.4,decay:.5,accent:.5,drive:.15,reverbMix:.15}},
 {name:'Rubber',category:'bass',styles:['slides'],colour:'#e86a92',note:'Slow slides and a rubbery, mid-resonant square.',values:{wave:1,cutoff:520,resonance:.55,envMod:.6,decay:.4,slide:.03,accent:.5,drive:.3,reverbMix:.1}},
 {name:'Screamer',category:'acid',styles:['driven', 'shrill'],colour:'#9b7fd1',note:'Driven and shrill: the accents scream.',values:{cutoff:700,resonance:.82,envMod:.9,decay:.28,accent:1,drive:.75,reverbMix:.12}},
];
/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'acid',label:'Acid',blurb:'Resonant, accented squelch'},
 {id:'bass',label:'Bass',blurb:'Rounder lines: sub, rubber, open'},
];
export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));

// A step is a token: "-" rest, "_" tie, or a note (C C# D … B) with "^" an octave up, "v" down,
// "*" accent, "~" slide into the next note.
export const SEMITONE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export function parseStep(token){
 if(token==='-')return {kind:0,note:0,flags:0};
 if(token==='_')return {kind:2,note:0,flags:0};
 const m=/^([A-G])(#?)(\^|v)?(\*)?(~)?$/.exec(token);
 if(!m)return {kind:0,note:0,flags:0};
 return {kind:1,note:SEMITONE[m[1]]+(m[2]?1:0),flags:(m[3]==='^'?4:m[3]==='v'?8:0)|(m[4]?1:0)|(m[5]?2:0)};
}
export const LINES=[
 {name:'Acid walk',steps:'C* - C C^ - C* D# - C - C^* G~ F - C* -'},
 {name:'Rolling',steps:'C C - C C^* - C C - D# C* - C F~ G* C'},
 {name:'Octave jumps',steps:'C C^ C C^* C C^ C C^~ G G^ G G^* F F^ F D#*'},
 {name:'Slow bounce',steps:'C* _ _ - D#~ F _ - G* _ - C - C^ A#~ G'},
];
export const emptyStep=()=>({kind:0,note:0,flags:0});
export const emptyPattern=()=>Array.from({length:16},emptyStep);
export const validPattern=p=>Array.isArray(p)&&p.length===16&&p.every(s=>s&&Number.isInteger(s.kind)&&Number.isInteger(s.note)&&Number.isInteger(s.flags));
export const linePattern=line=>line.steps.split(/\s+/).slice(0,16).map(parseStep);
/** Engine word for a step: kind + 4 * note + 256 * flags. */
export const stepWord=s=>s.kind+4*s.note+256*s.flags;
export const patternCommands=(index,pattern)=>[[7,index,0],...pattern.flatMap((s,i)=>s.kind?[[1,index*16+i,stepWord(s)]]:[])];
