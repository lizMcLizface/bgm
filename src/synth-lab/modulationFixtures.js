import {patchColourTail} from './voiceColour';
import {clonePatch,RECIPES} from './patch';
export const MODULATION_SOUNDS=[['pad','Living silk · held pad'],['lead','Curved envelope · lead'],['pressure','Pressure bloom · pad']];
export function modulationConfig(raw={}){return {sound:MODULATION_SOUNDS.some(([id])=>id===raw.sound)?raw.sound:'pad',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000};}
export function modulationFixture(raw={}){
 const config=modulationConfig(raw),patch=clonePatch(RECIPES.find(p=>p.name==='Living silk')),bpm=88,beat=60/bpm,bars=4,notes=[];
 if(config.sound==='lead'){
  Object.assign(patch.global,{chorus:.1});
  Object.assign(patch.layers[0],{waveA:3,waveB:1,levelA:.65,levelB:.15,attack:.45,decay:.6,sustain:.55,release:1.2,ampAttackCurve:2,ampDecayCurve:.6,ampReleaseCurve:2.7,filterAttackCurve:1.7,filterDecayCurve:.6,filterReleaseCurve:3,filterAttack:.35,filterDecay:.8,filterSustain:.3,cutoff:750,filterAmount:1.3,wanderCents:3,modSource1:10,modTarget1:2,modDepth1:.08,modSource2:0,modSource3:0});
 }
 if(config.sound==='pressure'){
  Object.assign(patch.layers[0],{pressureTone:0,wanderCents:2,modSource1:8,modTarget1:2,modDepth1:.45,modSource2:8,modTarget2:3,modDepth2:.35,modSource3:2,modTarget3:5,modDepth3:.12});
 }
 const chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
 for(let bar=0;bar<bars;bar++){
  const base=.05+bar*4*beat;
  if(config.sound==='lead')for(const [i,at]of [0,1.5,2.75].entries())notes.push({midi:chords[bar][(i+2)%4]+12,time:base+at*beat,duration:beat*(i===2?1.1:1.25),velocity:i===0?.65:.5});
  else chords[bar].forEach(midi=>notes.push({midi,time:base,duration:3.7*beat,velocity:.55}));
 }
 // Identical per-note pressure gestures for all paths, interpolated through
 // bounded timestamped events rather than UI timers. The route itself slews.
 const events=config.sound==='pressure'?notes.flatMap((n,i)=>Array.from({length:21},(_,step)=>[3,i+1,Math.round((n.time+n.duration*step/20)*config.rate),Math.sin(Math.PI*step/20),0])):[];
 const scoreSeconds=.05+bars*4*beat;
 return {kind:'subtractive',config,patch,notes,events,bpm,bars,scoreSeconds,seconds:scoreSeconds+patch.layers[0].release+patchColourTail(patch)+.2};
}
export function modulationVariants(fixture){
 const plain=clonePatch(fixture.patch),p=plain.layers[0];
 Object.assign(p,{ampAttackCurve:1,ampDecayCurve:1,ampReleaseCurve:2,filterAttackCurve:1,filterDecayCurve:1,filterReleaseCurve:2,wanderCents:0});
 for(let slot=1;slot<=4;slot++)Object.assign(p,{['modSource'+slot]:0,['modTarget'+slot]:0,['modDepth'+slot]:0});
 return [{id:'plain',name:'Fixed texture · original envelopes',patch:plain},{id:'expressive',name:'Moving texture · curves + routes',patch:fixture.patch}];
}
