import React,{useRef,useState} from 'react';
import {toPosition,fromPosition,formatValue} from '../params';

// Vertical fader, like the CS-80's levers. Drags are relative (a touch never
// jumps the value), double-tap restores the default, arrow keys step it.
export function Fader({spec,value,onChange,tone='cream',label=spec.label}){
 const drag=useRef(null),lastTap=useRef(0);
 const position=toPosition(spec,value);
 const bipolar=spec.min<0&&spec.max>0,zero=bipolar?toPosition(spec,0):0;
 const set=p=>onChange(spec.key,fromPosition(spec,p));
 const down=e=>{
  if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(now-lastTap.current<320){lastTap.current=0;drag.current=null;onChange(spec.key,spec.default);return;}
  lastTap.current=now;
  const track=e.currentTarget.querySelector('.fader-track').getBoundingClientRect();
  drag.current={id:e.pointerId,y:e.clientY,start:position,height:Math.max(40,track.height)};
 };
 const move=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;set(d.start+(d.y-e.clientY)/d.height*(e.shiftKey?.25:1));};
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const key=e=>{
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step!==undefined){e.preventDefault();set(position+step);}
  else if(e.key==='Home'||e.key==='End'){e.preventDefault();set(e.key==='End'?1:0);}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onChange(spec.key,spec.default);}
 };
 const from=Math.min(zero,position),to=Math.max(zero,position);
 return <div className={'fader tone-'+tone} role="slider" tabIndex={0} aria-label={label} aria-valuemin={spec.min} aria-valuemax={spec.max} aria-valuenow={+value.toFixed(4)} aria-valuetext={formatValue(spec,value)}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
  <span className="fader-value">{formatValue(spec,value)}</span>
  <div className="fader-track">
   {bipolar&&<div className="fader-zero" style={{bottom:zero*100+'%'}}/>}
   <div className="fader-fill" style={{bottom:from*100+'%',height:(to-from)*100+'%'}}/>
   <div className="fader-cap" style={{bottom:position*100+'%'}}/>
  </div>
  <span className="fader-label">{label}</span>
 </div>;
}

/** A stack of switch buttons for small choices (feet, LFO function, on/off). */
export function Choice({spec,value,options,onChange,tone='cream',label=spec.label}){
 return <div className={'choice tone-'+tone+(options.length>4?' cols-2':'')} role="radiogroup" aria-label={label}>
  <div className="choice-buttons">{options.map((option,i)=><button type="button" key={option} role="radio" aria-checked={value===i} className={value===i?'on':''} onClick={()=>onChange(spec.key,i)}>{option}</button>)}</div>
  <span className="fader-label">{label}</span>
 </div>;
}

// The CS-80 ribbon is relative: wherever you touch is "in tune", sliding
// away bends. Releasing snaps back. range = semitones for half the strip.
export function Ribbon({range,onBend}){
 const touch=useRef(null);const [mark,setMark]=useState(null);
 const down=e=>{
  if(touch.current)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);
  const r=e.currentTarget.getBoundingClientRect(),origin=(e.clientX-r.left)/r.width;
  touch.current={id:e.pointerId,left:r.left,width:r.width,origin};setMark({origin,at:origin});onBend(0);
 };
 const move=e=>{
  const t=touch.current;if(!t||t.id!==e.pointerId)return;
  const at=Math.min(1,Math.max(0,(e.clientX-t.left)/t.width));setMark({origin:t.origin,at});
  onBend(Math.max(-2,Math.min(2,(at-t.origin)*2))*range);
 };
 const up=e=>{if(touch.current?.id!==e.pointerId)return;touch.current=null;setMark(null);onBend(0);};
 return <div className={'ribbon'+(mark?' touched':'')} role="slider" aria-label="Ribbon pitch bend" aria-valuemin={-range} aria-valuemax={range} aria-valuenow={mark?+((mark.at-mark.origin)*2*range).toFixed(2):0}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
  {mark&&<><div className="ribbon-span" style={{left:Math.min(mark.origin,mark.at)*100+'%',width:Math.abs(mark.at-mark.origin)*100+'%'}}/><div className="ribbon-origin" style={{left:mark.origin*100+'%'}}/><div className="ribbon-finger" style={{left:mark.at*100+'%'}}/></>}
  <span className="ribbon-label">{mark?((mark.at-mark.origin)*2*range>=0?'+':'')+((mark.at-mark.origin)*2*range).toFixed(1)+' st':`Ribbon · touch anywhere, slide to bend (±${range} st)`}</span>
 </div>;
}

// Stand-in for aftertouch when the piano has none: height = pressure,
// distance to the right = vibrato (mod). A pen's own pressure wins.
export function TouchPad({onTouch}){
 const touch=useRef(null);const [dot,setDot]=useState(null);
 const read=(e,r)=>{
  const x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y=Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height));
  const pressure=e.pointerType==='pen'&&e.pressure>0?e.pressure:y;
  setDot({x,y});onTouch(pressure,Math.max(0,(x-.2)/.8));
 };
 const down=e=>{if(touch.current)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);touch.current={id:e.pointerId,rect:e.currentTarget.getBoundingClientRect()};read(e,touch.current.rect);};
 const move=e=>{const t=touch.current;if(t&&t.id===e.pointerId)read(e,t.rect);};
 const up=e=>{if(touch.current?.id!==e.pointerId)return;touch.current=null;setDot(null);onTouch(0,0);};
 return <div className={'touchpad'+(dot?' touched':'')} role="group" aria-label="Touch pad: up for pressure, right for vibrato"
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
  {dot&&<div className="touchpad-dot" style={{left:dot.x*100+'%',bottom:dot.y*100+'%'}}/>}
  <span className="touchpad-label">{dot?`touch ${Math.round(dot.y*100)} · vib ${Math.round(Math.max(0,(dot.x-.2)/.8)*100)}`:'Press ↑ touch · → vibrato'}</span>
 </div>;
}

const BLACK=new Set([1,3,6,8,10]);
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
// Multi-touch keyboard. Fingers can slide between keys; touching nearer the
// front edge of a key plays louder.
export function Keys({low,count,active,onDown,onUp}){
 const pointers=useRef(new Map());
 const notes=Array.from({length:count},(_,i)=>low+i),whites=notes.filter(n=>!BLACK.has(n%12));
 const activeSet=new Set(active);
 const hit=e=>{
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-note]');if(!el)return null;
  const r=el.getBoundingClientRect();return {note:Number(el.dataset.note),velocity:.3+.7*Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))};
 };
 const down=e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const h=hit(e);if(!h)return;pointers.current.set(e.pointerId,h.note);onDown('touch:'+e.pointerId,h.note,e.pointerType==='pen'&&e.pressure>0?e.pressure:h.velocity);};
 const move=e=>{if(!pointers.current.has(e.pointerId))return;const h=hit(e);if(h&&h.note!==pointers.current.get(e.pointerId)){pointers.current.set(e.pointerId,h.note);onDown('touch:'+e.pointerId,h.note,h.velocity);}};
 const up=e=>{if(!pointers.current.has(e.pointerId))return;pointers.current.delete(e.pointerId);onUp('touch:'+e.pointerId);};
 let white=0;
 return <div className="keys" role="group" aria-label="On-screen keyboard" style={{'--whites':whites.length}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
  {notes.map(n=>{const black=BLACK.has(n%12),left=black?white-.3:white++;
   return <div key={n} data-note={n} className={(black?'key black':'key white')+(activeSet.has(n)?' held':'')} style={{left:`calc(${left} * 100% / var(--whites))`}} aria-label={NAMES[n%12]+(Math.floor(n/12)-1)}>{!black&&n%12===0&&<span>C{Math.floor(n/12)-1}</span>}</div>;})}
 </div>;
}
