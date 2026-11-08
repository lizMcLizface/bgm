import {stepEvents} from '../../seq/core';
import {DRUM_LANES,matchesDrumLane} from './drumLanes';
import {DRUM_TRACKS} from '../../app/drumMappings';

// Reuse the drum machine's expression engine; captured hits keep their identity
// and duration while velocity, probability, ratchets, swing and conditions share
// exactly the standalone device's timing rules.
export function drumStepEvents(pattern,step,ctx){
 return (pattern?.steps[step]?.hits??[]).flatMap(hit=>{
  const index=step%2,row=[0,0];row[index]=hit.flam?2:1;
  const lock={velocity:hit.velocity,...hit.lock};
  return stepEvents({rows:[row],locks:{0:{[index]:lock}}},index,{...ctx,length:2}).map(e=>({hit:{...hit,velocity:e.velocity,...(Object.keys(e.params).length?{params:e.params}:{})},time:e.time,stepSec:ctx.stepSec}));
 });
}

export function editDrumLock(pattern,step,lane,lock){
 const steps=[...pattern.steps],original=steps[step];if(!original?.hits)return pattern;
 steps[step]={...original,hits:original.hits.map(hit=>matchesDrumLane(hit,lane)?{...hit,lock:lock??{}}:hit)};
 return {...pattern,steps};
}

export function transformDrums(pattern,start,end,operation,lane=null){
 const steps=pattern.steps.map(s=>s?{...s,hits:[...(s.hits??[])]}:null),length=end-start;
 if(length<=0)return pattern;
 const selected=hit=>!lane||matchesDrumLane(hit,lane);
 const moved=steps.slice(start,end).map(s=>(s?.hits??[]).filter(selected));
 for(let i=start;i<end;i++){
  const keep=(steps[i]?.hits??[]).filter(hit=>!selected(hit));
  const added=operation==='clear'?[]:moved[((i-start-(operation==='right'?1:-1))%length+length)%length];
  const hits=[...keep,...added];steps[i]=hits.length?{...steps[i],hits}:null;
 }
 return {...pattern,steps};
}

export function applyDrumBeat(pattern,start,end,beat){
 const steps=[...pattern.steps];
 // The recipe keys are the machine keys. Prefer the 808's canonical slot and
 // retain extra tom/conga tracks so changing kits doesn't erase their identity.
 const lanes=Object.fromEntries(Object.keys(beat.rows).filter(k=>k!=='A').map(key=>[key,DRUM_LANES.find(l=>l.track===key)??DRUM_LANES.find(l=>DRUM_TRACKS.tr808[l.name]===key)??(key==='rd'?DRUM_LANES.find(l=>l.name==='ride'):key==='cr'?DRUM_LANES.find(l=>l.name==='crash'):null)]));
 for(let i=start;i<end;i++){
  const at=(i-start)%16,hits=Object.entries(lanes).flatMap(([key,lane])=>{
   const value=beat.rows[key][at];if(!lane||!value||value==='.')return [];
   return [{drum:lane.drum,...(lane.track?{track:lane.track}:{}),velocity:.8,duration:1,...(value==='f'?{flam:true}:{}),...(beat.rows.A?.[at]==='x'?{lock:{accent:.5}}:{})}];
  });
  steps[i]=hits.length?{hits}:null;
 }
 return {...pattern,steps};
}
