import React from 'react';
import {RACK_MOVES,MOVE_MAX,MOVE_LOOPS} from '../../seq/moves';

// Effect moves of the pattern being edited: each sweeps one of the rack's effects from Start to End over the chosen number of loops, then begins again.
// (The front page has the same on its sequencer panel: "Effect moves while a stage plays".)
const range=key=>RACK_MOVES[key];
export default function MovesPanel({title,entry,onChange}){
 const list=entry?.list??[],loops=entry?.loops??1;
 const set=(next,l=loops)=>onChange(next.length?{loops:l,list:next}:null);
 const fresh=key=>({key,from:range(key).min,to:range(key).max});
 return <fieldset className="seq-moves" aria-label={title}>
  <legend>{title}</legend>
  {list.map((m,i)=>{const r=range(m.key);return <div className="seq-move" key={i}>
   <select aria-label="Effect" value={m.key} onChange={e=>set(list.map((x,j)=>j===i?fresh(e.target.value):x))}>{Object.entries(RACK_MOVES).map(([k,{label}])=><option key={k} value={k}>{label}</option>)}</select>
   {['from','to'].map(end=><label key={end}><span>{end==='from'?'Start':'End'}</span>
    <input type="range" aria-label={`${end} ${r.label}`} min={r.log?Math.log(r.min):r.min} max={r.log?Math.log(r.max):r.max} step={(r.log?Math.log(r.max/r.min):r.max-r.min)/100}
     value={r.log?Math.log(m[end]):m[end]} onChange={e=>{const v=r.log?Math.exp(+e.target.value):+e.target.value;set(list.map((x,j)=>j===i?{...x,[end]:Math.min(r.max,Math.max(r.min,v))}:x));}}/></label>)}
   <button type="button" aria-label="Remove move" onClick={()=>set(list.filter((_,j)=>j!==i))}>×</button>
  </div>;})}
  {list.length<MOVE_MAX&&<select aria-label="Add an effect move" value="" onChange={e=>{if(e.target.value)set([...list,fresh(e.target.value)]);}}>
   <option value="">Add a move…</option>{Object.entries(RACK_MOVES).map(([k,{label}])=><option key={k} value={k}>{label}</option>)}</select>}
  {list.length>0&&<label className="seq-move-loops"><span>Over</span><select aria-label="Loops a move lasts" value={loops} onChange={e=>set(list,+e.target.value)}>{MOVE_LOOPS.map(n=><option key={n} value={n}>{n===1?'1 loop':n+' loops'}</option>)}</select></label>}
  <small>Each runs from its start to its end over the loops, from the pattern's first step, then again. It needs the core clock; the effect is brought into the rack while it plays.</small>
 </fieldset>;
}
