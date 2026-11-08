import React,{useState} from 'react';
import StepEditor from '../drums/StepEditor';
import {BEATS} from '../drums/beats';
import {DRUM_LANES,drumLaneLabel,matchesDrumLane} from './drumLanes';
import {applyDrumBeat,editDrumLock,transformDrums} from './drumSteps';

export default function DrumTools({pattern,part,stepsPerBar,picked,sound,voice,onEdit,onClose}){
 const [beat,setBeat]=useState(BEATS[0].id),[scope,setScope]=useState('lane');
 const start=part.startBar*stepsPerBar,end=start+part.bars*stepsPerBar;
 const lane=DRUM_LANES[picked?.lane??0],step=picked?.step??-1;
 const hit=pattern?.steps[step]?.hits?.find(h=>matchesDrumLane(h,lane));
 const kit={id:sound?.synth??'tr808',tracks:DRUM_LANES.map(l=>[l.track??l.name,drumLaneLabel(l,sound,voice),drumLaneLabel(l,sound,voice)])};
 return <section className="all-drum-tools" aria-label="Drum pattern tools">
  <header><b>Drum pattern · progression {part.startBar+1}</b><button type="button" onClick={onClose}>Close drum tools</button></header>
  <div className="all-drum-actions"><label>Recipe <select aria-label="Drum recipe" value={beat} onChange={e=>setBeat(e.target.value)}>{BEATS.map(b=><option key={b.id} value={b.id}>{b.category} · {b.name}</option>)}</select></label>
   <button type="button" onClick={()=>onEdit(p=>applyDrumBeat(p,start,end,BEATS.find(b=>b.id===beat)))}>Replace drum progression</button>
   <label>Scope <select aria-label="Drum edit scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="lane">Selected lane</option><option value="all">All drum lanes</option></select></label>
   {['left','right','clear'].map(op=><button type="button" key={op} onClick={()=>onEdit(p=>transformDrums(p,start,end,op,scope==='lane'?lane:null))}>{op==='clear'?'Clear':op==='left'?'Rotate ←':'Rotate →'}</button>)}
  </div>
  {hit?<StepEditor kit={kit} picked={{t:picked.lane,s:step-start}} lock={hit.lock} defaultVelocity={hit.velocity} coreOn showTrackLength={false} supportsPerHit={!!sound?.synth?.startsWith('tr')} onLock={(_t,_s,lock)=>onEdit(p=>editDrumLock(p,step,lane,lock))}/>:<p>Select a lit drum pad to edit its velocity, chance, ratchets, timing and conditions. Recipe replacement affects drums in this progression.</p>}
 </section>;
}
