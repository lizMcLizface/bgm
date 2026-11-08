import {defineParams} from '../params';

const parameters=rows=>defineParams(rows.map(([key,label,min,max,value],id)=>[key,id,label,min,max,value,key==='tone'?'%':'dB','lin']));
export const DRIVE_PEDALS={
 boost:{name:'Clean Boost',colour:'#d8cba2',params:parameters([['gain','Gain',0,24,6]])},
 overdrive:{name:'Overdrive',colour:'#8db174',params:parameters([['drive','Drive',0,36,12],['tone','Tone',0,1,.5],['level','Level',-30,6,-18]])},
 fuzz:{name:'Fuzz',colour:'#c492a9',params:parameters([['drive','Fuzz',0,36,18],['tone','Tone',0,1,.4],['level','Level',-30,6,-21]])},
};
// Static, monotonic clipping curves; drive lives in a smoothed upstream gain.
// Fuzz's unequal transistor-like knees intentionally generate even harmonics.
export function clippingSample(kind,x){return kind==='fuzz'?(x>=0?1-Math.exp(-4*x):-(1-Math.exp(2.6*x))):Math.tanh(2*x)/Math.tanh(2);}
export function clippingCurve(kind,size=8193){return Float32Array.from({length:size},(_,i)=>clippingSample(kind,i/(size-1)*2-1));}
export const toneHz=(kind,tone)=>kind==='fuzz'?650*12**tone:800*10**tone;
