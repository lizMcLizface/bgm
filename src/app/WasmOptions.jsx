import React,{useCallback,useEffect,useRef,useState} from 'react';
const KEY='bgm-audio-engine';

// One controller keeps the header, shortcut and options in sync. The engine
// rebuilds instruments asynchronously; ignore extra requests while preparing.
export function useAudioEngine(generator){
 const [mode,setMode]=useState(generator.audioEngine??'legacy'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const restored=useRef(null),pending=useRef(false);
 const choose=useCallback(async next=>{
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');
  try{await generator.setAudioEngine(next);setMode(generator.audioEngine??next);try{localStorage.setItem(KEY,generator.audioEngine??next);}catch{}}
  catch(e){setMode(generator.audioEngine??'legacy');setError(e.message);}
  finally{pending.current=false;setBusy(false);}
 },[generator]);
 const toggle=useCallback(()=>choose(generator.audioEngine==='wasm'?'legacy':'wasm'),[choose,generator]);
 useEffect(()=>{if(restored.current===generator)return;restored.current=generator;try{if(localStorage.getItem(KEY)==='wasm'&&generator.audioEngine!=='wasm')void choose('wasm');}catch{}},[generator,choose]);
 useEffect(()=>{
  const onKey=e=>{
   if(e.code!=='KeyV'||e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||
    e.target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])')||
    document.querySelector('.gen-pb-backdrop,[role="dialog"]'))return;
   e.preventDefault();void toggle();
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[toggle]);
 return {mode,busy,error,choose,toggle};
}

export function AudioEngineButton({engine}){
 const {mode,busy,error,toggle}=engine;
 return <span className="gen-engine-control">
  <button type="button" className="gen-engine-toggle" aria-label="Toggle sound engine" aria-pressed={mode==='wasm'}
   aria-keyshortcuts="V" disabled={busy} onClick={toggle}
   title={busy?'Preparing instruments…':`Sound engine: ${mode==='wasm'?'Wasm':'Previous'}. Switch to ${mode==='wasm'?'previous':'Wasm'} engine (V). Resumes from the current bar.`}>
   {busy?'Loading…':mode==='wasm'?'Wasm':'Previous'} <kbd aria-hidden="true">V</kbd>
  </button>
  {busy&&<span className="gen-visually-hidden" role="status">Preparing sound engine…</span>}
  {error&&<span className="gen-engine-error" role="alert">{error}</span>}
 </span>;
}

export default function WasmOptions({engine}){
 const {mode,busy,error,choose}=engine;
 return <section className="gen-menu-section"><h3>Sound engine</h3><label className="gen-check"><input type="checkbox" aria-label="Use Wasm sound engine" checked={mode==='wasm'} disabled={busy} onChange={e=>choose(e.target.checked?'wasm':'legacy')}/>Use Wasm sound engine · experimental</label><small role="status">{busy?'Preparing instruments…':error||'Off by default. Saved on this device. Use the header button or V to compare. Changes resume from the current bar; existing voices are translated and can sound different. Piano, plucked strings and drums retain their native sources.'}</small><a href="/labs/">Instrument labs →</a></section>;
}
