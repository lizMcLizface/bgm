import {degreeToMidi,midiToDegree,resolveNote} from '../../seq/harmony';
import {heldSteps} from '../../seq/notes';
import {chordSymbol,spellScale} from '../../app/theory';

const mod=(n,m)=>((n%m)+m)%m;
export function chordRoot(chord) {
 if(Number.isInteger(chord?.pitchClasses?.[0]))return mod(chord.pitchClasses[0],12);
 const match=/^([A-G])([#♯b♭]?)/.exec(chord?.name??'');
 if(!match)return null;
 const natural={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1]];
 return mod(natural+(match[2]==='#'||match[2]==='♯'?1:match[2]==='b'||match[2]==='♭'?-1:0),12);
}
export function rootDegree(key,chord) {
 return key.scale.findIndex(n=>mod(key.tonic+n,12)===chordRoot(chord));
}
export function chordSpan(project,part,bar) {
 const chords=project.chords, index=chords.findIndex(c=>c.bar===bar);
 if(index<0)return null;
 const start=Math.max(part.startBar,bar), end=Math.min(part.startBar+part.bars,chords[index+1]?.bar??project.bars);
 return start<end?{index,start,end}:null;
}

function mapNotes(project,start,end,degreeShift,octaves=0) {
 const from=start*project.stepsPerBar,to=end*project.stepsPerBar;
 const patterns=Object.fromEntries(Object.entries(project.patterns).map(([role,pattern])=>{
  if(role==='perc'||!pattern?.steps)return [role,pattern];
  if(pattern.steps.some(s=>s?.chord))throw new Error('Chord-step patterns cannot be transposed here');
  if(pattern.follow==='chord')throw new Error('Chord-following patterns cannot be transposed here');
  const steps=pattern.steps.map(s=>s?{...s,n:[]}:null);
  const add=(at,n,source)=>{
   if(!steps[at])steps[at]={...source,n:[]};
   steps[at].n.push(n);
  };
  pattern.steps.forEach((s,i)=>{
   if(!s?.n)return;
   for(const note of s.n){
    const len=Math.max(1,Math.round(note.len??heldSteps(pattern,i))),endAt=Math.min(pattern.steps.length,i+len);
    const cuts=[i,...[from,to].filter(x=>x>i&&x<endAt),endAt];
    for(let k=0;k<cuts.length-1;k++){
     const a=cuts[k],b=cuts[k+1],inside=a>=from&&a<to;
     let next={...note,len:b-a};
     if(inside){
      if(pattern.follow==='off'){
       const degree=midiToDegree(project.key,resolveNote(note,{follow:'off',key:project.key}));
       const midi=degreeToMidi(project.key,{...degree,d:degree.d+degreeShift,o:degree.o+octaves});
       next={...next,midi,o:0,a:0};
      }else next={...next,d:(note.d??0)+degreeShift,o:(note.o??0)+octaves};
     }
     if(note.chordSource){
      const source=note.chordSource;
      const root=midiToDegree(project.key,60+source.root);
      next.chordSource={...source,group:`${source.group}|${from}-${to}-${inside?'in':'out'}`,root:inside?mod(degreeToMidi(project.key,{...root,d:root.d+degreeShift}),12):source.root};
     }
     add(a,next,s);
    }
   }
  });
  const chords=(pattern.chords??[]).flatMap(chord=>{
   const endAt=chord.start+chord.len,cuts=[chord.start,...[from,to].filter(x=>x>chord.start&&x<endAt),endAt];
   return cuts.slice(0,-1).map((a,i)=>{
    const inside=a>=from&&a<to,root=inside?{...chord.root,d:chord.root.d+degreeShift,o:(chord.root.o??0)+octaves}:chord.root;
    return {...chord,id:i?`${chord.id}-split-${a}`:chord.id,start:a,len:cuts[i+1]-a,root};
   });
  });
  return [role,{...pattern,steps:steps.map(s=>s?.n?.length?s:null),...(pattern.chords?{chords}:{})}];
 }));
 return {...project,patterns};
}

export function transposeChord(project,part,bar,degreeShift,octaves) {
 const span=chordSpan(project,part,bar);
 if(!span)throw new Error('Selected chord is no longer available');
 const chord=project.chords[span.index],oldDegree=rootDegree(project.key,chord);
 if(degreeShift&&oldDegree<0)throw new Error('Cannot transpose a chord whose root is outside the scale');
 if(degreeShift&&(!Array.isArray(chord.pitchClasses)||chord.pitchClasses.length<3))throw new Error('This saved chord lacks pitch metadata; generate a new song to transpose it');
 let next=mapNotes(project,span.start,span.end,degreeShift,octaves);
 let updated={...chord,octaveShift:(chord.octaveShift??0)+octaves};
 if(degreeShift){
  let previous=60+chordRoot(chord)-1;
  const pitches=chord.pitchClasses.map(pc=>{
   let midi=60+mod(pc,12);
   while(midi<=previous)midi+=12;
   previous=midi;
   const note=midiToDegree(project.key,midi);
   return degreeToMidi(project.key,{...note,d:note.d+degreeShift});
  });
  const offsets=pitches.map(n=>n-pitches[0]);
  const suffix=offsets.length===4&&offsets[3]>=12
   ?`${chordSymbol(offsets.slice(0,3))}add${offsets[3]===14?'9':offsets[3]===13?'♭9':offsets[3]===15?'♯9':`(${offsets[3]})`}`
   :chordSymbol(offsets).replace(/^(m|maj)?7\(9\)$/,(_,quality='')=>`${quality}9`);
  const newDegree=mod(oldDegree+degreeShift,project.key.scale.length);
  updated={...updated,name:spellScale(project.key.tonic,project.key.scale)[newDegree]+suffix,pitchClasses:pitches.map(n=>mod(n,12))};
  delete updated.numeral;
 }
 const chords=[...project.chords];
 if(span.start>chord.bar)chords.splice(span.index+1,0,{...updated,bar:span.start});
 else chords[span.index]=updated;
 const after=chords.findIndex(c=>c.bar===span.end);
 if(span.end<project.bars&&after<0)chords.push({...chord,bar:span.end});
 chords.sort((a,b)=>a.bar-b.bar);
 return {...next,chords};
}

export function chordBoundaries(project,part,bar) {
 const limit=part.startBar+part.bars;
 const preceding=[...project.chords].reverse().find(c=>c.bar<=part.startBar);
 const entries=[...(preceding?[{...preceding,bar:part.startBar}]:[]),...project.chords.filter(c=>c.bar>part.startBar&&c.bar<limit)];
 const selected=entries.findIndex(c=>c.bar===Math.max(bar,part.startBar));
 if(selected<0)throw new Error('Selected chord is no longer available');
 return {entries,selected,limit};
}

export function resizeChord(project,part,bar,edge,boundary) {
 const {entries,selected,limit}=chordBoundaries(project,part,bar);
 const starts=entries.map(c=>c.bar),old=[...starts,limit];
 const index=edge==='start'?selected:selected+1;
 if(index===0||index===entries.length)throw new Error('The progression boundary cannot be moved');
 const min=part.startBar+index,max=limit-(entries.length-index);
 if(boundary<min||boundary>max)throw new Error('Each chord must retain at least one bar');
 starts[index]=boundary;
 for(let i=index-1;i>0;i--)starts[i]=Math.min(starts[i],starts[i+1]-1);
 for(let i=index+1;i<starts.length;i++)starts[i]=Math.max(starts[i],starts[i-1]+1);
 const updated=[...starts,limit];
 let result=project;
 for(let b=part.startBar;b<limit;b++){
  const before=old.findIndex((v,i)=>i<entries.length&&v<=b&&b<old[i+1]);
  const after=updated.findIndex((v,i)=>i<entries.length&&v<=b&&b<updated[i+1]);
  if(before===after)continue;
  const oldDegree=rootDegree(project.key,entries[before]),newDegree=rootDegree(project.key,entries[after]);
  if(oldDegree<0||newDegree<0)throw new Error('Cannot remap a chord whose root is outside the scale');
  result=mapNotes(result,b,b+1,newDegree-oldDegree);
 }
 const afterOriginal=[...project.chords].reverse().find(c=>c.bar<=limit);
 const chords=[...project.chords.filter(c=>c.bar<part.startBar),...entries.map((c,i)=>({...c,bar:starts[i]})),...project.chords.filter(c=>c.bar>=limit)];
 if(limit<project.bars&&afterOriginal&&!chords.some(c=>c.bar===limit))chords.push({...afterOriginal,bar:limit});
 chords.sort((a,b)=>a.bar-b.bar);
 return {project:{...result,chords},bar:starts[selected]};
}
