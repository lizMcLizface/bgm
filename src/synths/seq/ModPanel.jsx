import React from 'react';
import {LFO_SHAPES,SOURCES,MAX_LANE_STEPS} from '../../seq/mod';

// Quick Assign (after the OXI One): opened by a long press on an encoder. Pick a source for the parameter, how far it moves it (Amount) and a fixed
// shift (Offset); below, the picked source is edited: an LFO's shape, rate and phase, or a lane's steps, length, division and glide.
const NAMES={lfo1:'LFO 1',lfo2:'LFO 2',rand:'Random S&H',...Object.fromEntries(Array.from({length:8},(_,i)=>['lane'+(i+1),'Lane '+(i+1)]))};
const RATES=[.0625,.125,.25,.5,1,2,4,8];
const DIVS=[[1,'1/4'],[2,'1/8'],[4,'1/16'],[8,'1/32']];

function LaneEditor({lane,onChange}){
 const paint=(i,e)=>{const r=e.currentTarget.getBoundingClientRect(),v=Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height));onChange({...lane,steps:lane.steps.map((x,j)=>j===i?Math.round(v*20)/20:x)});};
 const length=n=>onChange({...lane,steps:Array.from({length:n},(_,i)=>lane.steps[i]??0.5)});
 return <div className="mod-lane">
  <div className="mod-bars" role="group" aria-label="Lane steps">{lane.steps.map((v,i)=><div key={i} className="mod-bar" onPointerDown={e=>{e.currentTarget.setPointerCapture?.(e.pointerId);paint(i,e);}} onPointerMove={e=>{if(e.buttons)paint(i,e);}} title={`Step ${i+1}: ${Math.round(v*100)}%`}><i style={{height:v*100+'%'}}/></div>)}</div>
  <label>Steps <input type="number" min="1" max={MAX_LANE_STEPS} value={lane.steps.length} onChange={e=>length(Math.min(MAX_LANE_STEPS,Math.max(1,Math.round(+e.target.value)||1)))}/></label>
  <label>Rate <select value={lane.div} onChange={e=>onChange({...lane,div:+e.target.value})}>{DIVS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  <label>Glide <input type="range" min="0" max="1" step=".05" value={lane.smooth} onChange={e=>onChange({...lane,smooth:+e.target.value})}/></label>
 </div>;
}

export default function ModPanel({paramLabel,assign,mod,onAssign,onMod,onClose}){
 const set=patch=>onAssign({source:'lane1',amount:.5,offset:0,...assign,...patch});
 const src=assign?.source,lfoI=src==='lfo1'?0:src==='lfo2'?1:-1,laneI=src?.startsWith('lane')?+src.slice(4)-1:-1;
 const setLfo=patch=>onMod({...mod,lfos:mod.lfos.map((l,i)=>i===lfoI?{...l,...patch}:l)});
 const setLane=lane=>onMod({...mod,lanes:Array.from({length:Math.max(mod.lanes.length,laneI+1)},(_,i)=>i===laneI?lane:(mod.lanes[i]??{steps:Array(16).fill(.5),div:4,smooth:0}))});
 return <div className="mod-panel" role="dialog" aria-label={`Modulate ${paramLabel}`}>
  <header><b>Modulate {paramLabel}</b><button type="button" onClick={onClose} aria-label="Close">×</button></header>
  <label>Source <select value={src??''} onChange={e=>e.target.value?set({source:e.target.value}):onAssign(null)}>
   <option value="">Off</option>{SOURCES.map(s=><option key={s} value={s}>{NAMES[s]}</option>)}</select></label>
  {assign&&<>
   <label>Amount <input type="range" min="-1" max="1" step=".02" value={assign.amount} onChange={e=>set({amount:+e.target.value})}/><output>{Math.round(assign.amount*100)}%</output></label>
   <label>Offset <input type="range" min="-1" max="1" step=".02" value={assign.offset} onChange={e=>set({offset:+e.target.value})}/><output>{Math.round(assign.offset*100)}%</output></label>
  </>}
  {lfoI>=0&&<div className="mod-lfo">
   <label>Shape <select value={mod.lfos[lfoI].shape} onChange={e=>setLfo({shape:e.target.value})}>{LFO_SHAPES.map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Rate <select value={mod.lfos[lfoI].rate} onChange={e=>setLfo({rate:+e.target.value})}>{RATES.map(r=><option key={r} value={r}>{r>=1?r+' per beat':'1 per '+1/r+' beats'}</option>)}</select></label>
   <label>Phase <input type="range" min="0" max=".95" step=".05" value={mod.lfos[lfoI].phase} onChange={e=>setLfo({phase:+e.target.value})}/></label>
  </div>}
  {laneI>=0&&<LaneEditor lane={mod.lanes[laneI]??{steps:Array(16).fill(.5),div:4,smooth:0}} onChange={setLane}/>}
 </div>;
}
