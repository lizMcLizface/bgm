import React from 'react';
import {DRUM_PARAMS} from './percussion';
import {percussionPads} from './percussionVoices';

const pct=v=>`${Math.round(v*100)}%`;
const display={level:pct,tone:v=>v===0?'neutral':v<0?`darker ${Math.round(-v*100)}%`:`brighter ${Math.round(v*100)}%`,decay:v=>`${v.toFixed(2)}x`};
const DefaultField=({label,children})=><label className="gen-field"><span>{label}</span>{children}</label>;

export default function DrumKitPads({voice,kit,onKit,Field=DefaultField}){
 const setDrum=(name,patch)=>onKit({...kit,[name]:{...kit[name],...patch}});
 return percussionPads(voice).map(({name,label})=><fieldset key={name} className="gen-weights gen-drum">
  <legend><label className="gen-check"><input type="checkbox" checked={kit[name].on} onChange={e=>setDrum(name,{on:e.target.checked})}/>{label}</label></legend>
  {Object.entries(DRUM_PARAMS).map(([key,{min,max,step,label:field}])=><Field key={key} label={`${field} ${display[key](kit[name][key])}`}>
   <input type="range" min={min} max={max} step={step} value={kit[name][key]} disabled={!kit[name].on} onChange={e=>setDrum(name,{[key]:Number(e.target.value)})}/>
  </Field>)}
 </fieldset>);
}
