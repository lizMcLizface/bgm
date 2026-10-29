// Level measurement: each instrument plays one held note per slot (a major triad per slot for the chord pass),
// rendered offline, and three windows of every slot are read as dBFS.
export const NOTES=Array.from({length:16},(_,i)=>Math.round(21+i*87/15)); // A0 to C8 in 16 even steps (about every sixth key)
export const VELOCITIES=[['low','Low',.25],['mid','Half',.5],['full','Full',1]];
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
// A-weighting (IEC 61672) as three biquads from the analog poles, bilinear-transformed and scaled to 0 dB at 1 kHz.
const POLES=[20.598997,107.65265,737.86223,12194.217];
function biquad(b,a,sampleRate){
 const c=2*sampleRate,[b2,b1,b0]=b,[a2,a1,a0]=a;
 const n0=b2*c*c+b1*c+b0,n1=2*(b0-b2*c*c),n2=b2*c*c-b1*c+b0,d0=a2*c*c+a1*c+a0,d1=2*(a0-a2*c*c),d2=a2*c*c-a1*c+a0;
 return {b:[n0/d0,n1/d0,n2/d0],a:[d1/d0,d2/d0]};
}
function aSections(sampleRate){
 const [w1,w2,w3,w4]=POLES.map(f=>2*Math.PI*f);
 return [biquad([1,0,0],[1,2*w1,w1*w1],sampleRate),biquad([1,0,0],[1,w2+w3,w2*w3],sampleRate),biquad([0,0,1],[1,2*w4,w4*w4],sampleRate)];
}
function runSections(sections,input,gain){
 let x=input;
 for(const {b,a} of sections){const y=new Float64Array(x.length);let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<x.length;i++){const v=b[0]*x[i]+b[1]*x1+b[2]*x2-a[0]*y1-a[1]*y2;x2=x1;x1=x[i];y2=y1;y1=v;y[i]=v;}x=y;}
 return gain===1?x:x.map(v=>v*gain);
}
const gainCache=new Map();
export function aWeight(signal,sampleRate){
 const sections=aSections(sampleRate);
 if(!gainCache.has(sampleRate)){const n=sampleRate,tone=Float64Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*1000*i/sampleRate)),out=runSections(sections,tone,1);let p=0;for(let i=n>>1;i<n;i++)p+=out[i]*out[i];gainCache.set(sampleRate,1/Math.sqrt(p/(n-(n>>1))*2));}
 return runSections(sections,signal,gainCache.get(sampleRate));
}
// Per note slot: the three windows unweighted (dBFS) and A-weighted (under .a, dB relative to full scale).
export function levelsFromChannels(left,right,sampleRate,count=NOTES.length){
 const weighted=[aWeight(left,sampleRate),aWeight(right,sampleRate)],out={attack:[],hold:[],average:[],a:{attack:[],hold:[],average:[]}};
 for(let i=0;i<count;i++)for(const [key] of METRICS){
  const [from,to]=WINDOWS[key],t=i*SLOT+START,a=(t+from)*sampleRate,b=(t+to)*sampleRate;
  out[key].push(windowDb(left,right,a,b));out.a[key].push(windowDb(weighted[0],weighted[1],a,b));
 }
 return out;
}
// Levels of one kind (dBFS or dBA) for a measurement, or undefined when that kind was not measured.
export const pick=(levels,metric,weighted)=>weighted?levels?.a?.[metric]:levels?.[metric];
export const powerMean=values=>10*Math.log10(values.reduce((sum,x)=>sum+10**(x/10),0)/values.length);
// One number per portion for an instrument (power mean over the keyboard, dBA), and "peak": each note at its loudest portion.
export function summarise(levels,weighted=true){
 const get=m=>pick(levels,m,weighted);if(!get('attack'))return null;
 const peaks=get('attack').map((_,i)=>Math.max(get('attack')[i],get('hold')[i],get('average')[i]));
 return {attack:powerMean(get('attack')),hold:powerMean(get('hold')),average:powerMean(get('average')),peak:powerMean(peaks)};
}
// FNV-1a over the text: enough to tell whether a voice's definition changed since it was measured.
export function hashText(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');}
