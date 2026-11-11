import {validatePatch} from './runtime.js';
import {assertSerialRealtimeAllowed} from './executionPolicy.js';
export const DEFAULT_SOURCE_GROUPS=[[1,5],[2,3],[4,6]];

// Deliberately bounded six-source cut, not arbitrary graph distribution. Each
// stage is still compiled/validated by the Rust graph that owns it.
export function planSourcePool(raw,contracts,groups=DEFAULT_SOURCE_GROUPS){
  const patch=validatePatch(raw,contracts),sourceIds=[1,2,3,4,5,6];
  groups=groups.map(g=>[...g]);
  if(groups.length<2||groups.length>6||groups.some(g=>!g.length)||groups.flat().length!==6||new Set(groups.flat()).size!==6||groups.flat().some(id=>!sourceIds.includes(id)))throw Error('Pool must partition all six sources exactly once');
  for(const id of sourceIds){const n=patch.modules.find(n=>n.id===id);if(!n||!['legacy.core','legacy.fm','legacy.piano','legacy.iowa','legacy.percussion'].includes(n.type)||(id===6)!==(n.type==='legacy.percussion'))throw Error('Unsupported source partition');}
  const masterModules=patch.modules.filter(n=>!sourceIds.includes(n.id));
  assertSerialRealtimeAllowed({modules:masterModules},contracts);
  const masterType=type=>['ref.mix','graph.compressor','ref.output','legacy.inserts','legacy.effects','graph.delay','voice.shimmer','voice.motion','voice.tape'].includes(type)||type.startsWith('desk.')||type.startsWith('rack.');
  if(masterModules.some(n=>!masterType(n.type))||patch.connections.some(e=>e.kind!=='audio'||sourceIds.includes(e.to.module)||sourceIds.includes(e.from.module)&&!['audio.out','kick.out'].includes(e.from.port)))throw Error('Unsupported cross-stage dependency');
  if(patch.modules.some(n=>n.id===7))throw Error('Reserved kick host ID');
  const owners=new Map(),sourceGroup=new Map(groups.flatMap((g,i)=>g.map(id=>[id,i])));
  for(const e of patch.events){const group=sourceGroup.get(e.target)??'MASTER';if(owners.has(e.owner)&&owners.get(e.owner)!==group)throw Error('Cross-worker or source/master event owner is unsupported');owners.set(e.owner,group);}
  const policy=patch.latencyCompensation===undefined?{}:{latencyCompensation:patch.latencyCompensation};
  const sources=groups.map(ids=>validatePatch({version:patch.version,...policy,
    modules:[...patch.modules.filter(n=>ids.includes(n.id)),{id:9001,type:'ref.output',version:1,parameters:{}}],
    connections:[{id:1,kind:'audio',from:{module:ids[0],port:'audio.out'},to:{module:9001,port:'program.in'}}],events:patch.events.filter(e=>ids.includes(e.target))},contracts));
  const master=validatePatch({version:patch.version,...policy,
    modules:[...sourceIds.map(id=>({id,type:'host.audio',version:1,parameters:{}})),{id:7,type:'host.audio',version:1,parameters:{}},...masterModules],
    connections:patch.connections.map(e=>e.from.port==='kick.out'?{...e,from:{module:7,port:'audio.out'}}:e),events:patch.events.filter(e=>!sourceGroup.has(e.target))},contracts);
  // Expose the dependency cut and master levels rather than assuming mixers,
  // key detector and output can be dispatched as independent source jobs.
  const levels=[],ready=new Set();
  while(ready.size<master.modules.length){const level=master.modules.filter(n=>!ready.has(n.id)&&master.connections.filter(e=>e.to.module===n.id).every(e=>ready.has(e.from.module))).map(n=>n.id);if(!level.length)throw Error('Pool master cycle');levels.push(level);level.forEach(id=>ready.add(id));}
  return {groups,sources,master,sourceGroup,owners,levels,latencyCompensation:patch.latencyCompensation===true};
}

// Latency crosses the source/master boundary as measured prepared metadata.
// Descriptors can declare null latency (e.g. FM); never substitute a guessed 0.
export function preparePoolMaster(plan,readyMessages,contracts){
  if(!plan.latencyCompensation)return {patch:plan.master,sourceLatencies:null};
  if(!Array.isArray(readyMessages)||readyMessages.length!==plan.groups.length)throw Error('Pool requires prepared source latency metadata');
  const sourceLatencies={};
  for(const [group,ids]of plan.groups.entries()){
    const map=readyMessages[group]?.sourceLatencies;
    if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length!==ids.length||ids.some(id=>!Object.hasOwn(map,id)||!Number.isFinite(map[id])||map[id]<0||map[id]>262144))throw Error('Pool requires actual prepared source latencies for every source');
    for(const id of ids)sourceLatencies[id]=map[id];
  }
  const patch=validatePatch({...plan.master,modules:plan.master.modules.map(n=>n.type==='host.audio'?{...n,config:{version:1,latencyFrames:n.id===7?0:sourceLatencies[n.id]}}:n)},contracts);
  return {patch,sourceLatencies};
}
