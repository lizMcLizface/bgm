// Maths for the oscilloscope and spectrum views: trigger search, readouts, FFT and a WAV writer.

/**
 * Index of a trigger in `x` (samples), or -1. The trigger is a crossing of `level` in the given
 * direction (slope +1 rising, -1 falling) at index i, meaning x[i-1] is on the near side and x[i] on
 * the far side. Only indices in [from, to] are considered. `latest` searches backwards (the
 * newest trigger, for a steady display); otherwise the earliest (single shot).
 */
export function findTrigger(x,level,slope,from,to,latest=false){
 const lo=Math.max(1,from),hi=Math.min(x.length-1,to);
 const hit=i=>slope>=0?x[i-1]<level&&x[i]>=level:x[i-1]>level&&x[i]<=level;
 if(latest){for(let i=hi;i>=lo;i--)if(hit(i))return i;}
 else for(let i=lo;i<=hi;i++)if(hit(i))return i;
 return -1;
}

/** Peak-to-peak, peak, RMS and mean of a block. */
export function levels(x){
 let min=Infinity,max=-Infinity,sum=0,sq=0;
 for(const v of x){if(v<min)min=v;if(v>max)max=v;sum+=v;sq+=v*v;}
 const n=Math.max(1,x.length);
 return {min:x.length?min:0,max:x.length?max:0,pp:x.length?max-min:0,peak:x.length?Math.max(Math.abs(min),Math.abs(max)):0,rms:Math.sqrt(sq/n),mean:sum/n};
}

/**
 * Fundamental in Hz by the normalised square difference function (McLeod's method: the
 * autocorrelation divided by the energy of the two segments, which stays accurate when the block
 * holds only a few periods); 0 when the block is not periodic enough. No DC is removed: the engine
 * output has none.
 */
export function pitchOf(x,sampleRate,lo=30,hi=4000){
 const n=Math.min(x.length,3072);
 if(n<256)return 0;
 const a=x.subarray(x.length-n);
 const sq=new Float64Array(n+1);for(let i=0;i<n;i++)sq[i+1]=sq[i]+a[i]*a[i];
 if(sq[n]<1e-9)return 0;
 const minLag=Math.max(2,Math.floor(sampleRate/hi)),maxLag=Math.min(Math.floor(sampleRate/lo),(n*3)>>2);
 const r=new Float64Array(maxLag+2);
 for(let lag=minLag-1;lag<=maxLag+1;lag++){
  let s=0;for(let i=0;i+lag<n;i++)s+=a[i]*a[i+lag];
  const m=sq[n-lag]+(sq[n]-sq[lag]);
  r[lag]=m>0?2*s/m:0;
 }
 // key maxima: the highest point of each stretch above zero; take the first one near the overall best
 let best=0;
 const peaks=[];
 let start=-1;
 for(let lag=minLag;lag<=maxLag;lag++){
  if(r[lag]>0&&start<0)start=lag;
  if((r[lag]<=0||lag===maxLag)&&start>=0){
   let k=start;for(let q=start;q<lag;q++)if(r[q]>r[k])k=q;
   if(k>minLag&&k<maxLag)peaks.push(k);
   start=-1;
  }
 }
 for(const k of peaks)best=Math.max(best,r[k]);
 if(best<.5)return 0;
 for(const k of peaks){
  if(r[k]>=.9*best){
   const l=r[k-1],c=r[k],h=r[k+1],d=l-2*c+h,shift=d?.5*(l-h)/d:0;
   return sampleRate/(k+shift);
  }
 }
 return 0;
}

export const noteName=hz=>{
 if(!(hz>0))return '';
 const m=69+12*Math.log2(hz/440),n=Math.round(m),cents=Math.round((m-n)*100);
 return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((n%12)+12)%12]+(Math.floor(n/12)-1)+(cents?` ${cents>0?'+':''}${cents}¢`:'');
};

/** In-place radix-2 FFT of re/im (length a power of two). */
export function fft(re,im){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){
  const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang),half=len>>1;
  for(let i=0;i<n;i+=len){
   let cr=1,ci=0;
   for(let k=0;k<half;k++){
    const a=i+k,b=a+half,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;
    re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
    const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;
   }
  }
 }
}

const WINDOWS=new Map();
function hann(n){let w=WINDOWS.get(n);if(!w){w=new Float32Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));WINDOWS.set(n,w);}return w;}

/**
 * Magnitude spectrum in dB (0 dB = a full-scale sine) of the last `size` samples of x (zero-padded
 * in front when shorter), Hann-windowed. Returns size/2 bins; bin k is k * sampleRate / size.
 */
export function spectrumDb(x,size=8192){
 const re=new Float64Array(size),im=new Float64Array(size),w=hann(size);
 const n=Math.min(size,x.length),off=size-n;
 for(let i=0;i<n;i++)re[off+i]=x[x.length-n+i]*w[off+i];
 fft(re,im);
 const out=new Float32Array(size>>1),norm=4/size; // a full-scale sine reads 0 dB after the window's 0.5 gain
 for(let k=0;k<out.length;k++)out[k]=20*Math.log10(Math.hypot(re[k],im[k])*norm+1e-9);
 return out;
}

/** Log-frequency display samples. Interpolate when a pixel spans less than a
 * bin; a bin boundary alone must not switch to peak aggregation. */
export function spectrumTrace(bins,sampleRate,width,lo=20,hi=20000){
 const count=Math.max(0,Math.floor(width)),out=new Float32Array(count);
 const binHz=sampleRate/(2*bins.length),top=Math.min(hi,sampleRate/2),ratio=top/lo;
 const at=p=>{const i=Math.floor(p),t=p-i;return (bins[i]??-200)*(1-t)+(bins[i+1]??-200)*t;};
 for(let px=0;px<count;px++){
  const a=lo*ratio**(px/count)/binHz,b=lo*ratio**((px+1)/count)/binHz;
  if(b-a<1)out[px]=at(Math.sqrt(a*b));
  else{
   let peak=Math.max(at(a),at(b));
   for(let k=Math.ceil(a);k<=Math.min(Math.floor(b),bins.length-1);k++)peak=Math.max(peak,bins[k]);
   out[px]=peak;
  }
 }
 return out;
}

/** The largest bin between two frequencies with parabolic refinement: {hz, db}. */
export function spectralPeak(db,sampleRate,size,lo=20,hi=20000){
 const a=Math.max(2,Math.floor(lo*size/sampleRate)),b=Math.min(db.length-2,Math.ceil(hi*size/sampleRate));
 let k=a;for(let i=a;i<=b;i++)if(db[i]>db[k])k=i;
 const l=db[k-1],c=db[k],r=db[k+1],d=l-2*c+r,shift=d?.5*(l-r)/d:0;
 return {hz:(k+shift)*sampleRate/size,db:c-.25*(l-r)*shift};
}

/** 16-bit mono WAV bytes of a Float32Array. */
export function wavBytes(samples,sampleRate){
 const n=samples.length,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
 const text=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);
 return new Uint8Array(buf);
}

/**
 * The period in samples near `guess`, refined by autocorrelation of the newest samples (parabolic peak). The key played gives the guess; the search
 * covers a few per cent either side, so detune, vibrato and glide are followed.
 */
export function refinePeriod(x,guess,spread=.05){
 const n=Math.min(x.length,Math.max(1024,Math.min(8192,Math.round(guess*8))));
 if(guess<4||x.length<guess*2.5)return 0;
 const a=x.subarray(x.length-n),lo=Math.max(2,Math.floor(guess*(1-spread))),hi=Math.ceil(guess*(1+spread));
 if(n<=hi+8)return 0;
 const r=new Float64Array(hi+2);let best=lo,bestV=-Infinity;
 for(let lag=lo-1;lag<=hi+1;lag++){
  let s=0,e=0;for(let i=0;i+lag<n;i++){s+=a[i]*a[i+lag];e+=a[i]*a[i]+a[i+lag]*a[i+lag];}
  r[lag]=e>0?2*s/e:0;
  if(lag>=lo&&lag<=hi&&r[lag]>bestV){bestV=r[lag];best=lag;}
 }
 if(bestV<.5)return 0;
 const y0=r[best-1],y1=r[best],y2=r[best+1],d=y0-2*y1+y2;
 return best+(d<0?.5*(y0-y2)/d:0);
}

/**
 * Trigger point that holds a note's waveform still: whatever the harmonics, each frame is drawn from the point that matches the picture of the last
 * frame. `state.tpl` is that picture (one period, from its trigger); without a good match the trigger is the highest peak of the newest period, which is the
 * same place in every cycle of a steady note. Returns the index, or -1 when the period is unknown. `period` is in samples, `lo` and `hi` bound the index.
 */
export function findPitchTrigger(x,period,lo,hi,state){
 const L=Math.round(period);
 if(!(period>=4)||x.length<L*2)return -1;
 hi=Math.min(hi,x.length-L-1);lo=Math.max(1,lo);
 if(hi<lo)return -1;
 const from=Math.max(lo,hi-Math.ceil(period*1.5)),tpl=state.tpl;
 if(tpl&&tpl.length===L){
  const step=Math.max(1,Math.floor(L/300));let tplE=0;for(let j=0;j<L;j+=step)tplE+=tpl[j]*tpl[j];
  const corr=new Float64Array(hi-from+1);let best=-Infinity;
  for(let t=from;t<=hi;t++){
   let s=0,e=0;for(let j=0;j<L;j+=step){const v=x[t+j];s+=v*tpl[j];e+=v*v;}
   const c=e>0&&tplE>0?s/Math.sqrt(e*tplE):0;corr[t-from]=c;if(c>best)best=c;
  }
  if(best>.85){
   // the newest of the equally good matches, the one nearest the end of the window, so the picture is as recent as it can be
   let pick=-1;for(let k=corr.length-1;k>=0;k--)if(corr[k]>=best-.01&&(k===0||corr[k]>=corr[k-1])&&(k===corr.length-1||corr[k]>=corr[k+1])){pick=from+k;break;}
   if(pick>=0){state.tpl=x.slice(pick,pick+L);return pick;}
  }
 }
 let t=from,peak=-Infinity;for(let i=from;i<=hi&&i<from+L;i++)if(x[i]>peak){peak=x[i];t=i;}
 // the peak must be the same one next time: use the latest period's
 state.tpl=x.slice(t,t+L);return t;
}
