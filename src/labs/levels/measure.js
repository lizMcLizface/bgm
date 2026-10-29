// Level measurement: each instrument plays one held note per slot (a major triad per slot for the chord pass),
// rendered offline, and three windows of every slot are read as dBFS.
export const NOTES=Array.from({length:16},(_,i)=>Math.round(21+i*87/15)); // A0 to C8 in 16 even steps (about every sixth key)
export const VELOCITIES=[['low','Low',.25],['mid','Mid',.6],['full','Full',1]];
export const METRICS=[['attack','Directly after the press'],['hold','After 1 s held'],['average','Average while held']];
export const SLOT=2.4,HOLD=1.5,START=.05,SAMPLE_RATE=44100,FLOOR=-120;
const WINDOWS={attack:[0,.15],hold:[1,1.25],average:[0,HOLD]};
// A triad built on the root, dropped an octave when it would run off the top of the keyboard.
export const chordFor=root=>{const base=root+7>108?root-12:root;return [base,base+4,base+7];};
export function windowDb(left,right,from,to){
 const a=Math.max(0,Math.floor(from)),b=Math.min(left.length,Math.floor(to));if(b<=a)return FLOOR;
 let power=0;for(let i=a;i<b;i++)power+=left[i]*left[i]+right[i]*right[i];
 return Math.max(FLOOR,Math.round(10*10*Math.log10(power/(2*(b-a))+1e-12))/10);
}
export function levelsFromChannels(left,right,sampleRate,count=NOTES.length){
 const out={attack:[],hold:[],average:[]};
 for(let i=0;i<count;i++)for(const [key] of METRICS){const [from,to]=WINDOWS[key],t=i*SLOT+START;out[key].push(windowDb(left,right,(t+from)*sampleRate,(t+to)*sampleRate));}
 return out;
}
// FNV-1a over the text: enough to tell whether a voice's definition changed since it was measured.
export function hashText(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');}
