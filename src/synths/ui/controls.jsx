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
 return <div className={'choice tone-'+tone+(options.length>4?' cols-2':'')+(options.length===2?' two':'')} role="radiogroup" aria-label={label}>
  <div className="choice-buttons">{options.map((option,i)=><button type="button" key={option} role="radio" aria-checked={value===i} className={value===i?'on':''} onClick={()=>onChange(spec.key,i)}>{option}</button>)}</div>
  <span className="fader-label">{label}</span>
 </div>;
}

/** A rotary knob in the style of the Juno's: ticks around a 270 degree sweep, a black skirted cap with a white pointer. Drag up or
 *  down (shift for fine), wheel, arrow keys, double-tap for the default. The value shows above it and the label below, like a fader. */
export function Dial({spec,value,onChange,tone='cream',label=spec.label}){
 const drag=useRef(null),lastTap=useRef(0);
 const position=toPosition(spec,value),angle=-135+position*270;
 // a control that runs both ways from zero (tune) lights outward from the top, in whichever direction it is turned
 const bipolar=spec.min<0&&spec.max>0,zero=bipolar?toPosition(spec,0):0;
 const lit=t=>bipolar?(t>=Math.min(zero,position)-1e-6&&t<=Math.max(zero,position)+1e-6&&!(Math.abs(position-zero)<1e-6&&Math.abs(t-zero)>1e-6)):t<=position+1e-6;
 const set=p=>onChange(spec.key,fromPosition(spec,Math.min(1,Math.max(0,p))));
 const down=e=>{
  if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(now-lastTap.current<320){lastTap.current=0;drag.current=null;onChange(spec.key,spec.default);return;}
  lastTap.current=now;drag.current={id:e.pointerId,y:e.clientY,start:position};
 };
 const move=e=>{const d=drag.current;if(d&&d.id===e.pointerId)set(d.start+(d.y-e.clientY)/(e.shiftKey?600:150));};
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const key=e=>{
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step!==undefined){e.preventDefault();set(position+step);}
  else if(e.key==='Home'||e.key==='End'){e.preventDefault();set(e.key==='End'?1:0);}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onChange(spec.key,spec.default);}
 };
 const ticks=Array.from({length:11},(_,i)=>{const a=(-135+i*27)*Math.PI/180;return [28+Math.sin(a)*22,28-Math.cos(a)*22,28+Math.sin(a)*26,28-Math.cos(a)*26];});
 return <div className={'dial tone-'+tone} role="slider" tabIndex={0} aria-label={label} aria-valuemin={spec.min} aria-valuemax={spec.max} aria-valuenow={+value.toFixed(4)} aria-valuetext={formatValue(spec,value)}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
  <span className="fader-value">{formatValue(spec,value)}</span>
  <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
   {ticks.map((t,i)=><line key={i} x1={t[0]} y1={t[1]} x2={t[2]} y2={t[3]} className={'dial-tick'+(lit(i/10)?' lit':'')+(bipolar&&i===5?' mid':'')}/>)}
   <g transform={`rotate(${angle} 28 28)`}>
    <circle cx="28" cy="28" r="17" className="dial-skirt"/><circle cx="28" cy="28" r="13" className="dial-cap"/>
    <line x1="28" y1="14" x2="28" y2="25" className="dial-pointer"/>
   </g>
  </svg>
  <span className="fader-label">{label}</span>
 </div>;
}

/** A two-way choice as one push button: lit and pressed in when on. On/off choices keep their label; any other pair shows the
 *  current position beside it, so one button replaces a two-button switch and several can stack in a column. */
export function Toggle({spec,value,onChange,tone='cream',label=spec.label}){
 const onOff=spec.options[0]==='Off'&&spec.options[1]==='On',on=value===1;
 return <button type="button" role="switch" aria-checked={on} aria-label={label} title={onOff?label:`${label}: ${spec.options[value]}`} className={'toggle-key tone-'+tone+(on?' on':'')+(onOff?' sq':'')} onClick={()=>onChange(spec.key,on?0:1)}>
  {onOff?label:`${label}: ${spec.options[value]}`}
 </button>;
}

/** A two-way choice as a toggle switch: the lever up selects the second option, down the first. Each option is printed directly
 *  above or below its end of the throw (the current one brighter), the control's own name above the top option, and
 *  any push buttons passed as children sit at the foot of the column. The throw is capped in height. The throw runs from where a fader's track starts down to where the
 *  last thing above the name ends, so it lines up with the faders beside it. The cap takes the colour of the area it is in. */
export function Lever({spec,value,onChange,tone='cream',label=spec.label,children}){
 const on=value===1;
 return <div className={'lever tone-'+tone+(on?' on':'')+(children?'':' lone')}>
  <span className="lever-top"><span className="lever-name" aria-hidden={children?undefined:true}>{label}</span><span className={'lever-end'+(on?' now':'')}>{spec.options[1]}</span></span>
  <button type="button" className="lever-throw" role="switch" aria-checked={on} aria-label={label} title={`${label}: ${spec.options[value]}`} onClick={()=>onChange(spec.key,on?0:1)}>
   <span className="lever-slot"><span className="lever-stem"/><span className="lever-knob"/></span>
  </button>
  <span className={'lever-end lever-bottom'+(on?'':' now')}>{spec.options[0]}</span>
  {children&&<span className="lever-buttons">{children}</span>}
  {!children&&<span className="fader-label lever-foot">{label}</span>}
 </div>;
}

// The CS-80 ribbon is relative: wherever you touch is "in tune", sliding
// away bends. Releasing snaps back. range = semitones for half the strip.
// vertical: the strip stands upright, up bends up, and it carries no text.
export function Ribbon({range,onBend,vertical=false}){
 const touch=useRef(null);const [mark,setMark]=useState(null);
 const place=(e,r)=>Math.min(1,Math.max(0,vertical?1-(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width));
 const down=e=>{
  if(touch.current)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);
  const r=e.currentTarget.getBoundingClientRect(),origin=place(e,r);
  touch.current={id:e.pointerId,r,origin};setMark({origin,at:origin});onBend(0);
 };
 const move=e=>{
  const t=touch.current;if(!t||t.id!==e.pointerId)return;
  const at=place(e,t.r);setMark({origin:t.origin,at});
  onBend(Math.max(-2,Math.min(2,(at-t.origin)*2))*range);
 };
 const up=e=>{if(touch.current?.id!==e.pointerId)return;touch.current=null;setMark(null);onBend(0);};
 return <div className={'ribbon'+(vertical?' vertical':'')+(mark?' touched':'')} role="slider" title={vertical?`Ribbon: touch anywhere, slide up or down to bend (±${range} st)`:undefined} aria-label="Ribbon pitch bend" aria-valuemin={-range} aria-valuemax={range} aria-valuenow={mark?+((mark.at-mark.origin)*2*range).toFixed(2):0}
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
  {mark&&(vertical
   ?<><div className="ribbon-span" style={{bottom:Math.min(mark.origin,mark.at)*100+'%',height:Math.abs(mark.at-mark.origin)*100+'%'}}/><div className="ribbon-origin" style={{bottom:mark.origin*100+'%'}}/><div className="ribbon-finger" style={{bottom:mark.at*100+'%'}}/></>
   :<><div className="ribbon-span" style={{left:Math.min(mark.origin,mark.at)*100+'%',width:Math.abs(mark.at-mark.origin)*100+'%'}}/><div className="ribbon-origin" style={{left:mark.origin*100+'%'}}/><div className="ribbon-finger" style={{left:mark.at*100+'%'}}/></>)}
  {!vertical&&<span className="ribbon-label">{mark?((mark.at-mark.origin)*2*range>=0?'+':'')+((mark.at-mark.origin)*2*range).toFixed(1)+' st':`Ribbon · touch anywhere, slide to bend (±${range} st)`}</span>}
 </div>;
}

// A mod wheel: drag it up and it stays where you leave it (like the real one, it does not spring back); double-click puts it to 0.
export function ModWheel({onChange}){
 const [v,setV]=useState(0),drag=useRef(null);
 const set=x=>{const n=Math.min(1,Math.max(0,x));setV(n);onChange(n);};
 const at=(e,r)=>set(1-(e.clientY-r.top)/r.height);
 const down=e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={id:e.pointerId,r:e.currentTarget.getBoundingClientRect()};at(e,drag.current.r);};
 const move=e=>{if(drag.current?.id===e.pointerId)at(e,drag.current.r);};
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 return <div className="modwheel" role="slider" aria-label="Mod wheel (vibrato)" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v*100)} tabIndex={0} title="Mod wheel: drag up for vibrato; it stays where you leave it (double-click for 0)"
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={()=>set(0)}
  onKeyDown={e=>{if(e.key==='ArrowUp'){e.preventDefault();set(v+.05);}else if(e.key==='ArrowDown'){e.preventDefault();set(v-.05);}}}>
  <div className="modwheel-fill" style={{height:v*100+'%'}}/><div className="modwheel-grip" style={{bottom:`calc(${v*100}% - 6px)`}}/>
  <span className="modwheel-label">MOD</span>
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
