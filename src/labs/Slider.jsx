import React,{useId,useRef} from 'react';

export function snapToNeutral(value,min,max,neutral){
 return min<neutral&&neutral<max&&Math.abs(value-neutral)<=(max-min)*.015?neutral:value;
}
export default function Slider({label,value,min=0,max=1,step=.01,onChange,neutral,disabled=false}){
 const id=useId(),dragging=useRef(false),resettable=Number.isFinite(neutral);
 const reset=()=>onChange(neutral);
 return <div className="lab-slider">
  <div className="lab-slider-heading"><label htmlFor={id}>{label}</label>
   {resettable?<button type="button" className="lab-slider-reset" aria-label={`Reset ${label} to ${neutral}`} title={`Reset to ${neutral}`} onClick={reset}><output>{Number(value).toFixed(step>=1?0:2)}</output> ↺</button>:<output>{Number(value).toFixed(step>=1?0:2)}</output>}
  </div>
  <input id={id} type="range" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled}
   onPointerDown={()=>{dragging.current=true;}} onPointerUp={()=>{dragging.current=false;}} onPointerCancel={()=>{dragging.current=false;}} onBlur={()=>{dragging.current=false;}}
   onDoubleClick={resettable?reset:undefined}
   onChange={e=>{const next=Number(e.target.value);onChange(resettable&&dragging.current?snapToNeutral(next,min,max,neutral):next);}}/>
 </div>;
}
