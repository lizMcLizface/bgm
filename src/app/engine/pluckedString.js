import {stringBodyModes} from './stringBody';
// Karplus–Strong loop, rendered ahead of its audio-clock start. No worklet,
// wall-clock envelope or unbounded feedback lives on the main audio thread.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
import { cachedNoteBuffer, noteCacheStats, clearNoteCache } from './noteBufferCache';
export const stringCacheStats=noteCacheStats;
export const clearStringCache=clearNoteCache;

export function renderString(sampleRate,frequency,{decay=2,damping=.5,position=.2,body=.25,resonance=0,bodyType='guitar',seed=1}={}) {
    const sr=clamp(sampleRate,8000,192000),freq=clamp(frequency,10,sr/6);
    decay=clamp(decay,.15,5);damping=clamp(damping,0,1);position=clamp(position,.05,.45);body=clamp(body,0,1);resonance=clamp(resonance,0,1);
    const duration=Math.min(6,Math.max(.35,decay*1.25)),out=new Float32Array(Math.ceil(sr*duration));
    const theta=2*Math.PI*freq/sr,mix=.12+damping*.36;
    const filterDelay=Math.atan2(mix*Math.sin(theta),1-mix+mix*Math.cos(theta))/theta;
    const delay=sr/freq-filterDelay,n=Math.max(2,Math.floor(delay)),fraction=delay-n;
    // Exact all-pass phase correction at the requested fundamental.
    const q=Math.tan(fraction*theta/2)/Math.tan(theta/2),a=(1-q)/(1+q);
    const magnitude=Math.hypot(1-mix+mix*Math.cos(theta),mix*Math.sin(theta));
    const feedback=Math.min(.9997,Math.exp(-Math.log(1000)/(freq*decay))/magnitude);
    const ring=new Float64Array(n),noise=new Float64Array(n);let state=(seed>>>0)||1;
    for(let i=0;i<n;i++){state^=state<<13;state^=state>>>17;state^=state<<5;noise[i]=(state>>>0)/2147483648-1;}
    const pick=Math.max(1,Math.round(position*n));
    for(let i=0;i<n;i++) {
        const phase=i/n,displacement=(phase<position?phase/position:(1-phase)/(1-position))-.5;
        ring[i]=displacement+.06*(noise[i]-noise[(i+pick)%n]);
    }
    let cursor=0,previous=ring[n-1],apX=0,apY=0,last=0,dc=0,peak=0;
    const dcPole=Math.exp(-2*Math.PI*10/sr);
    // A damped body resonance outside the feedback loop cannot destabilise it.
    const r=Math.exp(-1/(sr*.045)),c=2*r*Math.cos(2*Math.PI*185/sr);let b1=0,b2=0;
    const modes=resonance>0?stringBodyModes(sr,bodyType):[];let bodyX1=0,bodyX2=0;
    for(let i=0;i<out.length;i++){
        const x=ring[cursor],low=(1-mix)*x+mix*previous;previous=x;
        const allpass=fraction<1e-9?low:a*low+apX-a*apY;apX=low;apY=allpass;
        ring[cursor]=allpass*feedback;cursor=(cursor+1)%n;
        const resonant=(1-r)*x+c*b1-r*r*b2;b2=b1;b1=resonant;
        let colour=0;
        for(const m of modes){const y=m.b*(x-bodyX2)+m.c*m.y1-m.r2*m.y2;m.y2=m.y1;m.y1=y;colour+=m.weight*y;}
        bodyX2=bodyX1;bodyX1=x;
        const raw=resonance>0?x+body*((1-resonance)*.35*resonant+resonance*.7*colour):x+body*.35*resonant;
        dc=raw-last+dcPole*dc;last=raw;
        const edge=Math.min(1,i/(sr*.0015),(out.length-1-i)/(sr*.02));
        out[i]=dc*Math.max(0,edge);peak=Math.max(peak,Math.abs(out[i]));
    }
    if(peak>0)for(let i=0;i<out.length;i++)out[i]*=.7/peak;
    return out;
}

/** AudioBuffers can be shared across contexts; keep a bounded global LRU. */
export function stringBuffer(context,frequency,options) {
    const freq=Math.round(frequency*100)/100;
    return cachedNoteBuffer(context,['string',freq,options],()=>renderString(context.sampleRate,freq,options));
}
