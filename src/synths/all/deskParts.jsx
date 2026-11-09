import React,{useRef} from 'react';
// Controls shared by the desk boxes (mixer, ambience): a pot, a fader with a dB scale, a level meter.
export const clamp=x=>Math.min(1,Math.max(0,x));
export const LOG=(v,lo,hi)=>lo*Math.pow(hi/lo,v);
export const hz=f=>f>=1000?`${(f/1000).toFixed(f>=10000?0:1)}k`:`${Math.round(f)}`;
export const dbText=v=>v<=0?'-∞':(()=>{const d=v>=.75?(v-.75)/.25*10:-60*(1-v/.75);return (d>0?'+':'')+d.toFixed(1);})();
export const panText=p=>Math.abs(p-.5)<.02?'C':p<.5?`L${Math.round((.5-p)*200)}`:`R${Math.round((p-.5)*200)}`;
export const gainText=v=>`${Math.round(-12+48*v)} dB`;

/** A small desk pot: drag up or down, wheel, double-click for its default. `v` 0..1. */
export function Pot({label,v,onChange,def=.5,tip,size=30,centre=false,side=false}){
 const drag=useRef(null);
 const angle=-135+270*clamp(v);
 return <div className={'dk-pot'+(side?' side':'')} title={tip??label}>
  <div className="dk-pot-knob" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={v} aria-valuetext={tip}
   style={{width:size,height:size}}
   onPointerDown={e=>{if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={y:e.clientY,v};}}
   onPointerMove={e=>{if(drag.current)onChange(clamp(drag.current.v+(drag.current.y-e.clientY)/120));}}
   onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   onDoubleClick={()=>onChange(def)}
   onWheel={e=>onChange(clamp(v+(e.deltaY<0?.03:-.03)))}
   onKeyDown={e=>{const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();onChange(clamp(v+d*.02));}}}>
   <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
    <circle cx="20" cy="20" r="18" className="dk-skirt"/>
    <g transform={`rotate(${angle} 20 20)`}><circle cx="20" cy="20" r="12.5" className="dk-cap"/><line x1="20" y1="6" x2="20" y2="14" className="dk-ptr"/></g>
    {centre&&<line x1="20" y1="0" x2="20" y2="3" className="dk-tick"/>}
   </svg>
  </div>
  <small>{label}</small>
 </div>;
}

/** A vertical fader: a track with a cap, 0..1 from the bottom. */
export function Fader({v,onChange,label,colour}){
 const track=useRef(null),drag=useRef(null);
 const set=e=>{const r=track.current.getBoundingClientRect();onChange(clamp(1-(e.clientY-r.top)/r.height));};
 return <div className="dk-fader" ref={track} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={v} aria-valuetext={dbText(v)+' dB'} style={{'--ch':colour}}
  onPointerDown={e=>{if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={id:e.pointerId,touch:e.pointerType==='touch',y:e.clientY,moved:false};if(!drag.current.touch)set(e);}}
  onPointerMove={e=>{const d=drag.current;if(d?.id!==e.pointerId||!e.buttons)return;if(d.touch&&!d.moved&&Math.abs(e.clientY-d.y)<4)return;d.moved=true;set(e);}}
  onPointerUp={e=>{const d=drag.current;if(d?.id!==e.pointerId)return;drag.current=null;if(d.touch&&!d.moved)set(e);}}
  onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
  onDoubleClick={()=>onChange(.75)}
  onKeyDown={e=>{const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();onChange(clamp(v+d*.02));}}}>
  <i className="dk-scale">{[10,5,0,-5,-10,-20,-30,-40,-60].map(d=><b key={d} style={{bottom:`${(d>=0?.75+d/10*.25:.75*(1+d/60))*100}%`}}>{d===0?'0':d>0?'+'+d:d}</b>)}</i>
  <i className="dk-slot"/>
  <i className="dk-cap-f" style={{bottom:`calc(${v*100}% - 12px)`}}/>
 </div>;
}

export function Meter({level,silent}){
 const on=silent?0:Math.round(level*14);
 return <div className="dk-meter" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i} className={i<on?(i>11?'hot':i>8?'mid':'on'):''}/>)}</div>;
}
