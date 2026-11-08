import {captureProject} from '../../seq/capture';
import {seeded} from '../../app/random';
import {flagKeys} from '../../app/rulebook/session';

// null records an unset flag, whose default may differ from explicit false.
// This must survive JSON when a restored host currently has a rule override.
const cleanFlags=flags=>Object.fromEntries(flagKeys.filter(key=>typeof flags?.[key]==='boolean'||flags?.[key]===null).map(key=>[key,flags[key]??undefined]));
const snapshotFlags=planner=>Object.fromEntries(flagKeys.map(key=>[key,typeof planner[key]==='boolean'?planner[key]:null]));

// Keep the planner's recent context just as the main generator does.
const PLANNER_HISTORY=512;
const HOME_KEYS=['tonic','mode','progression','bpm','barsPerChord'];

export function createContinuous(host,seed,settings,grooveVoices,flags) {
 const planner=host.g.planner();
 planner.settings={...(settings??planner.settings),seed};
 if(grooveVoices)planner.grooveVoices=structuredClone(grooveVoices);
 if(flags)Object.assign(planner,cleanFlags(flags));
 planner.rng=seeded(seed);
 let bar=0,count=0;
 const changes=[];
 const initialSettings=structuredClone(planner.settings);
 const initialVoices=structuredClone(planner.grooveVoices??null);
 const initialFlags=snapshotFlags(planner);
 const api={
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
  update(settings,bookFlags={}){
   if(settings.meter!==planner.settings.meter)throw new Error('A meter change needs a new continuous stream');
   const next=structuredClone(settings),flags=cleanFlags(bookFlags),homeChanged=HOME_KEYS.some(key=>next[key]!==planner.settings[key]);
   planner.settings={...next,seed};Object.assign(planner,flags);
   if(homeChanged){if(planner.planHomeChange)planner.planHomeChange(bar,false);else planner.resetMusicAt=bar;}
   const entry={at:count,settings:next,flags:snapshotFlags(planner)};
   if(changes.at(-1)?.at===count)changes[changes.length-1]=entry;else changes.push(entry);
  },
  snapshot(){return {seed,count,settings:initialSettings,grooveVoices:initialVoices,flags:initialFlags,...(changes.length?{changes:structuredClone(changes)}:{})};},
  fork(at,settings,flags){
   if(!Number.isInteger(at)||at<0||at>count)throw new Error('Invalid progression boundary');
   const copy=createContinuous(host,seed,initialSettings,initialVoices,initialFlags);
   for(let i=0;i<at;i++){const change=changes.find(c=>c.at===i);if(change)copy.update(change.settings,change.flags);copy.next();}
   copy.update(settings,flags);return copy;
  },
 };
 return api;
}

/** Keep played progressions and their edits when replacing the unplayed tail. */
export function keepProgressions(project,count){
 if(!count)return null;
 const parts=project.progressions.slice(0,count),bars=parts.at(-1).startBar+parts.at(-1).bars,steps=bars*project.stepsPerBar;
 return {...project,bars,progressions:parts,chords:project.chords.filter(c=>c.bar<bars),patterns:Object.fromEntries(Object.entries(project.patterns).map(([role,p])=>[role,{...p,length:steps,steps:p.steps.slice(0,steps),...(p.chords?{chords:p.chords.filter(c=>c.start<steps)}:{})}]))};
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
