import {createContinuous,appendProgression,keepProgressions} from './continuous';
import {flagKeys} from '../../app/rulebook/session';

export const projectParts=p=>p.progressions?.length?p.progressions:[{startBar:0,bars:p.bars}];
export const liveGeneratorKeys=new Set(['ambience','ambienceShape','ambienceVolume','playMusic','playAmbience','volumes','drumKit','muted','wander','ambienceWander','bus']);

/** Prepare off the scheduler's booking path; publish only at its next boundary. */
export function prepareGeneratorChange(host,project,stream,index,ahead=4,settings=host.g.settings){
 const parts=projectParts(project),flags=Object.fromEntries(flagKeys.map(key=>[key,typeof host.g[key]==='boolean'?host.g[key]:null]));
 const seed=project.seed??host.settings.seed,meterChanged=(project.meter??settings.meter)!==settings.meter;
 let generator;
 if(stream&&!meterChanged){
  const at=stream.generator.snapshot().count-parts.length+index;
  generator=stream.generator.fork(at,settings,flags);
 }else{
  generator=createContinuous(host,seed,settings,undefined,flags);
  if(!meterChanged)for(let i=0;i<index;i++)generator.next(project.key);
 }
 const count=meterChanged?Math.max(parts.length,stream?index+ahead+1:0):Math.max(parts.length-index,stream?ahead+1:0);
 let tail=null;
 for(let i=0;i<count;i++)tail=appendProgression(tail,generator.next(meterChanged?undefined:project.key));
 return {index,tail,generator,meterChanged};
}

export function publishGeneratorChange(project,prepared){
 const prefix=prepared.meterChanged?null:keepProgressions({...project,progressions:projectParts(project)},prepared.index);
 return {...appendProgression(prefix,prepared.tail),bpm:prepared.tail.bpm};
}
