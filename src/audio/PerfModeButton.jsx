import React,{useEffect,useState} from 'react';
import {PERF_MODE_EVENT,perfEnabled} from './perfMode';
export function usePerfMode(){const [on,setOn]=useState(perfEnabled);useEffect(()=>{const update=()=>setOn(perfEnabled());window.addEventListener(PERF_MODE_EVENT,update);return()=>window.removeEventListener(PERF_MODE_EVENT,update);},[]);return on;}
export default function PerfModeButton({onToggle,disabled=false}){
 const on=usePerfMode(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span className="gen-engine-control"><button type="button" className="gen-engine-toggle gen-perf-toggle" aria-label="Toggle performance mode" aria-pressed={on} disabled={disabled||busy}
  title="Perf mode: experimental Wasm speedups, shared matching rooms, and fluid paused. Keeps your synthesis and reverb quality. Temporary for this link; switching briefly rebuilds instruments."
  onClick={async()=>{setBusy(true);setError('');try{await onToggle(!on);}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'Preparing…':`Perf: ${on?'on':'off'}`}</button>{error&&<span role="alert" className="gen-engine-error">{error}</span>}</span>;
}
