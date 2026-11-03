// How much, and how fast, a held note is being modulated: pitch (vibrato), level (tremolo) and brightness (filter or pulse-width wobble).
// Frames of 64 ms every 10 ms; each series gets its peak-to-peak depth (5th-95th percentile) and its dominant rate.
import {fft} from '../../src/synths/ui/scopeMath.js';

const percentile=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.round(p*(s.length-1))))];};

/** Dominant frequency (Hz) of a series sampled every `hop` seconds, 0.3..25 Hz, and its strength relative to the series' total. */
function rateOf(series,hop){
 const n=series.length,mean=series.reduce((s,v)=>s+v,0)/n;
 let size=4096;const re=new Float64Array(size),im=new Float64Array(size);
 for(let i=0;i<Math.min(n,size);i++)re[i]=(series[i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 fft(re,im);
 let best=0,at=0,total=0;
 for(let k=1;k<size/2;k++){const f=k/(size*hop),p=re[k]**2+im[k]**2;if(f<.08||f>30)continue;total+=p;if(p>best){best=p;at=k;}}
 // parabolic refinement of the peak bin
 const p=k=>Math.sqrt(re[k]**2+im[k]**2),a=p(at-1),b=p(at),c=p(at+1),d=a-2*b+c,off=d?.5*(a-c)/d:0;
 return {hz:(at+off)/(size*hop),share:total?best/total:0};
}

export function modulationProfile(channels,sr,note,{from=0,to=channels[0].length,win=.064,hop=.01}={}){
 const f0=440*2**((note-69)/12),N=Math.round(win*sr),step=Math.round(hop*sr),size=8192;
 const window=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1)));
 const level=[],centroid=[],pitch=[];
 const x=channels.length>1?channels[0].map((v,i)=>.5*(v+channels[1][i])):channels[0];
 for(let at=from;at+N<=to;at+=step){
  const re=new Float64Array(size),im=new Float64Array(size);let e=0;
  for(let i=0;i<N;i++){re[i]=x[at+i]*window[i];e+=x[at+i]**2;}
  fft(re,im);
  const mag=k=>Math.sqrt(re[k]**2+im[k]**2);
  level.push(10*Math.log10(e/N+1e-20));
  let num=0,den=0;
  for(let k=Math.ceil(150*size/sr);k<10000*size/sr;k++){const p=mag(k)**2;num+=p*Math.log2(k*sr/size);den+=p;}
  centroid.push(den?num/den:0);
  // pitch from the strongest of the first four harmonics, quadratic peak interpolation, back to the fundamental
  let best={m:0,f:f0};
  for(let h=1;h<=4;h++){
   const lo=Math.floor(h*f0*.94*size/sr),hi=Math.ceil(h*f0*1.06*size/sr);let kk=lo;
   for(let k=lo;k<=hi;k++)if(mag(k)>mag(kk))kk=k;
   if(mag(kk)>best.m){const a=mag(kk-1),b=mag(kk),c=mag(kk+1),d=a-2*b+c,off=d?.5*(a-c)/d:0;best={m:mag(kk),f:(kk+off)*sr/size/h};}
  }
  pitch.push(1200*Math.log2(best.f/f0));
 }
 const summarise=(series,scale=1)=>({depth:(percentile(series,.95)-percentile(series,.05))*scale,...(()=>{const r=rateOf(series,hop);return {rateHz:r.hz,share:r.share};})()});
 return {frames:level.length,pitchCents:summarise(pitch),levelDb:summarise(level),centroidOct:summarise(centroid)};
}
