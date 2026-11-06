import {noteStepEvents} from '../../seq/notes';
import {placedChordEvents} from './placedChords';

export function repeatRange(project,step,mode) {
 const bar=Math.min(project.bars-1,Math.max(0,Math.floor(step/project.stepsPerBar)));
 if(mode==='bar')return {startBar:bar,bars:1};
 if(mode!=='chord')throw new Error(`Unknown repeat mode: ${mode}`);
 const index=project.chords.findLastIndex(c=>c.bar<=bar);
 if(index<0)throw new Error('No chord exists at the playhead');
 const startBar=project.chords[index].bar,end=project.chords[index+1]?.bar??project.bars;
 return {startBar,bars:end-startBar};
}

export function repeatNoteEvents(project,step,ctx,length) {
 const endTime=ctx.time+(length-step)*ctx.stepSec;
 const clip=events=>events.map(e=>({...e,duration:Math.min(e.duration,endTime-e.time)})).filter(e=>e.duration>0);
 const events=clip(project.sequencers.flatMap(({pattern,mute},track)=>{
  if(mute||!pattern)return [];
  const absolute=project.start+step,options={...ctx,key:project.key,track};
  return [...noteStepEvents(pattern,absolute%(pattern.length??pattern.steps.length),options),...placedChordEvents(pattern,absolute,options,project.start+length)];
 }));
 if(step!==0)return events;
 const carry=project.sequencers.flatMap(({pattern,mute},track)=>{
  if(mute||!pattern)return [];
  const found=[];
  for(let i=0;i<project.start;i++){
   const patternStep=i%(pattern.length??pattern.steps.length);
   if(!pattern.steps[patternStep])continue;
   const time=ctx.time-(project.start-i)*ctx.stepSec;
   const options={...ctx,time,key:project.key,track};
   for(const event of noteStepEvents(pattern,patternStep,options)){
    const remaining=event.time+event.duration-ctx.time;
    if(event.time<ctx.time&&remaining>1e-8)found.push({...event,time:ctx.time,duration:remaining});
   }
  }
  for(const chord of pattern.chords??[]){
   if(chord.start>=project.start||chord.start+chord.len<=project.start)continue;
   const rate=chord.playMode==='arp'?(chord.rate??1):chord.len;
   const earliest=chord.playMode==='arp'&&chord.hold!=='end'?Math.max(chord.start,project.start-(chord.hold??1)*rate):chord.start;
   const first=chord.start+Math.ceil((earliest-chord.start)/rate)*rate;
   for(let i=first;i<project.start;i+=rate){
    const time=ctx.time-(project.start-i)*ctx.stepSec;
    for(const event of placedChordEvents({chords:[chord]},i,{...ctx,time,key:project.key,track})){
     const remaining=event.time+event.duration-ctx.time;
     if(remaining>1e-8)found.push({...event,time:ctx.time,duration:remaining});
    }
   }
  }
  return found;
 });
 return [...events,...clip(carry)];
}
