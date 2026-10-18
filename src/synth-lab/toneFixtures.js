import {qualityFixture} from './qualityFixtures';
export const TONE_FAMILIES=[['lp12','State variable · 12 dB low-pass',0,0],['lp24','State variable · 24 dB low-pass',1,0],['ladder','Feedback cascade · 24 dB low-pass',1,1],['bp','State variable · band-pass',2,0],['hp','State variable · high-pass',3,0]];
const finite=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function toneConfig(raw={}){return {target:raw.target==='chorus'?'chorus':'filter',sound:['pad','lead','bass'].includes(raw.sound)?raw.sound:'pad',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000,
 family:TONE_FAMILIES.some(([id])=>id===raw.family)?raw.family:'lp24',cutoff:finite(raw.cutoff,80,12000,1400),resonance:finite(raw.resonance,0,1,.35),envelope:finite(raw.envelope,0,3,.8),amount:finite(raw.amount,0,.8,.65),speed:finite(raw.speed,.05,2,.35),depth:finite(raw.depth,0,8,3.5)};}
export function toneFixture(raw={}){
 const config=toneConfig(raw),f=qualityFixture({sound:config.sound==='lead'?'sync':'pwm',rate:config.rate}),p=f.patch;
 Object.assign(p.global,{model:1,gain:.19,chorus:config.target==='chorus'?config.amount:0,chorusRate:config.speed,chorusDepth:config.depth});
 Object.assign(p.layers[0],{waveA:3,waveB:4,levelA:.65,levelB:.25,coarseA:0,coarseB:0,fineB:-5,hardSync:0,polyPitch:0,polyPwm:0,polyFilter:0,lfoPwm:.03,envelopePitch:0,drive:.15,filterAttack:.15,filterDecay:1.2,filterSustain:.25,filterRelease:.8,keytrack:0,velocityTone:0});
 if(config.sound==='bass'){
  Object.assign(p.layers[0],{waveB:2,sub:.25,attack:.025,release:.8,lfoPwm:0});
  f.notes=Array.from({length:4},(_,bar)=>({midi:[36,33,29,31][bar],time:.05+bar*240/f.bpm,duration:3.65*60/f.bpm,velocity:.6}));
 }
 const family=TONE_FAMILIES.find(([id])=>id===config.family);
 Object.assign(p.layers[0],config.target==='chorus'?{filter:0,filterFamily:0,cutoff:4000,resonance:.1,filterAmount:.4}:{filter:family[2],filterFamily:family[3],cutoff:config.cutoff,resonance:config.resonance,filterAmount:config.envelope});
 return {...f,config,kind:'subtractive',patch:p,response:family[2],family:family[3]};
}
export function toneVariants(target){return target==='chorus'?
 [{id:'dry',name:'Chorus off',chorusOff:true},{id:'previous',name:'Previous chorus',legacyChorus:true},{id:'refined',name:'Refined chorus'}]:
 [{id:'previous',name:'Previous filter',legacyFilters:true},{id:'refined',name:'Calibrated filter'}];}
