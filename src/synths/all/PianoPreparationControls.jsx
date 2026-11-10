import React,{useEffect,useState} from 'react';
import {readPianoPreparation,writePianoPreparation,pianoPreparationStats,PIANO_PREPARATION_EVENT} from '../../app/engine/pianoPreparation';
import {clearPianoCache} from '../../app/engine/piano';
export default function PianoPreparationControls({disabled=false}){
 const [mode,setMode]=useState(readPianoPreparation),[stats,setStats]=useState(pianoPreparationStats),[message,setMessage]=useState('');
 useEffect(()=>{const refresh=()=>{setMode(readPianoPreparation());setStats(pianoPreparationStats());};const timer=mode==='rust'?setInterval(refresh,1000):null;window.addEventListener(PIANO_PREPARATION_EVENT,refresh);return()=>{clearInterval(timer);window.removeEventListener(PIANO_PREPARATION_EVENT,refresh);};},[mode]);
 const change=value=>{if(writePianoPreparation(value)){clearPianoCache();setMode(value);setMessage('New piano notes use this choice. Existing notes keep playing.');}else setMessage('Browser storage is unavailable; the preparation choice was not changed.');};
 return <section aria-label="Piano preparation"><label className="source-preview-field">Piano note preparation<select aria-label="Piano note preparation" value={mode} disabled={disabled} onChange={e=>change(e.target.value)}><option value="legacy">Original JavaScript · existing</option><option value="rust">Rust/Wasm · modal + acoustic · opt-in</option></select></label>
  <p className="hint">Applies to normal piano playback and keyboard notes. Felt/electric strikes and held bodies, plus grand/felted/upright strikes use Rust; envelopes, filters and effects keep their existing path. Matched acoustic and calibrated pianos keep their original renderer. This does not yet add piano to the finite Rust source graph.</p>
  <p role="status" aria-label="Piano preparation status">Rust notes: {stats.rustNotes} · Rust bodies: {stats.rustBodies} · original notes: {stats.legacyNotes} · fallbacks: {stats.fallbacks} · other piano models: {stats.unsupported}{stats.version?' · engine '+stats.version:''}{stats.lastError?' · '+stats.lastError:''}</p>
  {message&&<p role="status">{message}</p>}
 </section>;
}
