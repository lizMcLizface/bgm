import React from 'react';
import GridControls from './GridControls';
import {noteName} from '../../labs/Piano';
import {getIntervalColor} from '../../labs/piano/intervals';
import {DRUM_LANES,drumLaneLabel,matchesDrumLane} from './drumLanes';
import {soundingNotes} from './gridTiming';
import {chordRoot} from './chordEditing';
import {generatedChords,placedChordTones} from './placedChords';
import {degreeToMidi} from '../../seq/harmony';
import {chordSymbol,diatonicChord,spellScale} from '../../app/theory';

const mod=(n,m)=>((n%m)+m)%m;
const intervalNames=['Root','Minor second','Major second','Minor third','Major third','Perfect fourth','Diminished fifth','Perfect fifth','Minor sixth','Major sixth','Minor seventh','Major seventh'];
const pitchName=pc=>noteName(60+mod(pc,12)).replace(/\d+$/,'');
const pitchColour=(pc,chord,key,colour)=>{
 const root=chordRoot(chord)??key.tonic;
 const scale=chord?.scalePcs??key.scale.map(n=>mod(key.tonic+n,12));
 return chord?.pitchClasses?.includes(pc)?getIntervalColor(pc-root):scale.includes(pc)?getIntervalColor(pc-(scale[0]??key.tonic)):colour;
};
const octaveColour=(colour,difference)=>{
 if(!difference)return colour;
 const value=difference<0?Math.max(.35,1+difference*.18):Math.min(.6,difference*.18);
 const rgb=colour.match(/^#([0-9a-f]{6})$/i);
 if(!rgb)return colour;
 const n=parseInt(rgb[1],16),channels=[n>>16,(n>>8)&255,n&255];
 const mixed=channels.map(c=>Math.round(difference<0?c*value:c+(255-c)*value));
 return `#${mixed.map(c=>c.toString(16).padStart(2,'0')).join('')}`;
};

/** Scale and non-scale pitches keep their order regardless of chord selection. */
export function pitchClasses(key, offScale) {
 const scale=key.scale.map(n=>mod(key.tonic+n,12));
 if(!offScale)return scale;
 return Array.from({length:12},(_,i)=>mod(key.tonic+i,12)).filter(pc=>!scale.includes(pc));
}

export default function ProgressionGrid({project,displayKey=project.key,pattern,part,colour,offset,onOffset,headRef,view,offScale,onOffScale,octave,onOctave,octaveFilter=null,shiftHeld=false,onFilterOctave=()=>{},pitch,onPitch,onToggleNote,drumMode=false,drumSound=null,drumVoice='felt',drumOffset=0,onDrumOffset,onToggleDrum,stepSize=1,focus=null,onFocus=()=>{},onShiftChord=()=>{},chordMode=false,deleteMode=false,editMode=false,copyMode=false,onEditPad=()=>{},onCopyPad=()=>{},onChordPad=()=>{},onDeletePad=()=>{},selectedPlaced=null,selectedDelete=null,selectedEdit=[]}) {
 const drag=React.useRef(null),suppressClick=React.useRef(false);
 const [preview,setPreview]=React.useState(null);
 React.useEffect(()=>()=>{if(drag.current)clearTimeout(drag.current.hold);},[]);
 const start=part.startBar*project.stepsPerBar, end=(part.startBar+part.bars)*project.stepsPerBar;
 const max=Math.max(start,end-16*stepSize), at=Math.min(max,Math.max(start,start+Math.floor((offset-start)/stepSize)*stepSize));
 const chords=project.chords.filter(c=>c.bar<part.startBar+part.bars);
 const focusChord=chords.find(c=>c.bar===focus);
 const pcs=pitchClasses(displayKey,offScale);
 const chosenPitch=pcs.includes(pitch)?pitch:pcs[0];
 const steps=Array.from({length:16},(_,i)=>at+i*stepSize);
 const generated=chordMode?generatedChords(pattern,project.key,project.stepsPerBar):[];
 const placedByStep=steps.map(step=>[...(pattern?.chords??[]),...generated].filter(c=>c.start<Math.min(end,step+stepSize)&&c.start+c.len>step).map(c=>({...c,rootMidi:degreeToMidi(project.key,c.root),tones:placedChordTones(project.key,c)})));
 const notesByStep=steps.map((step,i)=>{
  if(step>=end)return [];
  const notes=soundingNotes(pattern,step,Math.min(end,step+stepSize),project.key).filter(n=>!(chordMode&&n.group));
  if(!chordMode)for(const chord of placedByStep[i]){
   notes.push(...chord.tones.map(midi=>({midi,start:chord.start,end:chord.start+chord.len,group:String(chord.id)})));
  }
  return notes;
 });
 const maxDrumOffset=Math.max(0,DRUM_LANES.length-8), drumAt=Math.min(maxDrumOffset,drumOffset);
 const chordAt=step=>[...chords].reverse().find(c=>c.bar*project.stepsPerBar<=step);
 const labelRoot=chordRoot(focusChord)??displayKey.tonic;
 const tonicColour=pc=>getIntervalColor(pc-displayKey.tonic);
 const labelColour=pc=>chordMode?tonicColour(pc):offScale?colour:getIntervalColor(pc-labelRoot);
 const interval=pc=>intervalNames[mod(pc-labelRoot,12)];
 const spans=chords.map((chord,i)=>({chord,start:Math.max(at,chord.bar*project.stepsPerBar),end:Math.min(at+16*stepSize,end,(chords[i+1]?.bar??part.startBar+part.bars)*project.stepsPerBar)})).filter(s=>s.start<s.end);
 const gridView=chordMode?'octave':view;
 const filterOct=chordMode?null:octaveFilter;
 const scaleSet=new Set(displayKey.scale.map(n=>mod(displayKey.tonic+n,12)));
 const ROMAN=['I','II','III','IV','V','VI','VII','VIII'];
 // the key's chord on each degree: the progression's own name for it when it plays one, else the diatonic seventh chord
 const degreeChord=pc=>{
  const degree=displayKey.scale.findIndex(n=>mod(displayKey.tonic+n,12)===pc);
  if(degree<0)return null;
  const used=project.chords.find(c=>chordRoot(c)===pc);
  const offsets=diatonicChord(displayKey.scale,degree+1,4),start=displayKey.scale[degree];
  const intervals=offsets.map(x=>x-start),minor=intervals[1]===3;
  const numeral=minor?ROMAN[degree].toLowerCase():ROMAN[degree];
  return {name:used?.name??spellScale(displayKey.tonic,displayKey.scale)[degree]+chordSymbol(intervals),numeral:numeral+(intervals[2]===6?'°':''),degree};
 };
 // In chord mode the boxes beside the rows are a legend, not row names: the rows stay octaves (their buttons say so), the boxes list the key's chord on each degree,
 // one line down from the top, so they visibly do not line up with the rows.
 const legendBox=row=>{
  if(row===0)return {top:'SCALE CHORDS:',bottom:'',legend:true,plain:true};
  const pcRow=pcs[pcs.length-row],info=pcRow===undefined?null:degreeChord(pcRow);
  return info?{top:info.name,bottom:`${info.numeral} · ${pitchName(pcRow)}`,pc:pcRow,legend:true}:{top:'',bottom:'',legend:true,plain:true};
 };
 const labels=Array.from({length:8},(_,row)=>{
  if(drumMode){
   const lane=DRUM_LANES[drumAt+row];
   return lane?{top:drumLaneLabel(lane,drumSound,drumVoice).toUpperCase(),bottom:`DRUM ${drumAt+row+1}`,short:String(drumAt+row+1),press:()=>{}}:null;
  }
  if(row===7)return chordMode?{...legendBox(7),top:legendBox(7).top||'CHORD ROOT',bottom:legendBox(7).bottom||'PROGRESSION',short:'♪',disabled:true}:{top:'PITCH SET',bottom:offScale?'OFF SCALE':'SCALE',short:offScale?'♯':'♪',active:offScale,press:()=>onOffScale(!offScale)};
  if(chordMode)return {...legendBox(row),short:String(8-row),disabled:true};
  if(gridView==='scale'){
   const n=8-row;
   const pc=pcs[pcs.length-1-row];
   return {top:pc===undefined?'—':pitchName(pc),bottom:pc===undefined?'—':interval(pc),short:String(n),pc,active:octave===n,press:()=>onOctave(n)};
  }
  const pc=pcs[pcs.length-1-row];
  return pc===undefined?{top:`OCTAVE ${8-row}`,bottom:'—',short:'—',disabled:true}:{top:`OCTAVE ${8-row}`,bottom:`${pitchName(pc)} · ${interval(pc)}`,short:pitchName(pc),pc,active:chosenPitch===pc,press:()=>onPitch(pc)};
 });
 const lanePc=row=>pcs[pcs.length-1-row];
 const laneOctave=row=>8-row;
 const sounding=(index,row)=>{
  return notesByStep[index].filter(({midi})=>{
   const noteOctave=Math.floor(midi/12)-1;
   return gridView==='scale'?mod(midi,12)===lanePc(row)&&(filterOct===null||noteOctave===octaveFilter):noteOctave===laneOctave(row);
  });
 };
 const dragColumn=(e,d)=>{
  const rect=d.grid.getBoundingClientRect();
  if(!rect.width)return d.current;
  return Math.max(0,Math.min(15,Math.ceil((end-at)/stepSize)-1,Math.floor((e.clientX-rect.left)*16/rect.width)));
 };
 const dragDown=(e,row,i,midi)=>{
  if(e.button!==0||drag.current)return;
  suppressClick.current=false;
  const d={id:e.pointerId,row,start:i,current:i,midi,grid:e.currentTarget.parentElement,moved:false};
  drag.current=d;
  if(deleteMode)d.hold=setTimeout(()=>{if(drag.current!==d)return;d.deleted=true;suppressClick.current=true;onDeletePad(at+i*stepSize,Math.min(end,at+(i+1)*stepSize),row,true);},600);
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const dragMove=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const col=dragColumn(e,d);
  if(col!==d.start){d.moved=true;clearTimeout(d.hold);}
  d.current=col;
  if(d.moved)setPreview({row:d.row,from:Math.min(d.start,col),to:Math.max(d.start,col)});
 };
 const dragEnd=(e,cancelled=false)=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  drag.current=null;clearTimeout(d.hold);setPreview(null);
  if(d.moved){suppressClick.current=true;if(!cancelled&&!deleteMode&&!editMode&&!copyMode){const col=dragColumn(e,d),from=at+Math.min(d.start,col)*stepSize,to=Math.min(end,at+(Math.max(d.start,col)+1)*stepSize);if(chordMode)onChordPad(from,to,d.row,true);else onToggleNote(from,d.midi,to,true);}}
 };
 return <section className="group wide seq-grid lane-grid progression-grid" aria-label="Progression editor">
  <GridControls horizontal={{label:'Page',display:`${(at-start)/stepSize+1}–${Math.ceil((Math.min(end,at+16*stepSize)-start)/stepSize)}`,position:max>start?(at-start)/(max-start):0,step:max>start?Math.min(1,4*stepSize/(max-start)):0.1,disabled:max===start,onPosition:p=>onOffset(Math.min(max,start+Math.round(p*(max-start)/stepSize)*stepSize)),onReset:()=>onOffset(start)}}
   vertical={{label:'Voices',display:drumMode?`${drumAt+1}–${Math.min(DRUM_LANES.length,drumAt+8)}`:'—',position:drumMode?drumAt/maxDrumOffset:0,step:1/maxDrumOffset,disabled:!drumMode,onPosition:p=>onDrumOffset(Math.round(p*maxDrumOffset)),onReset:()=>onDrumOffset(0)}}/>
  <div className="grid-display progression-ruler" aria-label="Chord timeline">
   {spans.map(({chord,start:from,end:to})=><button type="button" key={chord.bar} onClick={e=>{if(shiftHeld||e.shiftKey)onShiftChord(chord.bar);else onFocus(focus===chord.bar?null:chord.bar);}} aria-pressed={focus===chord.bar} aria-label={`Focus chord ${chord.name}, bar ${chord.bar+1}`}
    className={'chord-span'+(focus===chord.bar?' focused':'')+(chordMode?' glow':'')} style={{...(chordMode&&chordRoot(chord)!==null?{'--glow':tonicColour(chordRoot(chord))}:{}),left:`${(from-at)*100/(16*stepSize)}%`,width:`${(to-from)*100/(16*stepSize)}%`}}><b>{chord.name}</b></button>)}
   {steps.map((step,i)=>step<end&&step%project.stepsPerBar===0?<span key={step} className="bar-tick" style={{left:`${i*100/16}%`}}><small>{Math.floor(step/project.stepsPerBar)-part.startBar+1}</small></span>:null)}
  </div>
  <div className="seq-info">
   {labels.map((l,i)=>l?<span className={'lane-info'+(l.legend?' legend':'')+(!drumMode&&gridView==='octave'&&l.pc!==undefined?' octave-label':'')} key={i} style={{'--voice':l.plain?'transparent':l.pc===undefined?colour:labelColour(l.pc)}}><b>{l.top}</b><i>{l.bottom}</i></span>:<span className="lane-info empty" key={i}/>)}
  </div>
  <div className="seq-names">
   {labels.map((l,i)=>l?<button type="button" key={i} className={'seq-name'+((!chordMode&&view==='scale'&&filterOct!==null&&i!==7?octaveFilter===8-i:l.active)?' on':'')} style={{'--voice':!drumMode&&!chordMode&&gridView==='octave'&&l.pc!==undefined?labelColour(l.pc):colour}} aria-label={drumMode?`Audition ${drumLaneLabel(DRUM_LANES[drumAt+i],drumSound,drumVoice)}`:chordMode?i===7?'Progression chord root':`Chord octave ${8-i}`:i===7?'Toggle off-scale notes':view==='scale'?`Select octave ${8-i}`:`Select ${l.short}`} disabled={l.disabled} aria-pressed={!!(!chordMode&&view==='scale'&&filterOct!==null&&i!==7?octaveFilter===8-i:l.active)} onClick={e=>{if(drumMode)onToggleDrum(null,DRUM_LANES[drumAt+i]);else if(!chordMode&&view==='scale'&&i!==7&&(shiftHeld||e.shiftKey))onFilterOctave(8-i);else l.press();}}>{l.short}</button>:<span className="seq-name empty" key={i}/>)}
  </div>
  <div className="seq-cells" ref={headRef} style={{'--rows':8,'--off':at/stepSize,'--step-size':stepSize}}>
   {Array.from({length:8},(_,row)=>steps.map((step,i)=>{
    const pc=lanePc(row), oct=laneOctave(row);
    if(drumMode){
     const lane=DRUM_LANES[drumAt+row];
     if(step>=end||!lane)return <span key={`${row}-${i}`} className="cell void" aria-hidden="true"/>;
     const active=!!pattern?.steps.slice(step,Math.min(end,step+stepSize)).some(s=>s?.hits?.some(hit=>matchesDrumLane(hit,lane)));
     return <button type="button" key={`${row}-${i}`} className={'cell'+(active?' on':'')+(step%project.stepsPerBar===0?' beat':'')} style={{'--voice':colour}} aria-label={`${drumLaneLabel(lane,drumSound,drumVoice)} step ${(step-start)/stepSize+1}`} aria-pressed={active} onClick={()=>onToggleDrum(step,lane,Math.min(end,step+stepSize))}/>;
    }
    if(step>=end||!project.key||(gridView==='scale'&&pc===undefined&&row!==7))return <span key={`${row}-${i}`} className="cell void" aria-hidden="true"/>;
    if(row===7){
     const scale=new Set(displayKey.scale.map(n=>mod(displayKey.tonic+n,12)));
     const hasOff=notesByStep[i].some(n=>!scale.has(mod(n.midi,12))&&(gridView!=='scale'||filterOct===null||Math.floor(n.midi/12)-1===octaveFilter));
     return <span key={`${row}-${i}`} className={'cell off-indicator'+(hasOff?' on':'')+(chordMode?' dark':'')} style={{'--voice':colour}} role="img" aria-label={`Step ${(step-start)/stepSize+1}: ${hasOff?'contains':'no'} off-scale notes`}/>;
    }
    const midi=gridView==='scale'?12*(octave+1)+pc:12*(oct+1)+chosenPitch;
    const placed=placedByStep[i].filter(item=>(chordMode?[item.rootMidi]:item.tones).some(midi=>gridView==='scale'?mod(midi,12)===pc&&(filterOct===null||Math.floor(midi/12)-1===octaveFilter):Math.floor(midi/12)-1===oct));
    const notes=sounding(i,row), chord=chordAt(step);
    const colours=[...new Set([...notes.map(note=>octaveColour(chordMode?tonicColour(mod(note.midi,12)):pitchColour(mod(note.midi,12),chord,displayKey,colour),gridView==='scale'?Math.floor(note.midi/12)-1-octave:0)),...(chordMode?placed.map(item=>tonicColour(mod(item.rootMidi,12))):[])])];
    const held=(notes.length>0||placed.length>0)&&notes.every(note=>note.start<step)&&placed.every(note=>note.start<step);
    const paint=colours.length>1?`linear-gradient(90deg,${colours.map((c,j)=>`${c} ${j*100/colours.length}% ${(j+1)*100/colours.length}%`).join(',')})`:undefined;
    const previewed=preview?.row===row&&i>=preview.from&&i<=preview.to;
    const groups=[...new Set(notes.map(n=>n.group))],grouped=!chordMode&&notes.length>0&&!groups.includes(undefined);
    return <button type="button" key={`${row}-${i}`} className={'cell note-cell'+(notes.length||placed.length?' on':'')+(held?' held':'')+(placed.some(x=>x.id===selectedPlaced)||selectedDelete?.row===row&&selectedDelete.start===step||selectedEdit.some(x=>x.row===row&&x.step===step)?' picked':'')+(previewed?' drag-preview':'')+(grouped?' grouped g'+(String(groups[0]).split('').reduce((h,c)=>h+c.charCodeAt(0),0)%2):'')+(step%project.stepsPerBar===0?' beat':'')+(Math.floor(step/4)%2?' alt':'')}
     style={{'--voice':colours[0]??colour,...(paint?{background:paint}:{})}} aria-label={`${gridView==='scale'?(pc===undefined?'Outside key':pitchName(pc)):`Octave ${oct}`} step ${(step-start)/stepSize+1}${held?', held':''}`} aria-pressed={!!(notes.length||placed.length)}
     onPointerDown={e=>dragDown(e,row,i,midi)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={e=>dragEnd(e,true)} onLostPointerCapture={e=>dragEnd(e,true)}
     onClick={e=>{if(suppressClick.current&&e.detail!==0){suppressClick.current=false;return;}const to=Math.min(end,step+stepSize);if(deleteMode)onDeletePad(step,to,row,false);else if(editMode)onEditPad(step,to,row,shiftHeld||e.shiftKey);else if(copyMode)onCopyPad(step,to,row,midi);else if(chordMode)onChordPad(step,to,row,shiftHeld||e.shiftKey);else onToggleNote(step,midi,to);}}/>;
   }))}
   <div className="playhead"/>
  </div>
 </section>;
}
