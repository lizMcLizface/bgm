import React,{useEffect,useState} from 'react';
import {cleanRack,RACK_PRESETS} from './params';
import {useRackModel,RackChain,RackLevels,RackEffect,RackAdd,presetValues} from './rackParts';
import './rack.css';

// The compact, touch-first rack: a small popover with the signal chain and the three level sliders. Tapping an effect opens
// its controls over the popover on a darkened background (after a short delay, so a double tap, which switches the effect on
// or off, is not taken for a tap); tapping the dark area or pressing Escape puts it away again. Effects can be dragged
// to reorder, as in the full rack (RackPanel).
export default function RackCompact({values,onChange,instrumentSpecs=[],peak=0,reduction=0,tools=null,onClose,tempo=0}){
 const [open,setOpen]=useState('');
 const model=useRackModel({values,onChange,instrumentSpecs,tempo});
 const block=model.tiles.find(t=>t.id===open);
 useEffect(()=>{
  const key=e=>{if(e.key==='Escape'){if(open)setOpen('');else onClose?.();}};
  window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
 },[open,onClose]);
 const applyPreset=name=>{const p=RACK_PRESETS.find(r=>r.name===name);if(p)onChange(presetValues(p,values));};
 return <div className="rackc" role="dialog" aria-label="Effects rack">
  <header className="rackc-head">
   <h2>Effects</h2>
   <select aria-label="Rack presets" value="" onChange={e=>applyPreset(e.target.value)}><option value="" disabled>Select preset</option>{RACK_PRESETS.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select>
   <RackAdd model={model} onAdded={setOpen}/>
   <button type="button" aria-label="Bypass effects rack" aria-pressed={!values['master.enabled']} onClick={()=>onChange({'master.enabled':values['master.enabled']?0:1})}>{values['master.enabled']?'On':'Off'}</button>
   <button type="button" onClick={()=>onChange(cleanRack())}>Reset</button>
   {tools}
   <button type="button" className="rackc-close" aria-label="Close effects" onClick={onClose}>✕</button>
   <div className="rack-signal" aria-label="Rack output level"><span style={{width:Math.min(100,peak*100)+'%'}}/></div>
  </header>
  <div className="rackc-body">
   <span className="rack-chain-end rack-chain-start">Synth →</span>
   <RackChain tiles={model.tiles} selected={open} onSelect={setOpen} onToggle={t=>onChange({[t.toggle]:t.on?0:1})} onMoveTo={model.moveTo} tapDelay={260}/>
   <span className="rack-chain-end rack-chain-finish">← Out · tap an effect to edit, double-tap to switch it on or off, drag to reorder</span>
   <RackLevels values={values} onChange={onChange}/>
  </div>
  {block&&<div className="rackc-scrim" onClick={()=>setOpen('')}>
   <div className="rackc-modal" onClick={e=>e.stopPropagation()}>
    <RackEffect block={block} values={values} onChange={onChange} reduction={reduction} instrumentSpecs={instrumentSpecs} model={model}/>
    <button type="button" className="rackc-done" onClick={()=>setOpen('')}>Done</button>
   </div>
  </div>}
 </div>;
}
