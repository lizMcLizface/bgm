import {diatonicChord} from '../../app/theory';
import {brokenOrder} from '../../app/arranger';
import {arpStep} from '../../labs/arpeggiator';
import {degreeToMidi,midiToDegree} from '../../seq/harmony';
import {chordRoot} from './chordEditing';
import {heldSteps} from '../../seq/notes';

const mod=(n,m)=>((n%m)+m)%m;
export const ROOTS=['on','-1','-2','off'];
export const COLOURS=['plain','sus2','sus4','add7','add9'];
export const COMPLEXITIES=['power','triad','seven'];
export const DIRECTIONS=['up','down','random','upDown','downUp','broken'];
export const HOLDS=['end',3,2,1];
export const RATES=[1,2,4,8];

export function nextChordId(pattern) {
 return (pattern.chords??[]).reduce((max,chord)=>{
  const prefix=String(chord.id).match(/^\d+/);
  return prefix?Math.max(max,Number(prefix[0])):max;
 },0)+1;
}

export function newPlacedChord(project,start,end,octave,id) {
 const bar=Math.floor(start/project.stepsPerBar);
 const progression=[...project.chords].reverse().find(c=>c.bar<=bar);
 const pc=chordRoot(progression);
 if(pc===null)throw new Error('The progression chord has no recognizable root');
 const root=midiToDegree(project.key,12*(octave+1)+pc);
 return {id,start,len:end-start,root,rootVoicing:'on',colour:'plain',complexity:'triad',inversion:0,playMode:'chord',direction:'up',hold:1,rate:1};
}

export function placedChordTones(key,chord) {
 const {root}=chord,n=key.scale.length,degree=mod(root.d,n);
 const complexity=chord.complexity??'triad',colour=chord.colour??'plain';
 const offsets=diatonicChord(key.scale,degree+1,complexity==='seven'?4:3,colour==='sus2'||colour==='sus4'||colour==='add9'?colour:'plain');
 const start=key.scale[degree];
 let intervals=offsets.map(x=>x-start);
 if(complexity==='power'){
  const third=diatonicChord(key.scale,degree+1,3,'plain')[1]-start;
  intervals=intervals.filter(x=>x!==third);
 }
 if(colour==='add7'){
  const i=degree+6, seventh=key.scale[i%n]+12*Math.floor(i/n)-start;
  intervals.push(seventh);
 }
 const midi=degreeToMidi(key,root);
 let notes=[...new Set(intervals.map(x=>midi+x))].sort((a,b)=>a-b);
 for(let i=0;i<Math.min(chord.inversion??0,notes.length-1);i++)notes=[...notes.slice(1),notes[0]+12].sort((a,b)=>a-b);
 const voicing=chord.rootVoicing??'on';
 if(voicing!=='on'){
  notes=notes.filter(x=>mod(x-midi,12)!==0);
  if(voicing==='-1'||voicing==='-2')notes.push(midi+12*Number(voicing));
 }
 notes=[...new Set(notes)].sort((a,b)=>a-b);
 if(notes.some(x=>x<0||x>127))throw new Error('Chord voicing exceeds the MIDI note range');
 return notes;
}

export function generatedChords(pattern,key) {
 const groups=new Map();
 pattern?.steps.forEach((step,start)=>{
  step?.n?.forEach((note,index)=>{
   const source=note.chordSource;
   if(!source?.group||!Number.isInteger(source.root))return;
   let group=groups.get(source.group);
   if(!group){
    const midi=degreeToMidi(key,note)+12*(pattern.octave??0);
    const root=midiToDegree(key,12*(Math.floor(midi/12))+mod(source.root,12));
    group={id:`generated:${source.group}`,sourceGroup:source.group,source,root,start,len:1,items:[]};
    groups.set(source.group,group);
   }
   group.start=Math.min(group.start,start);
   group.len=Math.max(group.len,start+(note.len??heldSteps(pattern,start))-group.start);
   group.items.push({type:'note',start,index,midi:degreeToMidi(key,note)+12*(pattern.octave??0)});
  });
 });
 return [...groups.values()].map(group=>({...group,rootVoicing:'on',colour:'plain',complexity:'triad',inversion:0,
  playMode:['arpeggio','sequence'].includes(group.source.style)?'arp':'chord',
  direction:group.source.pattern==='bounce'?'upDown':DIRECTIONS.includes(group.source.pattern)?group.source.pattern:'up',
  hold:1,rate:RATES.reduce((best,n)=>Math.abs(n-(group.source.step??.25)*4)<Math.abs(best-(group.source.step??.25)*4)?n:best,1)}));
}

export function materializeGeneratedChord(pattern,key,chord) {
 const first=chord.items[0],step=pattern.steps[first.start],note=step.n[first.index];
 const without=deleteItems(pattern,chord.items);
 const id=nextChordId(without);
 const {sourceGroup,source,items,...settings}=chord;
 return {pattern:{...without,chords:[...(without.chords??[]),{...settings,id,
  vel:note.vel??step.vel??.8,gate:note.gate??step.gate??pattern.gate??.8,prob:note.prob??step.prob??1}]},id};
}

export function placedChordEvents(pattern,step,{key,time,stepSec,track=0,cycle=0},endStep=null) {
 const events=[];
 for(const chord of pattern.chords??[]){
  const offset=step-chord.start;
  if(offset<0||offset>=chord.len)continue;
  const hash=Math.imul((chord.start+1)^Math.imul(cycle+1,0x9e3779b1),0x85ebca6b)>>>0;
  if((chord.prob??1)<1&&hash/0x100000000>=(chord.prob??1))continue;
  const pitches=placedChordTones(key,chord),remaining=chord.len-offset;
  const limit=endStep===null?remaining:Math.min(remaining,endStep-step);
  const add=(note,duration)=>events.push({track,time,note,duration:Math.max(.001,(duration-1+(chord.gate??1))*stepSec),velocity:chord.vel??.8,params:{}});
  if(chord.playMode!=='arp'){
   if(offset===0) pitches.forEach(note=>add(note,limit));
  }else{
   const rate=chord.rate??1;
   if(offset%rate!==0)continue;
   const index=Math.floor(offset/rate),direction=chord.direction??'up';
   const order=direction==='broken'?brokenOrder(pitches.length):null;
   const note=order?pitches[order[index%order.length]]:arpStep(pitches,index,direction,chord.start+degreeToMidi(key,chord.root)+Math.imul(cycle,2654435761))[0];
   if(note===undefined)continue;
   const duration=chord.hold==='end'?limit:Math.min(limit,(chord.hold??1)*rate);
   add(note,duration);
  }
 }
 return events;
}

export function chordsAt(pattern,start,end,octave,key) {
 return (pattern?.chords??[]).filter(c=>c.start<end&&c.start+c.len>start&&Math.floor(degreeToMidi(key,c.root)/12)-1===octave);
}

export function itemsAt(pattern,key,start,end,{view,rowPc,octave,octaveFilter=null,chordRootsOnly=false}) {
 if(!pattern)return [];
 const items=[];
 for(let i=0;i<end;i++){
  const step=pattern.steps[i];
  if(!step?.n)continue;
  step.n.forEach((note,index)=>{
   if(chordRootsOnly&&note.chordSource?.group)return;
   const midi=degreeToMidi(key,note)+12*(pattern.octave??0),noteOctave=Math.floor(midi/12)-1;
   const len=note.len??heldSteps(pattern,i);
   if(i+len<=start)return;
   if(view==='scale'?(mod(midi,12)!==rowPc||(octaveFilter!==null&&noteOctave!==octaveFilter)):noteOctave!==octave)return;
   items.push({type:'note',start:i,index,midi});
  });
 }
 for(const chord of pattern.chords??[]){
  const midi=degreeToMidi(key,chord.root);
  if(chord.start>=end||chord.start+chord.len<=start)continue;
  const tones=chordRootsOnly?[midi]:placedChordTones(key,chord);
  if(!tones.some(tone=>view==='scale'?(mod(tone,12)===rowPc&&(octaveFilter===null||Math.floor(tone/12)-1===octaveFilter)):Math.floor(tone/12)-1===octave))continue;
  items.push({type:'chord',id:chord.id,start:chord.start,midi});
 }
 if(chordRootsOnly)for(const chord of generatedChords(pattern,key)){
  const midi=degreeToMidi(key,chord.root);
  if(chord.start<end&&chord.start+chord.len>start&&Math.floor(midi/12)-1===octave)items.push({type:'generated',id:chord.id,start:chord.start,midi,items:chord.items});
 }
 return items;
}

export function deleteItems(pattern,items) {
 const chords=new Set(items.filter(x=>x.type==='chord').map(x=>x.id));
 const notes=items.flatMap(x=>x.type==='note'?[x]:x.type==='generated'?x.items:[]);
 const steps=pattern.steps.map((step,i)=>{
  if(!step?.n)return step;
  const remove=new Set(notes.filter(x=>x.start===i).map(x=>x.index));
  if(!remove.size)return step;
  const n=step.n.map(note=>({...note,len:note.len??heldSteps(pattern,i)})).filter((_,index)=>!remove.has(index));
  if(n.length)return {...step,n};
  const rest={...step};delete rest.n;
  return rest.chord?rest:null;
 });
 return {...pattern,steps,chords:(pattern.chords??[]).filter(c=>!chords.has(c.id))};
}

export function insertChord(pattern,key,chord,replace) {
 let next=pattern;
 if(replace){
  const octave=Math.floor(degreeToMidi(key,chord.root)/12)-1;
  next=removeRange(pattern,key,chord.start,chord.start+chord.len,octave);
 }
 return {...next,chords:[...(next.chords??[]),chord]};
}

export function removeRange(pattern,key,start,end,octave) {
 const steps=pattern.steps.map((s,i)=>s?{...s,n:s.n?.map(n=>({...n,len:n.len??heldSteps(pattern,i)}))}:null);
 for(let i=0;i<pattern.steps.length;i++){
  const source=pattern.steps[i];
  if(!source?.n)continue;
  for(let j=source.n.length-1;j>=0;j--){
   const note=source.n[j],midi=degreeToMidi(key,note)+12*(pattern.octave??0),len=note.len??heldSteps(pattern,i),finish=Math.min(pattern.steps.length,i+len);
   if(Math.floor(midi/12)-1!==octave||i>=end||finish<=start)continue;
   steps[i].n.splice(j,1);
   if(i<start)steps[i].n.push({...note,len:start-i});
   if(finish>end){
    const tail=steps[end]??{n:[],vel:source.vel};
    if(!tail.n)tail.n=[];
    tail.n.push({...note,len:finish-end});steps[end]=tail;
   }
  }
  if(steps[i]?.n&&!steps[i].n.length){delete steps[i].n;if(!steps[i].chord)steps[i]=null;}
 }
 const chords=[];
 for(const c of pattern.chords??[]){
  const finish=c.start+c.len;
  if(Math.floor(degreeToMidi(key,c.root)/12)-1!==octave||c.start>=end||finish<=start){chords.push(c);continue;}
  if(c.start<start)chords.push({...c,len:start-c.start});
  if(finish>end)chords.push({...c,id:`${c.id}-tail-${end}`,start:end,len:finish-end});
 }
 return {...pattern,steps,chords};
}
