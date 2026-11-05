import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {formatValue} from '../params';

// A pop-out curve editor for one DIY envelope, in the style of the Juno's envelope shape editor. The three stage handles bend
// the stage's curve exponent: drag one up or down to move that stage's midpoint (1 is a straight line). The plot uses the
// engine's own stage formulas: attack rises as progress^c, decay falls from 1 to the sustain level as progress^c, and release
// falls from where it started as remaining^c.
const W=300,H=120,PAD=8,MIN=.25,MAX=4,HALF=Math.log(.5);
const STAGES=[['A','Attack'],['D','Decay'],['R','Release']];
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const toCurve=q=>+clamp(Math.round(Math.log(clamp(q,.0625,.84))/HALF/.05)*.05,MIN,MAX).toFixed(2);

export default function DiyEnvEditor({title,anchor,onClose,values,specs,change,curves,times,sustain:sustainKey}){
 const box=useRef(null),drag=useRef(null);
 const [place,setPlace]=useState(null);
 const c=curves.map(k=>values[k]),sustain=clamp(values[sustainKey]??1,0,1);
 useLayoutEffect(()=>{
  const r=anchor?.getBoundingClientRect?.(),el=box.current;if(!r||!el)return;
  const w=el.offsetWidth,h=el.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  const below=r.bottom+6+h<=vh-8;
  setPlace({left:Math.max(8,Math.min(r.left,vw-w-8)),top:below?r.bottom+6:Math.max(8,r.top-6-h)});
 },[anchor]);
 useEffect(()=>{
  const key=e=>{if(e.key==='Escape')onClose();};
  const away=e=>{if(!box.current?.contains(e.target)&&!anchor?.contains?.(e.target)&&!e.target.closest?.('.keys,.ribbon,.touchpad'))onClose();};
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',away);
  return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',away);};
 },[anchor,onClose]);

 // each stage in a quarter of the width, with a held sustain between decay and release
 const stage=(i,x0,n=40)=>Array.from({length:n+1},(_,j)=>{
  const f=j/n,y=i===0?f**c[0]:i===1?1+(sustain-1)*f**c[1]:sustain*(1-f)**c[2];
  return [x0+f*.25,y];
 });
 const pts=[...stage(0,0),...stage(1,.25),[.75,sustain],...stage(2,.75).slice(1)];
 const sx=x=>PAD+x*(W-2*PAD),sy=y=>H-PAD-y*(H-2*PAD);
 const path=pts.map(([x,y],i)=>(i?'L':'M')+sx(x).toFixed(1)+' '+sy(y).toFixed(1)).join('');
 const handles=[[.125,.5**c[0]],[.375,1+(sustain-1)*.5**c[1]],[.875,sustain*.5**c[2]]];
 const down=(i,e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={i,id:e.pointerId};};
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const rect=e.currentTarget.ownerSVGElement.getBoundingClientRect();
  const level=(H-PAD-(e.clientY-rect.top)/rect.height*H)/(H-2*PAD);
  let q;
  if(d.i===0)q=level;
  else if(d.i===1){if(1-sustain<.03)return;q=(level-1)/(sustain-1);}
  else{if(sustain<.03)return;q=level/sustain;}
  change(curves[d.i],toCurve(q));
 };
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const reset=()=>curves.forEach(k=>change(k,specs[k].default));
 const time=key=>key?formatValue(specs[key],values[key]):'';
 return createPortal(<div className="env-shape" ref={box} role="dialog" aria-label={title+' shape'} style={place?{left:place.left,top:place.top}:{visibility:'hidden'}}>
  <div className="env-shape-head">
   <b>{title}</b>
   <button type="button" onClick={reset}>Reset</button>
   <button type="button" className="env-shape-close" aria-label="Close" onClick={onClose}>×</button>
  </div>
  <svg viewBox={`0 0 ${W} ${H}`} className="env-shape-plot custom" role="img" aria-label="Envelope outline">
   {[.25,.5,.75].map(x=><line key={x} x1={sx(x)} x2={sx(x)} y1={PAD} y2={H-PAD} className="env-shape-grid"/>)}
   <line x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} className="env-shape-grid"/>
   <path d={path+`L${sx(1)} ${sy(0)}L${sx(0)} ${sy(0)}Z`} className="env-shape-fill"/>
   <path d={path} className="env-shape-line"/>
   {STAGES.map(([s],i)=><text key={s} x={sx(i===0?.125:i===1?.375:.875)} y={i===0?H-PAD-4:PAD+10} className="env-shape-label">{s} {time(times[s])}</text>)}
   <text x={sx(.625)} y={sy(sustain)-5} className="env-shape-label">S</text>
   {handles.map(([x,y],i)=><circle key={i} cx={sx(x)} cy={sy(y)} r="9" className="env-shape-handle" role="slider" aria-label={STAGES[i][1]+' curve'} aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={c[i]} tabIndex={0}
    onPointerDown={e=>down(i,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    onKeyDown={e=>{const step=e.key==='ArrowUp'?.05:e.key==='ArrowDown'?-.05:0;if(step){e.preventDefault();change(curves[i],+clamp(c[i]+(i===1?step:-step),MIN,MAX).toFixed(2));}}}/>)}
  </svg>
  <div className="env-shape-controls">
   {STAGES.map(([s,name],i)=><label key={s}><span>{name} curve</span>
    <input type="range" min={MIN} max={MAX} step=".05" value={c[i]} onChange={e=>change(curves[i],Number(e.target.value))}/>
    <output>{c[i].toFixed(2)}</output></label>)}
  </div>
  <p className="env-shape-hint">Drag a handle to bend its stage. 1.00 is a straight line.</p>
 </div>,document.body);
}
