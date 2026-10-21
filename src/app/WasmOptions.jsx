import {percussionVoice} from './percussionVoices';
import {percussionFromSearch,withPercussion} from '../audio/percussionChoice';
import {perfEnabled,setPerfChoice} from '../audio/perfMode';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {engineFromSearch,withAudioEngine} from './audioEngineChoice';
import {usePerfMode} from '../audio/PerfModeButton';
const KEY='bgm-audio-engine';
// Wasm unless this device chose the previous engine.
function initialEngine(){const linked=engineFromSearch(location.search);if(linked)return linked;try{return localStorage.getItem(KEY)==='legacy'?'legacy':'wasm';}catch{return 'wasm';}}

// One controller keeps the header, shortcut and options in sync. The engine
// rebuilds instruments asynchronously; ignore extra requests while preparing.
export function useAudioEngine(generator,{required=false}={}){
 const [mode,setMode]=useState(generator.audioEngine??'legacy'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const restored=useRef(null),pending=useRef(false),override=useRef(engineFromSearch(location.search)),manual=useRef(initialEngine());
 const choose=useCallback(async (next,{remember=true}={})=>{
  if(pending.current||required&&next!=='wasm')return false;
  pending.current=true;setBusy(true);setError('');const priorPerf=perfEnabled();if(next!=='wasm'&&priorPerf)setPerfChoice(false);
  try{await generator.setAudioEngine(next);const actual=generator.audioEngine??next;setMode(actual);if(remember){manual.current=actual;if(override.current!==null){override.current=actual;history.replaceState(null,'',withAudioEngine(location.pathname+location.search+location.hash,actual));}else try{localStorage.setItem(KEY,actual);}catch{}}return true;}
  catch(e){if(priorPerf)setPerfChoice(true);setMode(generator.audioEngine??'legacy');setError(e.message);return false;}
  finally{pending.current=false;setBusy(false);}
 },[generator,required]);
 const toggle=useCallback(()=>choose(generator.audioEngine==='wasm'?'legacy':'wasm'),[choose,generator]);
 useEffect(()=>{if(busy||pending.current||restored.current?.generator===generator&&restored.current.required===required)return;restored.current={generator,required};const desired=required||perfEnabled()?'wasm':manual.current;if((generator.audioEngine??'legacy')!==desired)void choose(desired,{remember:false});},[generator,choose,required,busy]);
 useEffect(()=>{
  const onKey=e=>{
   if(e.code!=='KeyV'||e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||
    e.target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])')||
    document.querySelector('.gen-pb-backdrop,[role="dialog"]'))return;
   e.preventDefault();void toggle();
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[toggle]);
 return {generator,mode,busy,error,choose,toggle,required,temporary:override.current!==null};
}

export function AudioEngineButton({engine}){
 const {mode,busy,error,toggle,required}=engine;
 return <span className="gen-engine-control">
  <button type="button" className="gen-engine-toggle" aria-label="Toggle sound engine" aria-pressed={mode==='wasm'}
   aria-keyshortcuts="V" disabled={busy||required&&mode==='wasm'} onClick={toggle}
   title={busy?'Preparing instruments…':required&&mode==='wasm'?'This preset uses new Wasm-only voices. Choose an existing preset to compare engines.':`Sound engine: ${mode==='wasm'?'Wasm':'Previous'}. Switch to ${mode==='wasm'?'previous':'Wasm'} engine (V). Resumes from the current bar.`}>
   {busy?'Loading…':mode==='wasm'?'Wasm':'Previous'} <kbd aria-hidden="true">V</kbd>
  </button>
  {busy&&<span className="gen-visually-hidden" role="status">Preparing sound engine…</span>}
  {error&&<span className="gen-engine-error" role="alert">{error}</span>}
 </span>;
}

// Perf mode: a checkbox in the engine's section (it runs on the Wasm engine).
function PerfOption({perf,disabled}){
 const on=usePerfMode(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <><label className="gen-check"><input type="checkbox" aria-label="Performance mode" checked={on} disabled={disabled||busy}
  onChange={async e=>{const next=e.target.checked;setBusy(true);setError('');try{await perf.onToggle(next);}catch(err){setError(err.message);}finally{setBusy(false);}}}/>Perf mode{busy?' · preparing…':''}</label>
  <small role={error?'alert':undefined}>{error||'Experimental Wasm speedups, shared matching rooms and the fluid background paused, for slower devices. Keeps your synthesis and reverb quality. Temporary for this link; switching briefly rebuilds instruments.'}</small></>;
}

export default function WasmOptions({engine,perf}){
 const {mode,busy,error,choose,required,temporary}=engine;
 return <section className="gen-menu-section"><h3>Sound engine</h3><label className="gen-check"><input type="checkbox" aria-label="Use Wasm sound engine" checked={mode==='wasm'} disabled={busy||required&&mode==='wasm'} onChange={e=>choose(e.target.checked?'wasm':'legacy')}/>Use Wasm sound engine</label><small role="status">{busy?'Preparing instruments…':error||(required?'This preset requires Wasm-only voices. Your saved engine preference is unchanged.':temporary?'Temporary engine override from this link. Your saved preference is unchanged. Press V to compare engines.':'On by default; turning it off is saved on this device. Press V to compare with the previous engine. Changes resume from the current bar; existing voices are translated and can sound different. Piano and plucked strings retain native sources. Percussion can be tried separately below.')}</small>{perf&&<PerfOption perf={perf} disabled={busy}/>}<label className="gen-field"><span>Percussion backend · experimental</span><select aria-label="Percussion backend" value={engine.generator?.percussionEngine ?? (percussionFromSearch(location.search)==='808'?'wasm':percussionFromSearch(location.search))} onChange={e=>{history.replaceState(null,'',withPercussion(location.pathname+location.search+location.hash,e.target.value));location.reload();}}><option value="native" disabled={percussionVoice(engine.generator?.settings?.drums?.kit).wasmOnly}>Native Web Audio</option><option value="wasm">Wasm · queued percussion</option></select></label><small>The Percussion track selects the Felt, Crisp, 808 or Hand Percussion voice. 808 and Hand Percussion require Wasm. Changing this backend reloads the page; the selected voice and rhythm stay the same.</small><a href="/tools/percussion-engine.html">Percussion comparison →</a><a href="/labs/">Instrument labs →</a></section>;
}
