import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {SHAPE_KEYS,STAGES,activeShape,envelopePoints,stageCurve} from './envShape';
import {formatValue} from '../params';

// Pop-out curve editor for one envelope. Drag a stage's handle to bend it (towards
// where the curve should bulge), smooth it into an S, or cut the envelope into steps.
// Editing a Model envelope switches it to Custom, starting from the model's own curves.
const W=300,H=120,PAD=8;

export default function EnvShapeEditor({env,title,values,BY_KEY,change,times,anchor,onClose}){
 const k=SHAPE_KEYS[env];
 const shape=activeShape(values,env,BY_KEY);
 const sustain=Math.min(1,Math.max(0,times.sustain??1));
 const pts=envelopePoints(shape,sustain);
 const box=useRef(null),drag=useRef(null);
 const [place,setPlace]=useState(null);

 useLayoutEffect(()=>{
  const r=anchor?.getBoundingClientRect?.(),el=box.current;if(!r||!el)return;
  const w=el.offsetWidth,h=el.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  const below=r.bottom+6+h<=vh-8;
  setPlace({left:Math.max(8,Math.min(r.left,vw-w-8)),top:below?r.bottom+6:Math.max(8,r.top-6-h)});
 },[anchor]);
 useEffect(()=>{
  const key=e=>{if(e.key==='Escape')onClose();};
  // playing the on-screen keys, ribbon or pad keeps the editor open
  const away=e=>{if(!box.current?.contains(e.target)&&!anchor?.contains?.(e.target)&&!e.target.closest?.('.keys,.ribbon,.touchpad'))onClose();};
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',away);
  return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',away);};
 },[anchor,onClose]);

 // The first edit of a Model envelope copies the model's curves in, so nothing jumps.
 const edit=(key,value)=>{
  if(!shape.custom){
   change(k.mode,1);
   k.bend.forEach((b,i)=>change(b,shape.bend[i]));k.smooth.forEach((s,i)=>change(s,shape.smooth[i]));change(k.steps,0);
  }
  change(key,value);
 };
 const reset=()=>{change(k.mode,0);for(const key of [...k.bend,...k.smooth,k.steps])change(key,BY_KEY[key].default);};

 const sx=x=>PAD+x*(W-2*PAD),sy=y=>H-PAD-y*(H-2*PAD);
 const path=pts.map(([x,y],i)=>(i?'L':'M')+sx(x).toFixed(1)+' '+sy(y).toFixed(1)).join('');
 // handle i sits halfway through its stage: [slot start, from level, to level]
 const slots=[[0,0,1],[.25,1,sustain],[.75,sustain,0]];
 const handle=i=>{const [x0,from,to]=slots[i];return [sx(x0+.125),sy(from+(to-from)*stageCurve(.5,shape.bend[i],shape.smooth[i],shape.steps))];};
 const down=(i,e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={i,id:e.pointerId,y:e.clientY,bend:shape.bend[i]};};
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const rect=e.currentTarget.ownerSVGElement?.getBoundingClientRect?.()??e.currentTarget.getBoundingClientRect();
  const dy=(d.y-e.clientY)/Math.max(40,rect.height)*2.4;
  edit(k.bend[d.i],+Math.max(-1,Math.min(1,d.bend+(d.i===0?dy:-dy))).toFixed(3));
 };
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const time=key=>key==null?'':formatValue({unit:'s'},key);

 return <div className="env-shape" ref={box} role="dialog" aria-label={title+' shape'} style={place?{left:place.left,top:place.top}:{visibility:'hidden'}}>
  <div className="env-shape-head">
   <b>{title}</b>
   <span className="env-shape-mode" role="radiogroup" aria-label="Envelope shape">
    <button type="button" role="radio" aria-checked={!shape.custom} onClick={reset}>Model</button>
    <button type="button" role="radio" aria-checked={shape.custom} onClick={()=>!shape.custom&&edit(k.mode,1)}>Custom</button>
   </span>
   <button type="button" className="env-shape-close" aria-label="Close" onClick={onClose}>×</button>
  </div>
  <svg viewBox={`0 0 ${W} ${H}`} className={'env-shape-plot'+(shape.custom?' custom':'')} role="img" aria-label="Envelope outline">
   {[.25,.5,.75].map(x=><line key={x} x1={sx(x)} x2={sx(x)} y1={PAD} y2={H-PAD} className="env-shape-grid"/>)}
   <line x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} className="env-shape-grid"/>
   <path d={path+`L${sx(1)} ${sy(0)}L${sx(0)} ${sy(0)}Z`} className="env-shape-fill"/>
   <path d={path} className="env-shape-line"/>
   {STAGES.map(([s],i)=>{const [x,y]=handle(i);return <g key={s}>
    <text x={sx(slots[i][0]+.125)} y={i===0?H-PAD-4:PAD+10} className="env-shape-label">{s} {time(times[s])}</text>
    <circle cx={x} cy={y} r="9" className="env-shape-handle" role="slider" aria-label={STAGES[i][1]+' bend'} aria-valuemin={-1} aria-valuemax={1} aria-valuenow={shape.bend[i]} tabIndex={0}
     onPointerDown={e=>down(i,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
     onKeyDown={e=>{const step=e.key==='ArrowUp'?.05:e.key==='ArrowDown'?-.05:0;if(step){e.preventDefault();edit(k.bend[i],+Math.max(-1,Math.min(1,shape.bend[i]+(i===0?step:-step))).toFixed(3));}}}/>
   </g>;})}
   <text x={sx(.625)} y={sy(sustain)-5} className="env-shape-label">S</text>
  </svg>
  <div className="env-shape-controls">
   {STAGES.map(([s,name],i)=><label key={s}><span>{name} smooth</span>
    <input type="range" min="0" max="1" step=".01" value={shape.smooth[i]} onChange={e=>edit(k.smooth[i],Number(e.target.value))}/>
    <output>{Math.round(shape.smooth[i]*100)}</output></label>)}
   <label><span>Steps</span>
    <select value={shape.steps} onChange={e=>edit(k.steps,Number(e.target.value))}>
     <option value={0}>Off</option>{Array.from({length:15},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}</option>)}
    </select></label>
  </div>
  <p className="env-shape-hint">{shape.custom?'Drag a handle to bend its stage. Smooth rounds the ends (and the steps).':'The model’s own envelope. Any edit starts from its curves.'}</p>
 </div>;
}
