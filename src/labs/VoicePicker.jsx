import React from 'react';
import {FAMILIES,voicesFor,voiceById,voiceLabel,availabilityLabel,voiceEngine} from './catalog';
import EngineToggle from './EngineToggle';
import Piano from './Piano';
import {wasmMappingNotes} from '../app/engine/wasmPreset';

export function VoiceBadges({voice,engine}){
 const notes=voice.kind==='legacy'&&engine==='wasm'?wasmMappingNotes(voice.patch):[];
 return <span className="lab-voice-badges">
  {voice.isNew&&<span className="lab-badge lab-badge-new" title="Introduced with the new synth labs">New</span>}
  <span className={'lab-badge lab-badge-'+voice.availability}>{availabilityLabel(voice)}</span>
  {voice.availability==='both'&&engine&&<span className="lab-engine-used">Using {engine==='wasm'?'Wasm translation':'previous engine'}</span>}
  {notes.length>0&&<small className="lab-mapping-note">Approximation: {notes.join(' · ')}.</small>}
 </span>;
}
export default function LabTrack({role,name,source,armed,enabled,active,root,chord,query='',onVoice,onEngine,onArm,onToggle}){
 const voice=voiceById(source.id),engine=voiceEngine(voice,source.engine);
 const match=v=>v.id===source.id||`${v.family} ${v.name} ${v.origin} ${availabilityLabel(v)} ${v.isNew?'new':''}`.toLowerCase().includes(query.toLowerCase());
 return <article className={'lab-track role-'+role+(armed?' selected':'')}>
  <div><label className="lab-check"><input aria-label={'Hear '+name} type="checkbox" checked={enabled} onChange={e=>onToggle(role,e.target.checked)}/>{name}</label><button aria-pressed={armed} onClick={()=>onArm(role)}>Play this</button></div>
  <small className="lab-part-source">{armed?'Voice under test':'Context instrument'}</small>
  <select aria-label={name+' voice'} value={source.id} onChange={e=>onVoice(role,e.target.value)}>
   {FAMILIES.map(([id,n])=>{const voices=voicesFor(id).filter(match);return voices.length?<optgroup key={id} label={n}>{voices.map(v=><option key={v.id} value={v.id}>{voiceLabel(v)}</option>)}</optgroup>:null;})}
  </select>
  <VoiceBadges voice={voice}/>
  <EngineToggle voice={voice} engine={engine} label={name+' engine'} shortcut={armed} onChange={next=>onEngine(role,next)}/>
  <Piano mini low={60} high={71} active={(active??[]).map(n=>60+n%12)} root={root} chord={chord} label={name+' notes'}/>
 </article>;
}
