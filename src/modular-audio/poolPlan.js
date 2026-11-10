import {validatePatch} from './runtime.js';
export const DEFAULT_SOURCE_GROUPS=[[1,5],[2,3],[4,6]];

// Deliberately bounded six-source cut, not arbitrary graph distribution. Each
// stage is still compiled/validated by the Rust graph that owns it.
export function planSourcePool(raw,contracts,groups=DEFAULT_SOURCE_GROUPS){
  const patch=validatePatch(raw,contracts),sourceIds=[1,2,3,4,5,6];
  groups=groups.map(g=>[...g]);
  if(groups.length<2||groups.length>6||groups.some(g=>!g.length)||groups.flat().length!==6||new Set(groups.flat()).size!==6||groups.flat().some(id=>!sourceIds.includes(id)))throw Error('Pool must partition all six sources exactly once');
  for(const id of sourceIds){const n=patch.modules.find(n=>n.id===id);if(!n||!['legacy.core','legacy.fm','legacy.piano','legacy.iowa','legacy.percussion'].includes(n.type)||(id===6)!==(n.type==='legacy.percussion'))throw Error('Unsupported source partition');}
  if(patch.modules.some(n=>!sourceIds.includes(n.id)&&!['ref.mix','graph.compressor','ref.output'].includes(n.type))||patch.connections.some(e=>e.kind!=='audio'||sourceIds.includes(e.to.module)||sourceIds.includes(e.from.module)&&!['audio.out','kick.out'].includes(e.from.port)))throw Error('Unsupported cross-stage dependency');
  if(patch.modules.some(n=>n.id===7))throw Error('Reserved kick host ID');
  const owners=new Map(),sourceGroup=new Map(groups.flatMap((g,i)=>g.map(id=>[id,i])));
  for(const e of patch.events){const group=sourceGroup.get(e.target);if(group===undefined)throw Error('Pool prototype requires source-owned events');if(owners.has(e.owner)&&owners.get(e.owner)!==group)throw Error('Cross-worker event owner is unsupported');owners.set(e.owner,group);}
  const sources=groups.map(ids=>validatePatch({version:patch.version,
    modules:[...patch.modules.filter(n=>ids.includes(n.id)),{id:9001,type:'ref.output',version:1,parameters:{}}],
    connections:[{id:1,kind:'audio',from:{module:ids[0],port:'audio.out'},to:{module:9001,port:'program.in'}}],events:patch.events.filter(e=>ids.includes(e.target))},contracts));
  const master=validatePatch({version:patch.version,
    modules:[...sourceIds.map(id=>({id,type:'host.audio',version:1,parameters:{}})),{id:7,type:'host.audio',version:1,parameters:{}},...patch.modules.filter(n=>!sourceIds.includes(n.id))],
    connections:patch.connections.map(e=>e.from.port==='kick.out'?{...e,from:{module:7,port:'audio.out'}}:e),events:[]},contracts);
  // Expose the dependency cut and master levels rather than assuming mixers,
  // key detector and output can be dispatched as independent source jobs.
  const levels=[],ready=new Set();
  while(ready.size<master.modules.length){const level=master.modules.filter(n=>!ready.has(n.id)&&master.connections.filter(e=>e.to.module===n.id).every(e=>ready.has(e.from.module))).map(n=>n.id);if(!level.length)throw Error('Pool master cycle');levels.push(level);level.forEach(id=>ready.add(id));}
  return {groups,sources,master,sourceGroup,owners,levels};
}
