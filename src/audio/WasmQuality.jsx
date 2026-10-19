import React,{useEffect,useState} from 'react';
import {readWasmPerformance,writeWasmPerformance,WASM_PERFORMANCE_EVENT} from './wasmPerformance';
export default function WasmQuality(){
 const [mode,setMode]=useState(readWasmPerformance);
 useEffect(()=>{const update=()=>setMode(readWasmPerformance());window.addEventListener(WASM_PERFORMANCE_EVENT,update);return()=>window.removeEventListener(WASM_PERFORMANCE_EVENT,update);},[]);
 return <label className="gen-field"><span>Wasm synthesis</span><select aria-label="Wasm synthesis quality" value={mode} onChange={e=>writeWasmPerformance(e.target.value)}><option value="full">Full · patch quality (usually 2× FM)</option><option value="economy">Economy · 1× FM</option></select><small>Economy reduces FM processing, with more aliasing on bright or high notes. Saved on this device; applies immediately without reconnecting MIDI. Full keeps the original sound.</small></label>;
}
