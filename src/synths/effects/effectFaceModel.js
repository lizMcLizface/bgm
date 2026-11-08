// Read-only display models. These never allocate nodes or alter the audio path.
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function biquad(kind,hz,db=0,q=.707,sr=48000){
 const a=10**(db/40),w=2*Math.PI*clamp(hz,10,sr*.45)/sr,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*q),t=s*Math.sqrt(2*a);
 let b0,b1,b2,a0=1+alpha,a1=-2*c,a2=1-alpha;
 if(kind==='peak'){b0=1+alpha*a;b1=-2*c;b2=1-alpha*a;a0=1+alpha/a;a2=1-alpha/a;}
 else if(kind==='low'){b0=a*((a+1)-(a-1)*c+t);b1=2*a*((a-1)-(a+1)*c);b2=a*((a+1)-(a-1)*c-t);a0=(a+1)+(a-1)*c+t;a1=-2*((a-1)+(a+1)*c);a2=(a+1)+(a-1)*c-t;}
 else if(kind==='high'){b0=a*((a+1)+(a-1)*c+t);b1=-2*a*((a-1)+(a+1)*c);b2=a*((a+1)+(a-1)*c-t);a0=(a+1)-(a-1)*c+t;a1=2*((a-1)-(a+1)*c);a2=(a+1)-(a-1)*c-t;}
 else if(kind==='lowpass'){b0=(1-c)/2;b1=1-c;b2=b0;}
 else if(kind==='highpass'){b0=(1+c)/2;b1=-(1+c);b2=b0;}
 else if(kind==='bandpass'){b0=alpha;b1=0;b2=-alpha;}
 else {b0=1;b1=-2*c;b2=1;}
 return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
export function responseDb(co,f,sr=48000){
 const w=2*Math.PI*f/sr,[b0,b1,b2,a1,a2]=co,c=Math.cos(w),s=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);
 const n=(b0+b1*c+b2*c2)**2+(b1*s+b2*s2)**2,d=(1+a1*c+a2*c2)**2+(a1*s+a2*s2)**2;
 return 10*Math.log10(Math.max(1e-12,n/Math.max(1e-16,d)));
}
export function eqResponse(v,f,sr=48000){
 return [['low','low',.707],['mid','peak',v['inserts.midQ']],['high','high',.707]].reduce((sum,[id,kind,q])=>sum+responseDb(biquad(kind,Math.min(v[`inserts.${id}Freq`],sr*.4),v[`inserts.${id}Gain`],q,sr),f,sr),0);
}
export function filterResponse(v,f,sr=48000){
 const mode=Math.round(v['filter.type']);
 if(mode===0)return [['highpass',v['filter.low']],['highpass',v['filter.slope']?v['filter.low']:10],['lowpass',v['filter.high']],['lowpass',v['filter.slope']?v['filter.high']:sr*.45]].reduce((sum,[kind,hz])=>sum+responseDb(biquad(kind,hz,0,.707,sr),f,sr),0);
 const cuts=2*responseDb(biquad('highpass',10,0,.707,sr),f,sr)+2*responseDb(biquad('lowpass',sr*.45,0,.707,sr),f,sr);
 return cuts+responseDb(biquad([null,'lowpass','highpass','bandpass','notch','low','high'][mode],v['filter.cutoff'],v['filter.gain'],v['filter.q'],sr),f,sr);
}
export function compressionDb(input,threshold,ratio,knee){
 const x=input-threshold;if(x<-knee/2)return input;if(x>knee/2||knee===0)return threshold+x/ratio;
 return input+(1/ratio-1)*(x+knee/2)**2/(2*knee);
}
export const linePath=(fn,count=100)=>Array.from({length:count},(_,i)=>`${i?'L':'M'}${(i/(count-1)*320).toFixed(2)},${fn(i/(count-1)).toFixed(2)}`).join(' ');
