import React,{useRef,useState,useMemo} from 'react';
import {buildWave,toDrawing,analyse,drawn,harmonics,DRAW_POINTS,SHAPES,SLOT_NAMES} from './waves';

const W=256,H=88,BARS=32;

// One wave: its outline, a draw mode (drag across to sketch it), a harmonic mode (drag across the bars), and a menu of
// stock shapes. Edits become a new definition handed to onChange; the kernel normalises the level.
export default function WaveEditor({slot,def,onChange}){
 const [mode,setMode]=useState('draw');
 const svg=useRef(null),last=useRef(null);
 const points=useMemo(()=>{
  const w=buildWave(def),mean=w.reduce((s,v)=>s+v,0)/w.length;
  let pk=1e-9;for(const v of w)pk=Math.max(pk,Math.abs(v-mean));
  const out=[];for(let n=0;n<w.length;n+=4)out.push(`${(n/w.length*W).toFixed(1)},${(H/2-(w[n]-mean)/pk*(H/2-5)).toFixed(1)}`);
  return out.join(' ');
 },[def]);
 const spectrum=useMemo(()=>mode==='harm'?analyse(def,BARS):null,[def,mode]);
 const at=e=>{const b=svg.current.getBoundingClientRect();return [(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height];};
 const draw=e=>{
  const [fx,fy]=at(e),i=Math.max(0,Math.min(DRAW_POINTS-1,Math.floor(fx*DRAW_POINTS))),v=Math.max(-1,Math.min(1,1-2*fy));
  const y=def.t==='draw'?def.y.slice():toDrawing(def);
  // fill the points skipped between two pointer events
  const from=last.current??i;
  for(let k=Math.min(from,i);k<=Math.max(from,i);k++)y[k]=v;
  last.current=i;onChange(drawn(y));
 };
 const bars=e=>{
  const [fx,fy]=at(e),h=Math.max(0,Math.min(BARS-1,Math.floor(fx*BARS))),v=Math.max(0,Math.min(1,1-fy));
  const {a,p}=spectrum;const next=a.slice();next[h]=v;onChange(harmonics(next,p));
 };
 const down=e=>{svg.current.setPointerCapture(e.pointerId);last.current=null;(mode==='draw'?draw:bars)(e);};
 const move=e=>{if(e.buttons)(mode==='draw'?draw:bars)(e);};
 const current=()=>def.t==='draw'?def.y:toDrawing(def);
 const smooth=()=>{const y=current();onChange(drawn(y.map((_,i)=>(y[(i-1+y.length)%y.length]+2*y[i]+y[(i+1)%y.length])/4)));};
 const invert=()=>onChange(drawn(current().map(v=>-v)));
 return <div className="wt-editor">
  <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="wt-wave" role="application" aria-label={`Wave ${SLOT_NAMES[slot]} editor`} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{last.current=null;}}>
   <line x1="0" y1={H/2} x2={W} y2={H/2} className="wt-axis"/>
   {mode==='draw'?<polyline points={points} className="wt-outline"/>
    :spectrum.a.map((a,i)=><rect key={i} x={i*W/BARS+1} y={H-a*(H-6)} width={W/BARS-2} height={a*(H-6)} className="wt-bar"/>)}
  </svg>
  <div className="wt-editor-tools">
   <div className="wt-modes" role="group" aria-label="Edit mode">
    <button type="button" className={mode==='draw'?'on':''} aria-pressed={mode==='draw'} onClick={()=>setMode('draw')}>Draw</button>
    <button type="button" className={mode==='harm'?'on':''} aria-pressed={mode==='harm'} onClick={()=>setMode('harm')}>Harmonics</button>
   </div>
   <select aria-label={`Wave ${SLOT_NAMES[slot]} shape`} value="" onChange={e=>{if(e.target.value!=='')onChange(SHAPES[+e.target.value][1]);}}>
    <option value="">Shape…</option>
    {SHAPES.map(([name],i)=><option key={name} value={i}>{name}</option>)}
   </select>
   <button type="button" onClick={smooth}>Smooth</button>
   <button type="button" onClick={invert}>Invert</button>
  </div>
 </div>;
}
