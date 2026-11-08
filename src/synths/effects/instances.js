import {BOX_UNITS,logicalChain,logicalOrder,routingPatch,rackStages} from './routing';
import {stagesFor} from './order';
import {DRIVE_PEDALS} from './driveModel';

export const INSTANCE_KINDS=[...BOX_UNITS,...Object.keys(DRIVE_PEDALS)];
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function migrateInstances(rack){
 const active=logicalChain(rack);
 return {version:1,compatibility:'legacy',instances:INSTANCE_KINDS.map(kind=>DRIVE_PEDALS[kind]?{id:kind,kind,enabled:false,params:DRIVE_PEDALS[kind].params.defaultValues()}:{id:kind,kind,parameterSource:'rack',params:{}}),chain:logicalOrder(rack).filter(k=>active.includes(k))};
}
export function validInstances(graph,rack){
 if(!record(graph)||graph.version!==1||!['legacy','serial'].includes(graph.compatibility)||!Array.isArray(graph.instances)||!Array.isArray(graph.chain))return false;
 const older=graph.instances.length===INSTANCE_KINDS.length-1&&!graph.instances.some(i=>i.kind==='vibrato');
 if(graph.instances.length!==INSTANCE_KINDS.length&&!older)return false;
 const ids=new Set();
 for(const item of graph.instances){
  if(!record(item)||item.id!==item.kind||!INSTANCE_KINDS.includes(item.kind)||ids.has(item.id)||!record(item.params))return false;
  ids.add(item.id);const spec=DRIVE_PEDALS[item.kind]?.params;
  if(spec){if(typeof item.enabled!=='boolean'||Object.keys(item.params).length!==spec.PARAMS.length||Object.entries(item.params).some(([key,v])=>!spec.BY_KEY[key]||!Number.isFinite(v)||spec.clampValue(key,v)!==v))return false;}
  else if(item.parameterSource!=='rack'||Object.keys(item.params).length)return false;
 }
 if(new Set(graph.chain).size!==graph.chain.length||graph.chain.some(id=>!ids.has(id)))return false;
 const legacy=graph.chain.filter(id=>BOX_UNITS.includes(id)),active=logicalChain(rack),ordered=logicalOrder(rack).filter(id=>active.includes(id));
 if(legacy.join('|')!==ordered.join('|'))return false;
 return graph.compatibility!=='legacy'||graph.chain.join('|')===ordered.join('|');
}
export function upgradeInstances(graph,rack){
 return {...graph,instances:[...graph.instances,...migrateInstances(rack).instances.filter(i=>!graph.instances.some(old=>old.id===i.id))]};
}
export function syncInstances(graph,rack){
 if(!graph)return migrateInstances(rack);
 const active=logicalOrder(rack).filter(id=>logicalChain(rack).includes(id));
 if(graph.compatibility==='legacy')return {...graph,chain:active};
 // Rack presets retain the new processors' slots and settings. Replace only
 // legacy slots, then insert any newly required legacy units before the limiter.
 const next=[...active],chain=graph.chain.flatMap(id=>DRIVE_PEDALS[id]?[id]:next.length?[next.shift()]:[]);
 const at=chain.indexOf('limiter');chain.splice(at<0?chain.length:at,0,...next);
 return {...graph,chain};
}
export function projectInstances(graph,rack){
 const chain=graph.chain.filter(id=>BOX_UNITS.includes(id)),order=[...chain,...logicalOrder(rack).filter(id=>!chain.includes(id))];
 return {...rack,...routingPatch(rack,{chain,order})};
}
/** Preserve legacy fixed-tail conventions when moving an older processor.
 * New processor slots stay put while the legacy adapter canonicalizes its run. */
export function normalizeInstances(graph,rack){
 if(graph.compatibility==='legacy')return graph;
 const projected=projectInstances(graph,rack),ordered=logicalOrder(projected).filter(id=>graph.chain.includes(id));let index=0;
 return {...graph,chain:graph.chain.map(id=>BOX_UNITS.includes(id)?ordered[index++]:id)};
}
export function instanceStages(graph,rack){
 if(!graph||graph.compatibility==='legacy')return rackStages(rack);
 return stagesFor(graph.chain,graph.chain).map(stage=>DRIVE_PEDALS[stage.kind]?{...stage,instance:graph.instances.find(i=>i.id===stage.kind)}:stage);
}
