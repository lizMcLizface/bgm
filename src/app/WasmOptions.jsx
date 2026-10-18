import React,{useCallback,useEffect,useRef,useState} from 'react';
import {engineFromSearch,withAudioEngine} from './audioEngineChoice';
const KEY='bgm-audio-engine';
function initialEngine(){const linked=engineFromSearch(location.search);if(linked)return linked;try{return localStorage.getItem(KEY)==='wasm'?'wasm':'legacy';}catch{return 'legacy';}}

// One controller keeps the header, shortcut and options in sync. The engine
// rebuilds instruments asynchronously; ignore extra requests while preparing.
export function useAudioEngine(generator,{required=false}={}){
 const [mode,setMode]=useState(generator.audioEngine??'legacy'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const restored=useRef(null),pending=useRef(false),override=useRef(engineFromSearch(location.search)),manual=useRef(initialEngine());
 const choose=useCallback(async (next,{remember=true}={})=>{
  if(pending.current||required&&next!=='wasm')return false;
  pending.current=true;setBusy(true);setError('');
  try{await generator.setAudioEngine(next);const actual=generator.audioEngine??next;setMode(actual);if(remember){manual.current=actual;if(override.current!==null){override.current=actual;history.replaceState(null,'',withAudioEngine(location.pathname+location.search+location.hash,actual));}else try{localStorage.setItem(KEY,actual);}catch{}}return true;}
  catch(e){setMode(generator.audioEngine??'legacy');setError(e.message);return false;}
  finally{pending.current=false;setBusy(false);}
 },[generator,required]);
 const toggle=useCallback(()=>choose(generator.audioEngine==='wasm'?'legacy':'wasm'),[choose,generator]);
 useEffect(()=>{if(busy||pending.current||restored.current?.generator===generator&&restored.current.required===required)return;restored.current={generator,required};const desired=required?'wasm':manual.current;if((generator.audioEngine??'legacy')!==desired)void choose(desired,{remember:false});},[generator,choose,required,busy]);
 useEffect(()=>{
  const onKey=e=>{
   if(e.code!=='KeyV'||e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||
    e.target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])')||
    document.querySelector('.gen-pb-backdrop,[role="dialog"]'))return;
   e.preventDefault();void toggle();
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[toggle]);
 return {mode,busy,error,choose,toggle,required,temporary:override.current!==null};
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

export default function WasmOptions({engine}){
 const {mode,busy,error,choose,required,temporary}=engine;
 return <section className="gen-menu-section"><h3>Sound engine</h3><label className="gen-check"><input type="checkbox" aria-label="Use Wasm sound engine" checked={mode==='wasm'} disabled={busy||required&&mode==='wasm'} onChange={e=>choose(e.target.checked?'wasm':'legacy')}/>Use Wasm sound engine · experimental</label><small role="status">{busy?'Preparing instruments…':error||(required?'This preset requires Wasm-only voices. Your saved engine preference is unchanged.':temporary?'Temporary engine override from this link. Your saved preference is unchanged. Use V or the header button to compare engines.':'Off by default. Saved on this device. Use the header button or V to compare. Changes resume from the current bar; existing voices are translated and can sound different. Piano, plucked strings and drums retain their native sources.')}</small><a href="/labs/">Instrument labs →</a></section>;
}
