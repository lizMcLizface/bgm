import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {formatValue} from '../params';

// A pop-out curve editor for one DIY envelope, in the style of the Juno's envelope shape editor. The three stage handles bend
// the stage's curve exponent: drag one up or down to move that stage's midpoint (1 is a straight line). The plot uses the
// engine's own stage formulas: attack rises as progress^c, decay falls from 1 to the sustain level as progress^c, and release
// falls from where it started as remaining^c. The amp envelope also has a hold: the attack rises to the hold level, stays there for
// the hold time, and the decay then moves from that level to the sustain (which can be above it, a swell).
const W=300,H=120,PAD=8,MIN=.25,MAX=4,HALF=Math.log(.5);
const STAGES=[['A','Attack'],['D','Decay'],['R','Release']];
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const toCurve=q=>+clamp(Math.round(Math.log(clamp(q,.0625,.84))/HALF/.05)*.05,MIN,MAX).toFixed(2);

export default function DiyEnvEditor({title,anchor,onClose,values,specs,change,curves,times,sustain:sustainKey,hold}){
 const box=useRef(null),drag=useRef(null);
 const [place,setPlace]=useState(null);
 const c=curves.map(k=>values[k]),sustain=clamp(values[sustainKey]??1,0,1);
 const holding=!!hold&&values[hold.time]>0,top=holding?clamp(values[hold.level]??1,.05,1):1;
 // where each stage sits along the width: a hold takes a share only while it is on
 const at=holding?{A:[0,.18],H:[.18,.34],D:[.34,.62],S:[.62,.76],R:[.76,1]}:{A:[0,.25],D:[.25,.5],S:[.5,.75],R:[.75,1]};
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

 const stage=(i,[x0,x1],n=40)=>Array.from({length:n+1},(_,j)=>{
  const f=j/n,y=i===0?top*f**c[0]:i===1?top+(sustain-top)*f**c[1]:sustain*(1-f)**c[2];
  return [x0+f*(x1-x0),y];
 });
 const pts=[...stage(0,at.A),...(holding?[[at.H[1],top]]:[]),...stage(1,at.D),[at.S[1],sustain],...stage(2,at.R).slice(1)];
 const sx=x=>PAD+x*(W-2*PAD),sy=y=>H-PAD-y*(H-2*PAD);
 const path=pts.map(([x,y],i)=>(i?'L':'M')+sx(x).toFixed(1)+' '+sy(y).toFixed(1)).join('');
 const mid=([a,b])=>(a+b)/2,handles=[[mid(at.A),top*.5**c[0]],[mid(at.D),top+(sustain-top)*.5**c[1]],[mid(at.R),sustain*.5**c[2]],...(holding?[[mid(at.H),top]]:[])];
 const down=(i,e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={i,id:e.pointerId};};
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const rect=e.currentTarget.ownerSVGElement.getBoundingClientRect();
  const level=(H-PAD-(e.clientY-rect.top)/rect.height*H)/(H-2*PAD);
  let q;
  if(d.i===3){change(hold.level,+clamp(Math.round(level*100)/100,.05,1).toFixed(2));return;}
  if(d.i===0)q=level/top;
  else if(d.i===1){if(Math.abs(top-sustain)<.03)return;q=(level-top)/(sustain-top);}
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
   {STAGES.map(([s],i)=><text key={s} x={sx(mid(at[s]))} y={i===0?H-PAD-4:PAD+10} className="env-shape-label">{s} {time(times[s])}</text>)}
   {holding&&<text x={sx(mid(at.H))} y={H-PAD-4} className="env-shape-label">H {time(hold.time)}</text>}
   <text x={sx(mid(at.S))} y={sy(sustain)-5} className="env-shape-label">S</text>
   {handles.map(([x,y],i)=><circle key={i} cx={sx(x)} cy={sy(y)} r="9" className="env-shape-handle" role="slider" aria-label={i===3?'Hold level':STAGES[i][1]+' curve'} aria-valuemin={i===3?.05:MIN} aria-valuemax={i===3?1:MAX} aria-valuenow={i===3?top:c[i]} tabIndex={0}
    onPointerDown={e=>down(i,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    onKeyDown={e=>{if(i===3){const d=e.key==='ArrowUp'?.05:e.key==='ArrowDown'?-.05:0;if(d){e.preventDefault();change(hold.level,+clamp(top+d,.05,1).toFixed(2));}return;}const step=e.key==='ArrowUp'?.05:e.key==='ArrowDown'?-.05:0;if(step){e.preventDefault();change(curves[i],+clamp(c[i]+(i===1?step:-step),MIN,MAX).toFixed(2));}}}/>)}
  </svg>
  <div className="env-shape-controls">
   {STAGES.map(([s,name],i)=><label key={s}><span>{name} curve</span>
    <input type="range" min={MIN} max={MAX} step=".05" value={c[i]} onChange={e=>change(curves[i],Number(e.target.value))}/>
    <output>{c[i].toFixed(2)}</output></label>)}
   {hold&&<><label><span>Hold time</span><input type="range" min="0" max="4" step=".01" aria-label="Hold time" value={values[hold.time]} onChange={e=>change(hold.time,Number(e.target.value))}/><output>{values[hold.time].toFixed(2)} s</output></label>
    <label><span>Hold level</span><input type="range" min=".05" max="1" step=".01" aria-label="Hold level" disabled={!holding} value={top} onChange={e=>change(hold.level,Number(e.target.value))}/><output>{top.toFixed(2)}</output></label></>}
  </div>
  <p className="env-shape-hint">Drag a handle to bend its stage. 1.00 is a straight line.{hold?' A hold keeps the attack at its level for a while before the decay; below the sustain it makes a swell.':''}</p>
 </div>,document.body);
}
