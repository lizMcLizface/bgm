import React from 'react';
import GridControls from './GridControls';

const WIDTH = 16;
const ROWS = 8;

/** The device's pads show one progression per column and one sequencer per row. */
export default function ArrangementGrid({project, sequencers, colours, selected, progression, offset, onOffset, onSelect, onSelectRow, rowAction, mutes, solos, onMute, onSolo}) {
 const parts = project.progressions?.length ? project.progressions : [{startBar:0,bars:project.bars}];
 const maxOffset = Math.max(0,parts.length-WIDTH), start = Math.min(offset,maxOffset);
 const visible = Array.from({length:WIDTH},(_,i)=>parts[start+i]);
 const anySolo = Object.values(solos).some(Boolean);
 return <section className="group wide seq-grid lane-grid pattern arrangement-grid" aria-label="Arrangement">
  <GridControls horizontal={{label:'Progressions',display:`${start+1}–${Math.min(start+WIDTH,parts.length)}`,position:maxOffset?start/maxOffset:0,step:maxOffset?1/maxOffset:0.1,disabled:!maxOffset,onPosition:p=>onOffset(Math.round(p*maxOffset)),onReset:()=>onOffset(0)}}
   vertical={{label:'Voices',display:'—',position:0,disabled:true}}/>
  <div className="grid-display arrangement-ruler" aria-label="Progression timeline">
   {visible.map((part,i)=>part&&<span key={i} className="progression-marker" style={{left:`${i*100/WIDTH}%`,width:`${100/WIDTH}%`}}><b>P{start+i+1}</b><i>{part.startBar+1}–{part.startBar+part.bars}</i></span>)}
  </div>
  <div className="seq-info">
   {Array.from({length:ROWS},(_,i)=>{
    const s=sequencers[i];
    if(!s)return <span key={i} className="lane-info empty" aria-hidden="true"/>;
    const silent=!!mutes[s.role]||(anySolo&&!solos[s.role]);
    return <button type="button" key={s.role} className={'lane-info'+(silent?' silent':'')+(selected===i?' on':'')} style={{'--voice':colours[s.role]}} aria-label={`${s.label} sequencer display`} aria-pressed={selected===i} onClick={()=>onSelectRow(i)}>
     <b>{s.label.toUpperCase()}</b><i>{mutes[s.role]?'MUTED':solos[s.role]?'SOLO':silent?'SILENT':'PLAYING'}</i>
    </button>;
   })}
  </div>
  <div className="seq-names">
   {Array.from({length:ROWS},(_,i)=>{
    const s=sequencers[i];
    if(!s)return <span key={i} className="seq-name empty" aria-hidden="true"/>;
    const active=rowAction==='mute'?!!mutes[s.role]:rowAction==='solo'?!!solos[s.role]:selected===i;
    const action=rowAction==='mute'?'Mute':rowAction==='solo'?'Solo':'Select';
    return <button type="button" key={s.role} className={'seq-name'+(active?' on':'')} style={{'--voice':colours[s.role]}} aria-label={`${action} ${s.label}${rowAction?'':' sequencer'}`} aria-pressed={active} onClick={()=>{if(rowAction==='mute')onMute(s.role);else if(rowAction==='solo')onSolo(s.role);else onSelectRow(i);}}>{s.short}</button>;
   })}
  </div>
  <div className="seq-cells" style={{'--rows':ROWS}}>
   {Array.from({length:ROWS},(_,i)=>visible.map((part,j)=>{
    const s=sequencers[i], index=start+j;
    if(!s||!part)return <span key={`${i}-${j}`} className="cell void" aria-hidden="true"/>;
    const from=part.startBar*project.stepsPerBar, to=from+part.bars*project.stepsPerBar;
    const pattern=project.patterns[s.role];
    const has=!!(pattern?.steps.slice(from,to).some(Boolean)||pattern?.chords?.some(c=>c.start<to&&c.start+c.len>from));
    const chosen=progression===index, selectedCell=chosen&&selected===i;
    return <button type="button" key={`${i}-${j}`} style={{'--voice':colours[s.role]}}
     className={'cell pat'+(chosen?' on':'')+(has?' full':'')+(selectedCell?' picked':'')}
     aria-label={`${s.label}, progression ${index+1}, ${has?'has notes':'empty'}, bars ${part.startBar+1} to ${part.startBar+part.bars}`}
     aria-pressed={selectedCell} onClick={()=>onSelect(i,index)}/>;
   }))}
  </div>
 </section>;
}
