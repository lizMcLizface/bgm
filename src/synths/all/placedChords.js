import {diatonicChord} from '../../app/theory';
import {brokenOrder,chordOrder} from '../../app/arranger';
import {arpStep} from '../../labs/arpeggiator';
import {degreeToMidi,midiToDegree} from '../../seq/harmony';
import {chordRoot} from './chordEditing';
import {heldSteps} from '../../seq/notes';
import {parsePattern} from './chordParse';

const mod=(n,m)=>((n%m)+m)%m;
export const ROOTS=['on','-1','-2','off'];
export const COLOURS=['plain','sus2','sus4','add7','add9'];
/** The flavours the chord menu offers: the stack's own colours (add7 is the seventh chord). */
export const FLAVOURS=['plain','sus2','sus4','add6','add9','flat2'];
export const COMPLEXITIES=['power','triad','seven'];
/** A chord borrowed from outside the key: its third and fifth, whatever the scale's own chord on that root has. */
export const QUALITIES=['diatonic','major','minor','dim','aug'];
const QUALITY_INTERVALS={major:[4,7],minor:[3,7],dim:[3,6],aug:[4,8]};
export const DIRECTIONS=['up','down','random','upDown','downUp','broken','out','in'];
export const STYLES=['chord','arp','roll','pulse'];
export const HOLDS=['end',3,2,1];
export const RATES=[1,2,3,4,5,6,7,8,9,10,11,12];
export const NOTE_LENGTHS=['tie',1,2,3,4,6,8,12,16,'end'];

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

const STACK_COLOURS=['sus2','sus4','add9','add6','flat2'];
/** The chord's own tones, low to high, before omissions, inversion and added notes; `root` is the root's pitch. */
export function chordStack(key,chord) {
 const {root}=chord,n=key.scale.length,degree=mod(root.d,n);
 const complexity=chord.complexity??'triad',colour=chord.colour??'plain';
 const offsets=diatonicChord(key.scale,degree+1,complexity==='seven'?4:3,STACK_COLOURS.includes(colour)?colour:'plain');
 const start=key.scale[degree];
 let intervals=offsets.map(x=>x-start);
 const sus=colour==='sus2'||colour==='sus4';
 let third=diatonicChord(key.scale,degree+1,3,'plain')[1]-start;
 const wanted=QUALITY_INTERVALS[chord.quality];
 if(wanted&&intervals.length>=3){
  const fifth=diatonicChord(key.scale,degree+1,3,'plain')[2]-start;
  intervals=intervals.map(x=>x===fifth?wanted[1]:!sus&&x===third?wanted[0]:x);
  if(!sus)third=wanted[0];
 }
 if(complexity==='power')intervals=intervals.filter(x=>x!==third);
 if(colour==='add7'){
  const i=degree+6, seventh=key.scale[i%n]+12*Math.floor(i/n)-start;
  intervals.push(seventh);
 }
 const midi=degreeToMidi(key,root);
 return {root:midi,stack:[...new Set(intervals.map(x=>midi+x))].sort((a,b)=>a-b)};
}

/** What the tone at a stack position is called, from its interval above the root. */
export function toneName(interval,hasThird=true) {
 const i=mod(interval,12),big=interval>=12;
 if(i===0)return 'root';
 if(i===3||i===4)return 'third';
 if(i===1||(i===2&&(big||hasThird)))return 'ninth';
 if(i===2)return 'sus2';
 if(i===5)return hasThird?'11th':'sus4';
 if(i===6||i===7||i===8)return 'fifth';
 if(i===9)return 'sixth';
 return 'seventh';
}
export function stackNames(key,chord) {
 const {root,stack}=chordStack(key,{...chord,voicing:undefined});
 const hasThird=stack.some(x=>[3,4].includes(mod(x-root,12)));
 return stack.map(x=>toneName(x-root,hasThird));
}

/** Omissions the chord menu scrolls through: none, each single tone, then pairs, then triples, in lexicographic order. */
export function omitOptions(count,most=3) {
 const out=[[]];
 const grow=(from,prefix,size)=>{
  if(prefix.length===size){out.push(prefix);return;}
  for(let i=from;i<count;i++)grow(i+1,[...prefix,i],size);
 };
 for(let size=1;size<=Math.min(most,count-1);size++)grow(0,[],size);
 return out;
}

export function placedChordTones(key,chord) {
 const rootMidi=degreeToMidi(key,chord.root);
 let notes;
 if(chord.voicing){
  // an exact voicing kept as it was generated: semitones above the root
  notes=[...new Set(chord.voicing.map(x=>rootMidi+x))].sort((a,b)=>a-b);
 }else{
  const {root:midi,stack}=chordStack(key,chord);
  notes=stack;
  if(chord.omit){
   const kept=stack.filter((_,i)=>!chord.omit.includes(i));
   notes=kept.length?kept:[stack[0]];
   for(let i=0;i<Math.min(chord.inversion??0,notes.length-1);i++)notes=[...notes.slice(1),notes[0]+12].sort((a,b)=>a-b);
   for(const {tone,oct} of chord.add??[]){
    const base=stack[tone];
    if(base===undefined)continue;
    const sounding=notes.find(x=>mod(x,12)===mod(base,12))??base;
    notes.push(sounding+12*oct);
   }
  }else{
   for(let i=0;i<Math.min(chord.inversion??0,notes.length-1);i++)notes=[...notes.slice(1),notes[0]+12].sort((a,b)=>a-b);
   const voicing=chord.rootVoicing??'on';
   if(voicing!=='on'){
    notes=notes.filter(x=>mod(x-midi,12)!==0);
    if(voicing==='-1'||voicing==='-2')notes.push(midi+12*Number(voicing));
   }
  }
  notes=[...new Set(notes)].sort((a,b)=>a-b);
 }
 if(notes.some(x=>x<0||x>127))throw new Error('Chord voicing exceeds the MIDI note range');
 return notes;
}

/**
 * The chord parts the generator wrote into a captured pattern, read as chord-menu settings (chordParse.js): each plays exactly its own notes.
 * Parts that are figures rather than chords were already left as plain notes by the capture.
 */
export function generatedChords(pattern,key,stepsPerBar=16) {
 return parsePattern(pattern,key,stepsPerBar).filter(g=>g.kind==='chord').map(g=>({
  id:`generated:${g.group}`,sourceGroup:g.group,source:g.source,items:g.items,parsedStyle:g.style,exact:g.exact,...g.chord,
 }));
}

export function materializeGeneratedChord(pattern,key,chord) {
 const first=chord.items[0],step=pattern.steps[first.start],note=step.n[first.index];
 const without=deleteItems(pattern,chord.items);
 const id=nextChordId(without);
 const {sourceGroup,source,items,parsedStyle,exact,...settings}=chord;
 return {pattern:{...without,chords:[...(without.chords??[]),{...settings,id,
  vel:note.vel??step.vel??.8,gate:note.gate??step.gate??pattern.gate??.8,prob:note.prob??step.prob??1}]},id};
}

/** The hit slots of an arpeggio, pulse or roll over the chord's length: every `rate` steps, thinned by the rate flavour `mask` ('x' strikes, '.' rests, repeating). */
export function hitOffsets(chord) {
 const rate=Math.max(1,chord.rate??1),hits=[];
 for(let k=0;k*rate<chord.len;k++)if(!chord.mask||chord.mask[k%chord.mask.length]==='x')hits.push(k*rate);
 return hits;
}

/**
 * Everything a chord strikes: [{ at (steps from its start, fractional allowed), note, len (steps), vel?, spill }], from its style, rate, rate flavour,
 * note length and direction, or exactly as the custom `strikes` say ({ at, tone (index into its tones), len, vel }).
 */
export function chordStrikes(key,chord,{cycle=0}={}) {
 const pitches=placedChordTones(key,chord),L=chord.len,mode=chord.playMode??'chord',noteLen=chord.noteLen,spill=!!chord.spill;
 if(chord.strikes)return chord.strikes.filter(s=>pitches[s.tone]!==undefined&&s.at<L).map(s=>({at:s.at,note:pitches[s.tone],len:s.len,vel:s.vel,spill:false}));
 if(mode==='chord')return pitches.map(note=>({at:0,note,len:typeof noteLen==='number'?noteLen:L,spill}));
 const rate=Math.max(1,chord.rate??1),direction=chord.direction??'up',phase=chord.phase??0,n=pitches.length;
 const lenAt=(at,next)=>{
  if(typeof noteLen==='number')return noteLen;
  if(noteLen==='end')return L-at;
  if(noteLen==='tie')return (next??L)-at;
  return null;
 };
 if(mode==='roll'){
  const order=direction==='broken'?brokenOrder(n):chordOrder(direction==='down'||direction==='out'||direction==='in'?direction:'up',n);
  return order.map((index,rank)=>({at:rank*rate,note:pitches[index],len:lenAt(rank*rate,L)??L-rank*rate,spill})).filter(s=>s.at<L);
 }
 const hits=hitOffsets(chord);
 const lastAs=(list)=>{
  if(!chord.endAsOne||!list.length)return list;
  const last=Math.max(...list.map(s=>s.at));
  return list.map(s=>s.at===last?{...s,len:L-s.at,spill:false}:s);
 };
 if(mode==='pulse')return lastAs(hits.flatMap((at,k)=>pitches.map(note=>({at,note,len:lenAt(at,hits[k+1])??((hits[k+1]??L)-at),spill}))));
 const seed=chord.start+degreeToMidi(key,chord.root)+Math.imul(cycle,2654435761);
 const order=direction==='broken'?brokenOrder(n):direction==='out'||direction==='in'?chordOrder(direction,n):null;
 return lastAs(hits.flatMap((at,k)=>{
  const note=order?pitches[order[(k+phase)%order.length]]:arpStep(pitches,k+phase,direction,seed)[0];
  if(note===undefined)return [];
  const len=lenAt(at,hits[k+1])??(chord.hold==='end'?L-at:(chord.hold??1)*rate);
  return [{at,note,len,spill}];
 }));
}

const strikeCache=new WeakMap();
export function placedChordEvents(pattern,step,{key,time,stepSec,track=0,cycle=0},endStep=null) {
 const events=[];
 for(const chord of pattern.chords??[]){
  const offset=step-chord.start;
  if(offset<0||offset>=chord.len)continue;
  const hash=Math.imul((chord.start+1)^Math.imul(cycle+1,0x9e3779b1),0x85ebca6b)>>>0;
  if((chord.prob??1)<1&&hash/0x100000000>=(chord.prob??1))continue;
  let cached=strikeCache.get(chord);
  if(!cached||cached.key!==key||cached.cycle!==cycle)strikeCache.set(chord,cached={key,cycle,strikes:chordStrikes(key,chord,{cycle})});
  for(const s of cached.strikes){
   if(Math.floor(s.at+1e-6)!==offset)continue;
   const frac=Math.max(0,s.at-offset);
   const len=Math.min(s.len,s.spill?Infinity:chord.len-s.at,endStep===null?Infinity:endStep-step);
   events.push({track,time:time+frac*stepSec,note:s.note,duration:Math.max(.001,(len-1+(chord.gate??1))*stepSec),velocity:s.vel??chord.vel??.8,params:{}});
  }
 }
 return events;
}

export function chordsAt(pattern,start,end,octave,key) {
 return (pattern?.chords??[]).filter(c=>c.start<end&&c.start+c.len>start&&Math.floor(degreeToMidi(key,c.root)/12)-1===octave);
}

export function itemsAt(pattern,key,start,end,{view,rowPc,octave,octaveFilter=null,chordRootsOnly=false,stepsPerBar=16}) {
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
 if(chordRootsOnly)for(const chord of generatedChords(pattern,key,stepsPerBar)){
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
