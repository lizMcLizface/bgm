import React,{useRef} from 'react';
import {formatValue,toPosition,fromPosition} from '../params';
import {BY_KEY} from './params';

// The joystick's own routing, small: the sources that move the stick (down the side) against where they move it (across the top): X and Y of the
// stick, and its radius and angle about the centre of the pad. Every cell is a depth of its own, at zero until it is set, and shares its value with the
// same cell of the big routing matrix.
const COLUMNS=['X','Y','R','θ'];
const ROWS=[
 ['LFO 1',['lfo1X','lfo1Y','lfo1R','lfo1T']],
 ['LFO 2',['lfo2X','lfo2Y','lfo2R','lfo2T']],
 ['Vector env',['vecX','vecY','vecR','vecT']],
 ['Key',['keyX','keyY','keyR','keyT']],
 ['Velocity',['velX','velY','velR','velT']],
 ['Pressure',['prsX','prsY','prsR','prsT']],
];
const TITLES=['X of the stick','Y of the stick','radius (distance from the centre)','angle (a half-turn at full depth)'];

export default function WtPadMatrix({values,change}){
 const drag=useRef(null),lastTap=useRef(0);
 const down=(key,e)=>{
  if(e.button>0)return;
  e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(now-lastTap.current<320){lastTap.current=0;drag.current=null;change(key,0);return;}
  lastTap.current=now;
  drag.current={id:e.pointerId,key,spec:BY_KEY[key],y:e.clientY,start:toPosition(BY_KEY[key],values[key])};
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const p=Math.min(1,Math.max(0,d.start+(d.y-e.clientY)/(e.shiftKey?600:150)));
  let v=fromPosition(d.spec,p);if(Math.abs(v)<.02*(d.spec.max-d.spec.min))v=0;
  change(d.key,v);
 };
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const key=(k,e)=>{
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(k,0);return;}
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step===undefined)return;
  e.preventDefault();change(k,fromPosition(BY_KEY[k],Math.min(1,Math.max(0,toPosition(BY_KEY[k],values[k])+step))));
 };
 return <div className="wt-padmx">
  <div className="rmx" role="grid" aria-label="Joystick modulation" style={{'--cols':COLUMNS.length,'--cell':'28px'}}>
   <div className="rmx-head" role="row"><span className="rmx-corner">From ↓ · To →</span>{COLUMNS.map((c,i)=><span key={c} role="columnheader" title={TITLES[i]}>{c}</span>)}</div>
   {ROWS.map(([name,keys])=><div className="rmx-row" role="row" key={name}>
    <span className="rmx-source" role="rowheader">{name}</span>
    {keys.map((k,i)=>{
     const spec=BY_KEY[k],v=values[k],p=toPosition(spec,v),zero=toPosition(spec,0);
     return <button type="button" key={k} role="gridcell" aria-label={`${name} to ${TITLES[i]}`} title={`${name} → ${TITLES[i]} · drag to set, double-click to clear`} className={'rmx-cell built'+(v!==0?' on':'')}
      onPointerDown={e=>down(k,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>key(k,e)}>
      <i className="rmx-fill" style={{bottom:Math.min(zero,p)*100+'%',height:Math.abs(p-zero)*100+'%'}}/>
      <span className="rmx-text">{formatValue(spec,v)}</span>
     </button>;})}
   </div>)}
  </div>
 </div>;
}
