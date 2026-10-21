// Measurements for controlled reference recordings. No sample-by-sample error:
// independent analogue oscillator phases make that a misleading matching score.
import {fft,pitchOf} from '../ui/scopeMath.js';

const db=x=>20*Math.log10(Math.max(1e-12,x));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const rmse=a=>a.length?Math.sqrt(mean(a.map(x=>x*x))):null;

function validate(channels,sampleRate){
 if(!Number.isFinite(sampleRate)||sampleRate<8000)throw Error('Invalid sample rate.');
 const frames=channels[0]?.length;
 if(!frames||channels.some(c=>c.length!==frames||!c.every(Number.isFinite)))throw Error('Audio must contain equal, nonempty, finite channels.');
 return frames;
}

/** RMS uses channel power, so stereo chorus/antiphase signals cannot cancel. */
export function profileReference(channels,sampleRate){
 const frames=validate(channels,sampleRate),step=Math.max(1,Math.round(.02*sampleRate));
 const envelope=[];let energy=0,peak=0,loudestChannel=channels[0],loudestEnergy=-1;
 for(const c of channels){let e=0;for(const v of c){e+=v*v;peak=Math.max(peak,Math.abs(v));}energy+=e;if(e>loudestEnergy){loudestEnergy=e;loudestChannel=c;}}
 for(let i=0;i<frames;i+=step){
  const end=Math.min(frames,i+step);let e=0;
  for(const c of channels)for(let n=i;n<end;n++)e+=c[n]*c[n];
  envelope.push(Math.sqrt(e/((end-i)*channels.length)));
 }
 const rms=Math.sqrt(energy/(frames*channels.length));
 const maxEnvelope=envelope.reduce((m,v)=>Math.max(m,v),0);
 const crossing=ratio=>{const i=envelope.findIndex(v=>maxEnvelope>1e-9&&v>=ratio*maxEnvelope);return i<0?null:i*step/sampleRate;};
 let peakAt=0;for(let i=1;i<envelope.length;i++)if(envelope[i]>envelope[peakAt])peakAt=i;
 const pitchStart=peakAt*step,pitch= maxEnvelope>1e-9 ? pitchOf(loudestChannel.subarray(pitchStart,Math.min(frames,pitchStart+Math.round(.12*sampleRate))),sampleRate,30,4000) : 0;

 // Welch power spectrum: average across time AND channel power before forming
 // logarithmic bands. This tolerates phase differences and small tuning spread.
 const size=8192,hop=size/2,power=new Float64Array(size/2);let windows=0;
 const windowLength=Math.min(size,frames);
 const window=Float64Array.from({length:windowLength},(_,i)=>windowLength>1?.5-.5*Math.cos(2*Math.PI*i/(windowLength-1)):1);
 for(let at=0;at<frames;at+=hop){
  const count=Math.min(size,frames-at);if(count<size&&at>0)break;
  for(const c of channels){
   const re=new Float64Array(size),im=new Float64Array(size);
   // Short files are zero padded; full windows use the same Hann weights.
   for(let i=0;i<count;i++)re[i]=c[at+i]*window[i];
   fft(re,im);for(let k=1;k<power.length;k++)power[k]+=re[k]**2+im[k]**2;
   windows++;
  }
  if(at+size>=frames)break;
 }
 const bands=[];
 for(let lo=30;lo<Math.min(20000,sampleRate/2);lo*=2**(1/6)){
  const hi=Math.min(lo*2**(1/6),sampleRate/2,20000);
  const a=Math.max(1,Math.ceil(lo*size/sampleRate)),b=Math.min(power.length,Math.ceil(hi*size/sampleRate));
  if(b<=a)continue;
  let p=0;for(let k=a;k<b;k++)p+=power[k];
  bands.push({hz:Math.sqrt(lo*hi),power:p/windows});
 }
 const total=bands.reduce((s,b)=>s+b.power,0);
 return {sampleRate,frames,duration:frames/sampleRate,rmsDb:db(rms),peakDb:db(peak),pitchHz:pitch||null,
  rise10Seconds:crossing(.1),rise90Seconds:crossing(.9),peakSeconds:peakAt*step/sampleRate,
  envelopeDb:envelope.map(db),bands:bands.map(b=>({hz:b.hz,db:10*Math.log10(Math.max(1e-12,b.power/Math.max(1e-30,total)))}))};
}

/** Compare the SAME time span at the SAME rate, aligned to known note-on times. */
export function compareReferences(reference,candidate,sampleRate){
 const a=profileReference(reference,sampleRate),b=profileReference(candidate,sampleRate);
 if(a.frames!==b.frames)throw Error('Reference and candidate must cover the same number of frames.');
 // A single gain correction for the entire recording. Do not normalize each
 // time bin: that would hide the envelope error we are trying to measure.
 const gainDb=a.rmsDb-b.rmsDb;
 const silence=a.rmsDb<-100||b.rmsDb<-100;
 const envelopeErrors=a.envelopeDb.flatMap((v,i)=>Math.max(v-a.rmsDb,b.envelopeDb[i]-b.rmsDb)>-60?[b.envelopeDb[i]+gainDb-v]:[]);
 const spectralErrors=a.bands.flatMap((v,i)=>Math.max(v.db,b.bands[i].db)>-60?[b.bands[i].db-v.db]:[]);
 return {gainToMatchDb:silence?null:gainDb,pitchErrorCents:a.pitchHz&&b.pitchHz?1200*Math.log2(b.pitchHz/a.pitchHz):null,
  envelopeErrorDb:silence?null:rmse(envelopeErrors),spectralShapeErrorDb:silence?null:rmse(spectralErrors),
  reference:a,candidate:b};
}
