// Windowed, one-sided power spectra. No analyser-node smoothing or FFT dependency.
export const SPECTRAL_SIZE=65536;
const db=ratio=>10*Math.log10(Math.max(1e-16,ratio));
export function fft(real,imag){
 const n=real.length;if(n!==imag.length||n<2||(n&(n-1)))throw Error('FFT needs matching power-of-two arrays.');
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}
 for(let size=2;size<=n;size*=2){const angle=-2*Math.PI/size,wr=Math.cos(angle),wi=Math.sin(angle);for(let start=0;start<n;start+=size){let ar=1,ai=0;for(let i=0;i<size/2;i++){const a=start+i,b=a+size/2,tr=ar*real[b]-ai*imag[b],ti=ar*imag[b]+ai*real[b];real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;const next=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=next;}}}
}
const blackmanHarris=(i,n)=>{const a=2*Math.PI*i/(n-1);return .35875-.48829*Math.cos(a)+.14128*Math.cos(2*a)-.01168*Math.cos(3*a);};
export function powerSpectrum(data,rate,{offset=0,size=SPECTRAL_SIZE}={}){
 if(!Number.isFinite(rate)||rate<=0||!Number.isInteger(size)||size<16||(size&(size-1))||!Number.isInteger(offset)||offset<0||offset+size>data.length)throw Error('Invalid spectral window.');
 const real=new Float64Array(size),imag=new Float64Array(size);let mean=0,energy=0;
 for(let i=0;i<size;i++){const x=data[offset+i];if(!Number.isFinite(x))throw Error('Nonfinite spectral input.');mean+=x;}mean/=size;
 for(let i=0;i<size;i++){const w=blackmanHarris(i,size);real[i]=(data[offset+i]-mean)*w;energy+=w*w;}
 fft(real,imag);const power=new Float64Array(size/2+1);
 for(let k=0;k<power.length;k++)power[k]=(real[k]**2+imag[k]**2)*(k===0||k===size/2?1:2)/(size*energy);
 return {power,rate,size,binHz:rate/size};
}
export function spectralMetrics(spectrum,fundamental,reference=null){
 const {power,binHz,rate}=spectrum;if(!Number.isFinite(fundamental)||fundamental<binHz*12||fundamental>=rate*.4)throw Error('Fundamental outside the diagnostic range.');
 if(reference&&(reference.size!==spectrum.size||reference.rate!==rate))throw Error('Reference spectrum must share its frequency grid.');
 // Four-term Blackman-Harris has a +/-4-bin main lobe. A fifth bin allows
 // small f32 pitch/phase errors. Analyse below 80% Nyquist, outside the
 // reference decimator's transition band; ignore DC and sub-audible bins.
 const first=Math.ceil(20/binHz),last=Math.floor(rate*.4/binHz),guard=5*binHz;
 let total=0,outside=0,difference=0,referenceEnergy=0;
 for(let k=first;k<=last;k++){
  total+=power[k];const hz=k*binHz,nearest=Math.round(hz/fundamental)*fundamental;
  if(nearest<fundamental*.5||Math.abs(hz-nearest)>guard)outside+=power[k];
  if(reference){difference+=(Math.sqrt(power[k])-Math.sqrt(reference.power[k]))**2;referenceEnergy+=reference.power[k];}
 }
 return {offHarmonicDb:total>1e-20?db(outside/total):null,magnitudeDifferenceDb:referenceEnergy>1e-20?db(difference/referenceEnergy):null,bandHz:[first*binHz,last*binHz],guardHz:guard,energy:total};
}

/** Offline reference only: centred, 64*factor+1 tap BH-windowed sinc low-pass. */
export function decimateReference(data,factor){
 if(![2,4].includes(factor))throw Error('Reference decimation supports 2×/4×.');
 const half=32*factor,cutoff=.45/factor,taps=new Float64Array(half*2+1);let sum=0;
 for(let j=-half;j<=half;j++){const value=(j===0?2*cutoff:Math.sin(2*Math.PI*cutoff*j)/(Math.PI*j))*blackmanHarris(j+half,taps.length);taps[j+half]=value;sum+=value;}
 for(let i=0;i<taps.length;i++)taps[i]/=sum;
 const out=new Float32Array(Math.floor(data.length/factor));
 for(let i=0;i<out.length;i++){let value=0;const first=Math.max(-half,-i*factor),last=Math.min(half,data.length-1-i*factor);for(let j=first;j<=last;j++)value+=data[i*factor+j]*taps[j+half];if(!Number.isFinite(value))throw Error('Nonfinite reference signal.');out[i]=value;}
 return out;
}
