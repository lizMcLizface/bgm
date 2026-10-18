import {initialPatch} from './patch';
import {initialFM} from './fmPatch';
import {SPECTRAL_SIZE} from './spectral';
export const SPECTRAL_CASES=[
 ['fm-sine','FM · single sine control','fm'],['fm-bright','FM · bright 5:1 pair','fm'],['fm-stack','FM · deep three-operator stack','fm'],['fm-feedback','FM · feedback stress','fm'],
 ['sub-saw','Subtractive · saw control','subtractive'],['sub-triangle','Subtractive · triangle control','subtractive'],['sub-sync','Subtractive · hard-sync stress','subtractive'],['sub-pwm','Subtractive · audio-rate PWM','subtractive'],['sub-filter','Subtractive · audio-rate filter modulation','subtractive']
];
export function spectralConfig(raw={}){
 const rate=[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000;
 const frequency=Number(raw.hz),hz=Number.isFinite(frequency)?Math.max(80,Math.min(3500,frequency)):3137;
 return {test:SPECTRAL_CASES.some(([id])=>id===raw.test)?raw.test:'fm-bright',rate,hz,depth:Number.isFinite(Number(raw.depth))?Math.max(.1,Math.min(3,Number(raw.depth))):1};
}
export function spectralFixture(raw={}){
 const config=spectralConfig(raw),kind=SPECTRAL_CASES.find(([id])=>id===config.test)[2];
 // Odd FFT bin avoids aliases systematically landing on the same harmonic
 // lattice. MIDI is fractional; the exact measured pitch may differ slightly.
 const bin=Math.max(13,Math.round(config.hz*SPECTRAL_SIZE/config.rate)|1),fundamental=bin*config.rate/SPECTRAL_SIZE,midi=69+12*Math.log2(fundamental/440),patch=kind==='fm'?initialFM():initialPatch();
 if(kind==='fm'){
  Object.assign(patch.global,{operators:4,polyphony:1,gain:.18,quality:0,feedback:0,index:config.depth,pressure:0,keySync:1,width:0,vibrato:0,tremolo:0,lfoIndex:0,pitchStart:0});
  patch.routes=Array.from({length:6},()=>Array(6).fill(0));patch.carriers=[0,1,0,0,0,0];
  for(const op of patch.operators)Object.assign(op,{ratio:1,detune:0,level:.65,attack:.01,decay1:.01,decay2:.01,peak:1,breakpoint:1,sustain:1,release:.1,velocity:0,keyScale:0,rateScale:0,pressure:0,pan:0});
  if(config.test!=='fm-sine'){patch.operators[0].ratio=5;patch.operators[0].level=4;patch.routes[0][1]=1;}
  if(config.test==='fm-stack'){patch.operators[0].level=3;patch.operators[1].ratio=3;patch.operators[1].level=3;patch.routes[1][2]=1;patch.carriers=[0,0,1,0,0,0];}
  if(config.test==='fm-feedback'){patch.global.feedback=.65;patch.global.feedbackOp=0;}
 }else{
  Object.assign(patch.global,{polyphony:1,unison:1,gain:.25,chorus:0,spread:0,width:0});
  Object.assign(patch.layers[0],{waveA:config.test==='sub-triangle'?2:3,waveB:1,levelA:1,levelB:0,coarseB:12,fineB:0,noise:0,sub:0,cutoff:12000,resonance:0,filter:0,highpass:10,filterAmount:0,keytrack:0,velocityTone:0,attack:.01,decay:.01,sustain:1,release:.1,filterAttack:.01,filterDecay:.01,filterSustain:1,drift:0,drive:0,lfoPitch:0,lfoFilter:0,lfoPwm:0,lfo2Pitch:0,lfo2Filter:0,lfo2Amp:0,pressureTone:0});
  // B tuning is relative to A in this engine. Keep the reset/master B at
  // the diagnostic fundamental while A runs just below three times faster.
  if(config.test==='sub-sync')Object.assign(patch.layers[0],{coarseA:19,coarseB:-19,hardSync:1});
  if(config.test==='sub-pwm')Object.assign(patch.layers[0],{waveA:4,polyPwm:Math.min(.4,.12*config.depth)});
  if(config.test==='sub-filter')Object.assign(patch.layers[0],{cutoff:2200,resonance:.65,polyFilter:Math.min(3,config.depth),drive:.5});
 }
 return {config,kind,patch,midi,fundamental,analysisStart:.75,seconds:4.25,bpm:120,bars:2,referenceFactor:Math.min(4,192000/config.rate),notes:[{midi,time:.05,duration:4,velocity:.7}]};
}
