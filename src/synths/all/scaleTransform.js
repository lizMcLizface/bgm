import {SCALE_FAMILIES,chordSymbol,spellScale} from '../../app/theory';
import {makeKey,degreeToMidi,midiToDegree,resolveNote,chordTones} from '../../seq/harmony';
import {chordRoot} from './chordEditing';
import {placedChordTones} from './placedChords';

const mod=(n,m)=>((n%m)+m)%m;
export const keyId=key=>`${key.tonic}:${key.scale.join(',')}`;
const sameKey=(a,b)=>keyId(a)===keyId(b);
const pcs=key=>key.scale.map(n=>mod(key.tonic+n,12));
const modeFor=scale=>SCALE_FAMILIES.flatMap(f=>f.modes).find(m=>JSON.stringify(makeKey(m.id).scale)===JSON.stringify(scale));
export function keyAt(project,bar){
 const chord=project.chords.findLast(c=>c.bar<=bar),part=project.progressions?.find(p=>bar>=p.startBar&&bar<p.startBar+p.bars);
 if(chord?.key&&(!part||chord.bar>=part.startBar))return chord.key;
 if(chord?.scalePcs?.length&&(!part?.key||chord.bar>=part.startBar)){
  const tonic=chord.scalePcs[0],scale=chord.scalePcs.map(pc=>mod(pc-tonic,12)),mode=modeFor(scale);
  if(mode)return makeKey(mode.id,tonic);
 }
 return part?.key??project.key;
}

/** Scale cardinality changes retain octave placement, mapping degree positions. */
export function mapDegree(note,from,to){
 const d=note.d??0,n=from.scale.length,m=to.scale.length,octave=Math.floor(d/n),degree=mod(d,n);
 return {d:octave*m+(n===m?degree:Math.round(degree*(m-1)/Math.max(1,n-1))),o:note.o??0,a:note.a??0};
}
const mapMidi=(midi,from,to)=>degreeToMidi(to,mapDegree(midiToDegree(from,midi),from,to));
const mapRange=(range,from,to)=>range.map(n=>Math.max(0,Math.min(127,mapMidi(n,from,to))));
const checked=midi=>{if(!Number.isFinite(midi)||midi<0||midi>127)throw new Error('Transposition exceeds the MIDI note range');return midi;};
const relative=(note,follow,storage,from)=>{
 const midi=resolveNote(note,{follow,key:storage}),saved=note.transposeDegree;
 if(saved?.key===keyId(from)&&degreeToMidi(from,saved)===midi)return saved;
 return follow!=='off'&&sameKey(storage,from)?note:midiToDegree(from,midi);
};
function contextMap(context,from,to){
 if(sameKey(context,from))return to;
 const root=mapMidi(60+context.tonic,from,to),scale=[...new Set(context.scale.map(n=>mod(mapMidi(60+context.tonic+n,from,to)-root,12)))].sort((a,b)=>a-b);
 return {tonic:mod(root,12),scale,scaleId:modeFor(scale)?.id??'custom'};
}
function shapeOf(chord,context){
 if(chord?.transposeShape)return chord.transposeShape;
 const tones=chord?.pitchClasses,root=chordRoot(chord);if(!tones?.length||root===null)return null;
 const intervals=tones.map(pc=>mod(pc-root,12));
 if(!intervals.some(n=>n===3||n===4)&&intervals.includes(7)&&(intervals.includes(2)||intervals.includes(5)))return 'suspended';
 return tones.some(pc=>!pcs(context).includes(pc))?'borrowed':null;
}
function chordMapping(chord,from,to,context=from){
 const root=chordRoot(chord),shape=shapeOf(chord,context);
 const previous=chord?.transposeRoot;
 const rootNote=previous?.key===keyId(from)&&mod(degreeToMidi(from,previous),12)===root?previous:midiToDegree(from,60+(root??from.tonic));
 const mappedRoot=mapDegree(rootNote,from,to),delta=degreeToMidi(to,mappedRoot)-degreeToMidi(from,rootNote);
 return {shape,root:mappedRoot,delta,pitch:midi=>shape&&chord.pitchClasses.includes(mod(midi,12))?midi+delta:mapMidi(midi,from,to)};
}
function transformChord(chord,from,to,context){
 const mapping=chordMapping(chord,from,to,context),root=mod(degreeToMidi(to,mapping.root),12);
 const prior=chord.transposePitches;
 let last=60+(chordRoot(chord)??from.tonic)-1;
 const degrees=[],notes=chord.pitchClasses?.map((pc,i)=>{
  let midi=60+pc;while(midi<=last)midi+=12;last=midi;
  const saved=prior?.key===keyId(from)&&Array.isArray(prior.notes)?prior.notes[i]:null;
  const degree=saved&&mod(degreeToMidi(from,saved),12)===pc?saved:midiToDegree(from,midi);
  const mapped=mapping.shape?midi+mapping.delta:degreeToMidi(to,mapDegree(degree,from,to));
  degrees.push(mapping.shape?midiToDegree(to,mapped):mapDegree(degree,from,to));return mapped;
 });
 const names=spellScale(to.tonic,to.scale),degree=to.scale.findIndex(n=>mod(to.tonic+n,12)===root),fallback=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
 const name=(names[degree]??fallback[root])+(notes?chordSymbol(notes.map(n=>n-notes[0])):chord.name.replace(/^[A-G][#♯b♭]?/,''));
 const {numeral,...rest}=chord;
 return {...rest,name,...(notes?{pitchClasses:notes.map(n=>mod(n,12)),transposePitches:{key:keyId(to),notes:degrees}}:{}),
  scalePcs:pcs(to),key:to,transposeRoot:{...mapping.root,key:keyId(to)},...(mapping.shape?{transposeShape:mapping.shape}:{})};
}

/** Pitch-only transformation. A limited range leaves earlier progressions intact. */
export function transposeProjectScale(project,target,{startBar=0,endBar=project.bars,whole=true}={}){
 const storage=project.key,destination=whole?target:storage,fromStep=startBar*project.stepsPerBar,toStep=endBar*project.stepsPerBar;
 const contexts=new Map();
 const at=bar=>{
  if(!contexts.has(bar)){
   const context=keyAt(project,bar),from=whole?storage:context,chord=project.chords.findLast(c=>c.bar<=bar);
   contexts.set(bar,{from,context,chord,mapping:chord?chordMapping(chord,from,target,context):null});
  }
  return contexts.get(bar);
 };
 const encode=(note,pattern,bar)=>{
  const {from,mapping}=at(bar),follow=pattern.follow??'scale',old=relative(note,follow,storage,from),degree=mapDegree(old,from,target);
  const raw=resolveNote(note,{follow,key:storage}),protectedTone=mapping?.shape&&at(bar).chord.pitchClasses.includes(mod(raw,12));
  const midi=protectedTone?raw+mapping.delta:degreeToMidi(target,degree);checked(midi+12*(pattern.octave??0));
  const local=protectedTone?midiToDegree(target,midi):degree;
  const {transposeDegree,...rest}=note;
  const value=follow==='off'?{midi,o:0,a:0}:whole?local:midiToDegree(destination,midi);
  const source=note.chordSource;
  return {...rest,...value,...(!whole?{transposeDegree:{...local,key:keyId(target)}}:{}),...(source?{chordSource:{...source,root:mod(mapping?.shape&&source.root===chordRoot(at(bar).chord)?degreeToMidi(target,mapping.root):mapMidi(60+source.root,from,target),12)}}:{})};
 };
 const mapPlaced=(chord,pattern)=>{
  const bar=Math.floor(chord.start/project.stepsPerBar),{from}=at(bar),root=relative(chord.root,'scale',storage,from),mapped=mapDegree(root,from,target);
  const {transposeVoicing,...rest}=chord,targetChord={...rest,root:mapped};
  if(chord.voicing||['sus2','sus4'].includes(chord.colour)){
   const original=placedChordTones(storage,chord),oldRoot=degreeToMidi(storage,chord.root),rootMidi=degreeToMidi(target,mapped);
   const protectedShape=chord.transposeShape||(['sus2','sus4'].includes(chord.colour)?'suspended':chord.quality&&chord.quality!=='diatonic'?'borrowed':shapeOf({pitchClasses:[mod(oldRoot,12),...original.map(n=>mod(n,12))]},from));
   if(protectedShape)targetChord.transposeShape=protectedShape;
   const local=original.map((n,i)=>{const saved=transposeVoicing?.key===keyId(from)?transposeVoicing.notes[i]:null;return saved&&degreeToMidi(from,saved)===n?saved:midiToDegree(from,n);});
   const notes=original.map((n,i)=>protectedShape?n+rootMidi-oldRoot:degreeToMidi(target,mapDegree(local[i],from,target)));
   targetChord.transposeVoicing={key:keyId(target),notes:notes.map((n,i)=>protectedShape?midiToDegree(target,n):mapDegree(local[i],from,target))};
   targetChord.voicing=notes.map(n=>n-rootMidi);
   if(chord.strikes){const sorted=[...new Set(notes)].sort((a,b)=>a-b);targetChord.strikes=chord.strikes.map(s=>({...s,tone:sorted.indexOf(notes[s.tone])}));}
  }
  const tones=placedChordTones(target,targetChord);tones.forEach(n=>checked(n));
  if(whole)return targetChord;
  const rootMidi=degreeToMidi(target,mapped);
  return {...targetChord,root:{...midiToDegree(storage,rootMidi),transposeDegree:{...mapped,key:keyId(target)}},voicing:tones.map(n=>n-rootMidi)};
 };
 const patterns=Object.fromEntries(Object.entries(project.patterns).map(([role,pattern])=>{
  if(role==='perc')return [role,pattern];
  let materialized=false;
  const steps=pattern.steps.map((step,i)=>{
   if(!step||i<fromStep||i>=toStep)return step;
   const bar=Math.floor(i/project.stepsPerBar),{from}=at(bar),next={...step};
   if(step.n)next.n=step.n.map(note=>encode(note,pattern,bar));
   if(step.chord){
    if(whole){next.chord={...step.chord,...mapDegree(step.chord,storage,target)};chordTones(target,next.chord).forEach(n=>checked(n+12*(pattern.octave??0)));}
    else {
     const {chord,...rest}=next;materialized=true;
     const notes=chordTones(storage,chord).map(midi=>encode({midi},{...pattern,follow:'off'},bar));
     const range=step.range??pattern.range;
     return {...rest,n:notes.map(note=>pattern.follow==='off'?note:{...note,...midiToDegree(storage,note.midi)}),...(range?{range:mapRange(range,from,target)}:{})};
    }
   }
   const range=step.range??pattern.range;if(range)next.range=mapRange(range,from,target);
   return next;
  });
  const chords=pattern.chords?.map(c=>c.start>=fromStep&&c.start<toStep?mapPlaced(c,pattern):c);
  return [role,{...pattern,steps,...(materialized?{mode:'poly'}:{}),...(chords?{chords}:{}),...(whole&&pattern.range?{range:mapRange(pattern.range,storage,target)}:{})}];
 }));
 const timeline=[...project.chords];
 if(!whole)for(const bar of [startBar,endBar])if(bar<project.bars&&!timeline.some(c=>c.bar===bar)){const previous=project.chords.findLast(c=>c.bar<=bar),key=keyAt(project,bar);if(previous)timeline.push({...previous,bar,key,scalePcs:pcs(key)});}
 timeline.sort((a,b)=>a.bar-b.bar);
 const chords=timeline.map(c=>{
  if(c.bar<startBar||c.bar>=endBar)return c;
  const {from,context}=at(c.bar),mapped=transformChord(c,from,target,context);
  if(whole){const local=contextMap(context,storage,target);mapped.key=local;mapped.scalePcs=pcs(local);}
  return mapped;
 });
 const progressions=project.progressions?.map(part=>{
  if(part.startBar<startBar||part.startBar>=endBar)return part;
  const context=whole?contextMap(keyAt(project,part.startBar),storage,target):target;
  const preceding=chords.findLast(c=>c.bar<=part.startBar);
  return {...part,key:context,chords:[...(preceding?[{...preceding,bar:0}]:[]),...chords.filter(c=>c.bar>part.startBar&&c.bar<part.startBar+part.bars).map(c=>({...c,bar:c.bar-part.startBar}))]};
 });
 return {...project,key:destination,patterns,chords,...(progressions?{progressions}:{} )};
}
