import React,{useRef,useLayoutEffect} from 'react';
import {holdModulation} from '../seq/modLive';
import {toPosition,fromPosition,formatValue} from '../params';
import './knob.css';

/**
 * A rotary knob on a parameter's own curve: drag up or down (shift for fine), arrow keys, Home and End, double-click for the
 * default. A 270 degree sweep. `onChange(key, value)`. The colour is the surrounding `--voice`.
 */
export default function Knob({spec,value,onChange,label,className=''}){
 const position=toPosition(spec,value);
 const drag=useRef(null),ref=useRef(null);
 useLayoutEffect(()=>holdModulation(ref.current,spec.key));
 const set=p=>onChange(spec.key,fromPosition(spec,Math.min(1,Math.max(0,p))));
 return <div ref={ref} data-mod-key={spec.key} role="slider" tabIndex={0} className={'dm-knob'+(className?' '+className:'')} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(position.toFixed(3))} aria-valuetext={formatValue(spec,value)} title={`${label}: ${formatValue(spec,value)}`}
  style={{'--p':position}}
  onPointerDown={e=>{e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={y:e.clientY,p:position};}}
  onPointerMove={e=>{if(drag.current)set(drag.current.p+(drag.current.y-e.clientY)/(e.shiftKey?500:140));}}
  onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
  onDoubleClick={()=>onChange(spec.key,spec.default)}
  onKeyDown={e=>{const d={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];if(d){e.preventDefault();set(position+d);}else if(e.key==='Home'){e.preventDefault();set(0);}else if(e.key==='End'){e.preventDefault();set(1);}}}>
  <i className="dm-knob-cap"/>
 </div>;
}
