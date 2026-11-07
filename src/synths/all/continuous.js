import {captureProject} from '../../seq/capture';
import {seeded} from '../../app/random';

// Keep the planner's recent context just as the main generator does.
const PLANNER_HISTORY=512;

export function createContinuous(host,seed,settings,grooveVoices) {
 const planner=host.g.planner();
 planner.settings={...(settings??planner.settings),seed};
 if(grooveVoices)planner.grooveVoices=structuredClone(grooveVoices);
 planner.rng=seeded(seed);
 let bar=0,count=0;
 const initialSettings=structuredClone(planner.settings);
 const initialVoices=structuredClone(planner.grooveVoices??null);
 return {
  next(key) {
   const records=[];
   do {
    if(records.length>=512)throw new Error('Could not complete the next progression');
    planner.planBar(bar);
    const record=planner.plan.get(bar++);
    records.push(record);
   } while(records.at(-1).nextMusic.cycleStart===records.at(-1).music.cycleStart);
   for(const at of planner.plan.keys())if(at<bar-PLANNER_HISTORY)planner.plan.delete(at);
   const project=captureProject(records,{stepsPerBar:Math.round(planner.meter.units*4),key,preserveTails:true});
   count++;
   return {...project,meter:planner.settings.meter,bpm:records[0].bpm??planner.settings.bpm,seed};
  },
  snapshot(){return {seed,count,settings:initialSettings,grooveVoices:initialVoices};},
 };
}

export function appendProgression(project,next) {
 if(!project)return next;
 const offset=project.bars*project.stepsPerBar,extra=next.bars*next.stepsPerBar;
 if(project.stepsPerBar!==next.stepsPerBar)throw new Error('Continuous progression meter changed');
 const roles=new Set([...Object.keys(project.patterns),...Object.keys(next.patterns)]);
 const patterns=Object.fromEntries([...roles].map(role=>{
  const old=project.patterns[role],addition=next.patterns[role];
  const prefix=old?.steps??Array(offset).fill(null);
  const steps=(addition?.steps??Array(extra).fill(null)).map(step=>step?.n?{...step,n:step.n.map(note=>note.chordSource?{...note,chordSource:{...note.chordSource,group:`${offset}:${note.chordSource.group}`}}:note)}:step);
  return [role,{...(old??addition),length:offset+extra,steps:[...prefix,...steps]}];
 }));
 return {...project,bars:project.bars+next.bars,patterns,
  chords:[...project.chords,...next.chords.map(c=>({...c,bar:c.bar+project.bars}))],
  progressions:[...project.progressions,...next.progressions.map(p=>({...p,startBar:p.startBar+project.bars}))]};
}

export function trimProgressions(project,count) {
 if(!count)return project;
 const bars=project.progressions[count].startBar,steps=bars*project.stepsPerBar;
 const patterns=Object.fromEntries(Object.entries(project.patterns).map(([role,pattern])=>[role,{...pattern,length:pattern.length-steps,steps:pattern.steps.slice(steps),
  ...(pattern.chords?{chords:pattern.chords.filter(c=>c.start+c.len>steps).map(c=>({...c,start:Math.max(0,c.start-steps),len:c.len-Math.max(0,steps-c.start)}))}:{})}]));
 return {...project,bars:project.bars-bars,patterns,chords:project.chords.filter(c=>c.bar>=bars).map(c=>({...c,bar:c.bar-bars})),
  progressions:project.progressions.slice(count).map(p=>({...p,startBar:p.startBar-bars}))};
}
