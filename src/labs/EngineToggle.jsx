import React from 'react';
import {voiceEngine,newEngineLabel} from './catalog';

export default function EngineToggle({voice,engine,label,onChange,shortcut=false}){
 const current=voiceEngine(voice,engine),canSwitch=voice.availability==='both';
 const next=current==='wasm'?'previous':'wasm';
 const name=value=>value==='previous'?'Previous engine':newEngineLabel(voice);
 return <button type="button" className="lab-engine-toggle" aria-label={label}
  aria-pressed={current==='wasm'} aria-keyshortcuts={shortcut&&canSwitch?'B':undefined}
  disabled={!canSwitch} title={canSwitch?`Switch to ${name(next)}${shortcut?' · B':''}`:'This voice is available in one engine only'}
  onClick={()=>onChange(next)}>
  <span>{name(current)}</span><span aria-hidden="true">{canSwitch?'↔':'Only'}{shortcut&&canSwitch&&<> <kbd>B</kbd></>}</span>
 </button>;
}
