import {degreeToMidi,midiToDegree} from '../../seq/harmony';
import {heldSteps} from '../../seq/notes';

// Captured projects use four steps per meter unit, regardless of its denominator.
export function gridResolutions(meter='4/4') {
 const denominator=Number(meter.split('/')[1]);
 return denominator===8
  ?[{label:'1/8',steps:4},{label:'1/16',steps:2},{label:'1/32',steps:1}]
  :[{label:'1/4',steps:4},{label:'1/8',steps:2},{label:'1/16',steps:1}];
}

export function soundingNotes(pattern,start,end,key) {
 if(!pattern)return [];
 const notes=[];
 for(let i=0;i<end;i++){
  const step=pattern.steps[i];
  if(!step?.n)continue;
  for(const note of step.n){
   const len=note.len??heldSteps(pattern,i);
   if(i+len>start)notes.push({midi:degreeToMidi(key,note)+12*(pattern.octave??0),start:i,end:Math.min(pattern.steps.length,i+len)});
  }
 }
 return notes;
}

export function editPitch(pattern,key,start,end,midi,{replace=false}={}) {
 const steps=pattern.steps.map((s,i)=>s?{...s,n:s.n?.map(n=>({...n,len:n.len??heldSteps(pattern,i)}))}:null);
 const matching=soundingNotes(pattern,start,end,key).filter(n=>n.midi===midi);
 const remove=!replace&&matching.length===1&&matching[0].start===start&&matching[0].end===end;
 for(const found of matching){
  const original=steps[found.start], index=original.n.findIndex(n=>degreeToMidi(key,n)+12*(pattern.octave??0)===midi);
  const note=original.n[index];
  original.n.splice(index,1);
  if(found.start<start)original.n.push({...note,len:start-found.start});
  if(!original.n.length)steps[found.start]=null;
  if(found.end>end){
   const tail=steps[end]??{n:[],vel:original.vel};
   tail.n.push({...note,len:found.end-end});steps[end]=tail;
  }
 }
 if(!remove){
  const step=steps[start]??{n:[],vel:0.8};
  step.n.push({...midiToDegree(key,midi-12*(pattern.octave??0)),len:end-start});
  steps[start]=step;
 }
 return {...pattern,mode:'poly',steps};
}

export function editDrum(pattern,start,end,drum) {
 const steps=[...pattern.steps];
 const hits=steps.slice(start,end).flatMap(s=>s?.hits??[]).filter(hit=>hit.drum===drum);
 const remove=hits.length===1&&steps[start]?.hits?.some(hit=>hit.drum===drum);
 for(let i=start;i<end;i++){
  if(!steps[i])continue;
  const remaining=steps[i].hits.filter(hit=>hit.drum!==drum);
  steps[i]=remaining.length?{...steps[i],hits:remaining}:null;
 }
 if(!remove){
  const step=steps[start]??{hits:[]};
  steps[start]={...step,hits:[...step.hits,{drum,velocity:.8,duration:1}]};
 }
 return {...pattern,steps};
}
