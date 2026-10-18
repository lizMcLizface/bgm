import {PROCEDURAL_RECIPES,sanitizeProcedural,proceduralTail} from './proceduralPatch';
import {FM_RECIPES,cloneFM} from './fmPatch';
import {ensembleConfig,finalizeEnsemblePlan} from './ensemblePlan';
import {defaultEffects,sanitizeEffects} from './effectsConfig';
export const SOURCE_SOUNDS=[['felt','Felt piano'],['electric','Electric piano'],['held','Held piano body'],['guitar','Plucked guitar'],['harp','Plucked harp'],['bass','Plucked upright'],['felt-kit','Felt percussion'],['crisp-kit','Crisp percussion'],['mixed','Piano, pluck, FM pad & drums']];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),number=(x,lo,hi,d)=>x!==''&&x!==undefined&&Number.isFinite(Number(x))?clamp(Number(x),lo,hi):d;
export function sourceConfig(raw={}){return {sound:SOURCE_SOUNDS.some(([id])=>id===raw.sound)?raw.sound:'felt',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000,tone:number(raw.tone,-1,1,0),length:number(raw.length,.5,2,1),body:number(raw.body,0,1,.6),hold:number(raw.hold,0,1,.28),echo:number(raw.echo,0,.5,.18),room:raw.room==='private'?'private':'shared',attack:raw.attack==='original'?'original':'rounded'};}
export function sourcePlan(raw={}){
 const config=sourceConfig(raw),c={...ensembleConfig({count:4,bars:4,bpm:88,sampleRate:config.rate,decay:3,master:.7}),...config},cycleSeconds=c.bars*240/c.bpm,beat=60/c.bpm,chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]],mixed=config.sound==='mixed';
 const indices=mixed?[0,4,'fm',5]:[{felt:0,electric:1,held:0,guitar:2,harp:3,bass:4,'felt-kit':5,'crisp-kit':6}[config.sound]];
 const parts=indices.map((index,id)=>{
  const patch=index==='fm'?cloneFM(FM_RECIPES[4]):sanitizeProcedural(PROCEDURAL_RECIPES[index]),kind=index==='fm'?'fm':'procedural',role=index==='fm'?'pad':patch.family==='drums'?'percussion':index===4?'bass':patch.family==='pluck'?'lead':'keys',notes=[],retunes=[];
  if(kind==='procedural'){
   patch.piano.softness=config.attack==='original'?0:clamp(patch.piano.softness-config.tone*.2,0,1);patch.string.softness=config.attack==='original'?0:clamp(patch.string.softness-config.tone*.2,0,1);
   patch.piano.brightness=clamp(patch.piano.brightness+config.tone*.25,0,1);patch.piano.decay=clamp(patch.piano.decay*config.length,.3,5);patch.piano.resonance=config.body;patch.piano.sustain=config.hold;
   patch.string.damping=clamp(patch.string.damping-config.tone*.25,0,1);patch.string.decay=clamp(patch.string.decay*config.length,.15,5);patch.string.resonance=config.body;patch.envelope.release=.65*config.length;
   for(const drum of Object.values(patch.kit))if(typeof drum==='object'){drum.tone=config.tone;drum.decay=config.length;}
  }
  for(let bar=0;bar<c.bars;bar++){
   const chord=chords[bar%4],base=.05+bar*4*beat;
   if(role==='percussion'){
    const crisp=index===6;for(const at of [0,2])notes.push({midi:crisp?12:0,time:base+at*beat,duration:.15,velocity:.6});for(const at of [1,3])notes.push({midi:crisp?11:1,time:base+at*beat,duration:.15,velocity:.48});for(const [i,at]of [.5,1.5,2.5,3.5].entries())notes.push({midi:crisp?13:2,time:base+at*beat,duration:.1,velocity:i%2?.28:.35});
   }else if(role==='pad'||config.sound==='held')chord.forEach(midi=>notes.push({midi,time:base,duration:3.65*beat,velocity:.5}));
   else if(role==='bass')notes.push({midi:chord[0]-12,time:base,duration:3.5*beat,velocity:.65});
   else [0,.75,1.5,2.5,3.25].forEach((at,i)=>notes.push({midi:chord[(bar+i)%4]+(role==='keys'?12:0),time:base+at*beat,duration:.65*beat,velocity:i===0?.65:.52}));
  }
  const release=kind==='procedural'?proceduralTail(patch):Math.max(...patch.operators.map(o=>o.release)),voiceEffects={delayMs:beat*1000*(role==='keys'?.75:role==='bass'?.5:1.5),feedback:role==='keys'?.45:.3,tone:role==='percussion'?3500:5000,send:role==='percussion'?config.echo*.15:role==='bass'?config.echo*.3:config.echo,pingPong:role==='keys'||role==='lead'?1:0,roomSend:.2,room:'shared',roomDecay:10,...patch.routing};
  if(config.room==='private'&&(!mixed||role==='pad'))voiceEffects.room='private';
  return {id,kind,role,name:patch.name,patch,notes,retunes,release,gain:role==='pad'?.55:.8,pan:mixed?(role==='keys'?-.18:role==='pad'?.18:0):0,sends:{dry:1,reverb:role==='percussion'?.35:.8,delay:1},voiceEffects,room:0};
 });
 c.count=parts.length;
 return finalizeEnsemblePlan(c,parts,cycleSeconds,sanitizeEffects({...defaultEffects(),decay:3,reverb:.2,delay:0}));
}
