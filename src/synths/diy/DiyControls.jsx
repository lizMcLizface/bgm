import React,{useRef,useState} from 'react';
import SoundPicker,{soundList,nextSound} from '../ui/SoundPicker';

/** A small set of choices as buttons, one lit (a radio group). `square` makes them square keys; `columns` lays them out in a grid.
 *  Unless it is a `row`, the button area is as tall as a fader's, so the label lines up with the faders' labels beside it. */
export function PickButtons({label,options,titles,value,onChange,columns=1,square=false,row=false,tall=false,disabled=false,tone='teal'}){
 return <div className={'pick tone-'+tone+(square?' square':'')+(row?' row':'')+(tall?' tall':'')} role="radiogroup" aria-label={label} style={{'--cols':row?options.length:columns}}>
  <div className="pick-grid">{options.map((o,i)=><button type="button" key={i} role="radio" aria-checked={value===i} disabled={disabled} className={value===i?'on':''} title={titles?.[i]??o} onClick={()=>onChange(i)}>{o}</button>)}</div>
  <span className="fader-label">{label}</span>
 </div>;
}

/** The preset display: a little OLED window showing the category and the sound, with a click-through to the full browser, and
 *  an endless knob beside it that steps through the sounds (drag, wheel or arrow keys). */
export function OledPicker(props){
 const {synth,presets,mine,current,currentCategory,choose}=props;
 const list=soundList(synth,presets,mine);
 const step=dir=>{const next=nextSound(list,current,currentCategory,dir,false);if(next)choose(next);};
 return <div className="oled-picker">
 <PresetKnob onStep={step}/>
  <SoundPicker {...props} display={({open,ref,category,name,expanded,active})=><button ref={ref} type="button" className="oled" style={{'--accent':active?.colour}} aria-haspopup="dialog" aria-expanded={expanded} onClick={open} title="Browse every sound">
   <span className="oled-cat">{category}</span><span className="oled-name" key={name} style={{'--n':Math.min(name.length,22)}}>{name}</span>
  </button>}/>
  </div>;
}

export function PresetKnob({onStep,label='Scroll through sounds'}){
 const [angle,setAngle]=useState(0),drag=useRef(null);
 const turn=dir=>{setAngle(a=>a+dir*24);onStep(dir);};
 const down=e=>{if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});drag.current={id:e.pointerId,y:e.clientY};};
 const move=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dy=d.y-e.clientY;if(Math.abs(dy)>=14){turn(dy>0?1:-1);d.y=e.clientY;}};
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const wheel=useRef(0);
 return <div className="preset-knob" role="spinbutton" tabIndex={0} aria-label={label} title="Turn to step through the options (drag, wheel or arrow keys)"
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
  onWheel={e=>{wheel.current+=e.deltaY;if(Math.abs(wheel.current)>=40){turn(wheel.current<0?1:-1);wheel.current=0;}}}
  onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();turn(1);}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();turn(-1);}}}>
  <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><g transform={`rotate(${angle} 24 24)`}>
   <circle cx="24" cy="24" r="20" className="dial-skirt"/><circle cx="24" cy="24" r="15" className="dial-cap"/>
   {Array.from({length:12},(_,i)=><line key={i} x1="24" y1="10.5" x2="24" y2="13" className="knob-grip" transform={`rotate(${i*30} 24 24)`}/>)}
   <line x1="24" y1="6" x2="24" y2="15" className="dial-pointer"/>
  </g></svg>
 </div>;
}
