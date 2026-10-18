import {patchColourTail} from './voiceColour';
import {RECIPES,clonePatch} from './patch';
import {FM_RECIPES,cloneFM} from './fmPatch';
import {defaultEffects,sanitizeEffects,effectTail} from './effectsConfig';
import {sanitizeInstrumentEffects} from './instrumentEffectsConfig';
import {insertsTail} from './insertsConfig';

export const ENSEMBLE_PATHS=[['dry','Dry instruments'],['separate','Effects per instrument'],['shared','Shared Wasm effects'],['hybrid','Shared room + shared native echo'],['local','Shared rooms + instrument delays']];
const bounded=(n,lo,hi,fallback)=>Number.isFinite(Number(n))?Math.max(lo,Math.min(hi,Number(n))):fallback;
// Only explicit voice overrides travel in the URL; old ensemble URLs keep working.
export function voiceEffectsOverrides(raw){
 if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{return {};}}
 const result={};
 for(let id=0;id<8;id++){
  const out=sanitizeInstrumentEffects(raw?.[id]);
  if(Object.keys(out).length)result[id]=out;
 }return result;
}
export function ensembleConfig(raw={}){
 const count=[2,4,8].includes(Number(raw.count))?Number(raw.count):4;
 return {count,rooms:Math.min(count,[1,2,4].includes(Number(raw.rooms))?Number(raw.rooms):1),bars:[4,8].includes(Number(raw.bars))?Number(raw.bars):4,
  bpm:bounded(raw.bpm,60,160,88),quality:[0,1,2].includes(Number(raw.quality))?Number(raw.quality):1,
  sampleRate:[44100,48000,96000].includes(Number(raw.sampleRate))?Number(raw.sampleRate):48000,
  scope:raw.scope==='stems'?'stems':'full',decay:bounded(raw.decay,.3,30,8),master:bounded(raw.master,0,1,.7),voices:voiceEffectsOverrides(raw.voices)};
}
export function ensemblePlan(raw={}){
 const c=ensembleConfig(raw),beat=60/c.bpm,cycleSeconds=c.bars*4*beat,chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
 const parts=Array.from({length:c.count},(_,index)=>{
  const type=index%4,copy=Math.floor(index/4),kind=type<2?'fm':'subtractive';
  const patch=kind==='fm'?cloneFM(FM_RECIPES[type===0?4:0]):clonePatch(RECIPES[type===2?3:1]);
  patch.global.polyphony=type===0?8:type===2?3:6;if(kind==='fm')patch.global.quality=c.quality;
  if(type===2){patch.name='DCO drone bass';Object.assign(patch.layers[0],{cutoff:420,filterAmount:.5,attack:.15,decay:.5,sustain:.8,release:.8,sub:.15});}
  if(type===3){patch.name='Silk lead';Object.assign(patch.layers[0],{attack:.12,decay:.4,sustain:.65,release:1.1,cutoff:1700});patch.global.chorus=.12;}
  const notes=[],retunes=[],octave=copy?12:0,velocity=copy?.5:.65;
  if(type===0){
   chords[0].forEach(midi=>notes.push({midi:midi+octave,time:.05,duration:cycleSeconds-.15*beat,velocity}));
   for(let bar=1;bar<c.bars;bar++)chords[bar%4].forEach((midi,i)=>retunes.push({id:i+1,midi:midi+octave,time:.05+bar*4*beat,seconds:Math.min(1.1,beat*1.5)}));
  }else for(let bar=0;bar<c.bars;bar++){
   const chord=chords[bar%4],base=.05+bar*4*beat;
   if(type===1)[0,.75,1.5,2.5,3.25].forEach((at,i)=>notes.push({midi:chord[(i+bar)%4]+12+octave,time:base+at*beat,duration:(i===4?.5:.6)*beat,velocity:velocity*(i===0?1:.83)}));
   if(type===2)notes.push({midi:chord[0]-12+octave,time:base,duration:3.65*beat,velocity});
   if(type===3)[.5,2.25].forEach((at,i)=>notes.push({midi:chord[(bar+i+2)%4]+12+octave,time:base+at*beat,duration:1.25*beat,velocity:velocity*.85}));
  }
  const envelopeRelease=kind==='fm'?Math.max(...patch.operators.slice(0,patch.global.operators).map(o=>o.release)):Math.max(patch.layers[0].release,patch.global.model===2?patch.layers[1].release:0);
  const release=envelopeRelease+patchColourTail(patch);
  const voiceEffects={delayMs:Math.min(2000,beat*1000*[2,.75,.5,1.5][type]),feedback:[.35,.55,.2,.4][type],tone:[3000,6500,1800,4200][type],send:[.016,.24,.01,.09][type],pingPong:type===1?1:0,roomSend:[.4,.15,.1,.3][type],room:'shared',roomDecay:type===0?20:2.4,...patch.routing,...c.voices[index]};
  return {id:index,role:['pad','keys','bass','lead'][type],kind,name:patch.name+(copy?' · upper layer':''),patch,notes,retunes,release,voiceEffects,
   gain:[.75,.62,.7,.5][type]/Math.sqrt(Math.max(1,c.count/4)),pan:type===2?0:(index%2?-.28:.28)*(copy?-1:1),
   sends:{dry:1,reverb:[1,.65,.35,.8][type],delay:[.08,.8,.05,.45][type]},room:index%c.rooms};
 });
 const effects=sanitizeEffects({...defaultEffects(),decay:c.decay,delayMs:60000/c.bpm*.75,delay:.2});
 return finalizeEnsemblePlan(c,parts,cycleSeconds,effects);
}
export function finalizeEnsemblePlan(c,parts,cycleSeconds,effects){
 const sourceSeconds=.05+cycleSeconds+Math.max(...parts.map(p=>p.release+insertsTail(p.patch.inserts)))+.3;
 const voices=parts.map(p=>{const edges=p.notes.flatMap(n=>[[n.time,1],[n.time+n.duration+p.release,-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let active=0,peak=0;for(const [,delta]of edges){active+=delta;peak=Math.max(peak,active);}return {id:p.id,role:p.role,peak,capacity:p.kind==='procedural'&&p.patch.family==='drums'?null:p.patch.global.polyphony};});
 // All paths use the same conservative window, including private long rooms
 // and instrument delays. Neither a slow echo nor its following room is cut off.
 const localTail=Math.max(...parts.map(p=>effectTail({...effects,delay:p.voiceEffects.send,delayMs:p.voiceEffects.delayMs,feedback:p.voiceEffects.feedback,delayToReverb:p.voiceEffects.roomSend,decay:p.voiceEffects.room==='private'?p.voiceEffects.roomDecay:c.decay})));
 return {config:c,parts,effects,cycleSeconds,sourceSeconds,seconds:sourceSeconds+Math.max(effectTail(effects),localTail),voices};
}
export function ensembleEvents(part,rate,{offset=0,cycle=0}={}){
 const base=(cycle%100000)*10000;
 return [...part.notes.flatMap((n,i)=>[[0,base+i+1,Math.round((n.time+offset)*rate),n.midi,n.velocity],[1,base+i+1,Math.round((n.time+n.duration+offset)*rate),0,0]]),
  ...part.retunes.map(n=>[5,base+n.id,Math.round((n.time+offset)*rate),n.midi,n.seconds]),
  ...(part.controls??[]).map(n=>[n.kind,n.id===0?0:base+n.id,Math.round((n.time+offset)*rate),n.a,n.b])];
}
export function roomSettings(plan,index){return index===0?plan.effects:sanitizeEffects({...plan.effects,size:Math.max(.25,.7-index*.12),damping:6000-index*700});}
export function effectsLayout(plan,path){
 if(!ENSEMBLE_PATHS.some(([id])=>id===path))throw Error('Unknown ensemble path.');
 if(path==='local'){
  const settings=[],assignment=new Map(),shared=new Map();
  for(const part of plan.parts){let room;
   if(part.voiceEffects.room==='private'){room=settings.length;settings.push(sanitizeEffects({...roomSettings(plan,part.room),decay:part.voiceEffects.roomDecay}));}
   else{if(!shared.has(part.room)){shared.set(part.room,settings.length);settings.push(roomSettings(plan,part.room));}room=shared.get(part.room);}
   assignment.set(part.id,room);
  }
  return {count:settings.length,kind:'local',assign:part=>assignment.get(part.id),settings:index=>settings[index]};
 }
 const count=path==='dry'?1:path==='separate'?plan.parts.length:plan.config.rooms;
 return {count,kind:path==='hybrid'?'hybrid':path==='dry'?'dry':'wasm',assign:part=>path==='separate'?part.id:path==='dry'?0:part.room,
  settings:index=>roomSettings(plan,path==='separate'?plan.parts[index].room:index)};
}
