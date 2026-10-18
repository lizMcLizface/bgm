import {patchColourTail} from './voiceColour';
import {cloneFM,FM_RECIPES} from './fmPatch';
import {clonePatch,RECIPES} from './patch';
export const QUALITY_SOUNDS=[['keys','Soft FM keys','fm'],['glass','Bowed glass pad','fm'],['pwm','Silk pulse motion','subtractive'],['sync','Soft sync lead','subtractive']];
export function qualityConfig(raw={}){return {sound:QUALITY_SOUNDS.some(([id])=>id===raw.sound)?raw.sound:'keys',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000};}
export function qualityFixture(raw={}){
 const config=qualityConfig(raw),kind=QUALITY_SOUNDS.find(([id])=>id===config.sound)[2],patch=kind==='fm'?cloneFM(FM_RECIPES[config.sound==='glass'?4:0]):clonePatch(RECIPES[config.sound==='sync'?6:1]);
 const bpm=88,beat=60/bpm,bars=4,chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]],notes=[];
 if(config.sound==='pwm'){Object.assign(patch.global,{polyphony:8,gain:.2,chorus:.12});Object.assign(patch.layers[0],{waveA:4,waveB:1,coarseB:12,fineB:0,levelA:.75,levelB:0,polyPwm:.035,cutoff:1800,filterAmount:1,resonance:.15,lfoPwm:.04,attack:.3,sustain:.75,release:1.4});}
 if(config.sound==='sync'){Object.assign(patch.global,{polyphony:8,gain:.18});Object.assign(patch.layers[0],{cutoff:1400,attack:.07,envelopePitch:3,release:.8,levelB:.025,filterAmount:.8});}
 if(config.sound==='keys')patch.global.gain=.18;
 for(let bar=0;bar<bars;bar++){
  const chord=chords[bar],base=.05+bar*4*beat;
  if(['glass','pwm'].includes(config.sound))chord.forEach(midi=>notes.push({midi,time:base,duration:3.7*beat,velocity:.55}));
  else if(config.sound==='keys')[0,.75,1.5,2.5,3.25].forEach((at,i)=>notes.push({midi:chord[(bar+i)%4]+12,time:base+at*beat,duration:.65*beat,velocity:i===0?.65:.5}));
  else [.5,2.25].forEach((at,i)=>notes.push({midi:chord[(bar+i+2)%4]+12,time:base+at*beat,duration:1.3*beat,velocity:.55}));
 }
 const release=kind==='fm'?Math.max(...patch.operators.slice(0,patch.global.operators).map(o=>o.release)):Math.max(patch.layers[0].release,patch.global.model===2?patch.layers[1].release:0),scoreSeconds=.05+bars*4*beat;
 return {config,kind,patch,notes,bpm,bars,scoreSeconds,seconds:scoreSeconds+release+patchColourTail(patch)+.2};
}
export function qualityMeasure(channels){let peak=0,energy=0,nonFinite=0;for(const data of channels)for(const x of data){if(!Number.isFinite(x)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(x));energy+=x*x;}if(nonFinite||energy<1e-16)throw Error('Quality passage is nonfinite or silent.');return {peak,rms:Math.sqrt(energy/(channels.length*channels[0].length)),nonFinite};}
