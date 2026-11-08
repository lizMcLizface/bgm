import React,{useRef} from 'react';

// An endless-feel rotary on a 0..1 position, like the OXI's encoders under its display: drag up or down, turn the
// wheel, or use the arrow keys; double-click puts it back. The caller maps position to a value and names the value.
const clamp=x=>Math.min(1,Math.max(0,x));
export default function Encoder({label,ariaLabel=label,display,position,onPosition,onReset,disabled=false,grey=false,step=.02,onAssign=null,assigned=false,modKey=null,tooltip}){
 const drag=useRef(null),hold=useRef(null),knob=useRef(null);
 const endHold=e=>{clearTimeout(hold.current);hold.current=null;(e?.currentTarget??knob.current)?.classList.remove('holding');};
 const down=e=>{if(disabled||e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});drag.current={id:e.pointerId,y:e.clientY,p:position};if(onAssign){endHold();e.currentTarget.classList.add('holding');hold.current=setTimeout(()=>{hold.current=null;drag.current=null;knob.current?.classList.remove('holding');onAssign();},600);}};
 const move=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if(Math.abs(d.y-e.clientY)>3)endHold();onPosition(clamp(d.p+(d.y-e.clientY)/170));};
 const up=e=>{endHold();if(drag.current?.id===e.pointerId)drag.current=null;};
 const angle=-135+270*clamp(position);
 return <div className={'enc'+(disabled?' off':'')+(grey?' grey':'')+(onAssign?' assignable':'')+(assigned?' modded':'')}>
  <div className="enc-knob" ref={knob} data-mod-key={modKey??undefined} role="slider" tabIndex={disabled?-1:0} aria-label={ariaLabel} aria-valuetext={display} aria-valuemin={0} aria-valuemax={1} aria-valuenow={position} aria-disabled={disabled}
   title={tooltip??(disabled?label:`${label}: drag, wheel or arrow keys · double-click resets${onAssign?' · hold to modulate':''}`)}
   onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={()=>!disabled&&onReset?.()}
   onWheel={e=>{if(disabled)return;onPosition(clamp(position+(e.deltaY<0?1:-1)*step*2));}}
   onKeyDown={e=>{if(disabled)return;if(e.key==='Home'||e.key==='End'){e.preventDefault();onPosition(e.key==='Home'?0:1);return;}const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();onPosition(clamp(position+d*step));}}}>
   <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">
    <circle cx="24" cy="24" r="21" className="dial-skirt"/>
    <g transform={`rotate(${angle} 24 24)`}><circle cx="24" cy="24" r="15" className="dial-cap"/><line x1="24" y1="6.5" x2="24" y2="16" className="dial-pointer"/></g>
   </svg>
  </div>
  <span className="enc-label">{label}</span>
 </div>;
}
