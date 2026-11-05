import React,{useRef,useState} from 'react';
import SoundPicker,{soundList,nextSound} from '../ui/SoundPicker';
import {MODELS} from '../../synth-lab/patch';

/** A small set of choices as buttons, one lit (a radio group). `square` makes them square keys; `columns` lays them out in a grid.
 *  Unless it is a `row`, the button area is as tall as a fader's, so the label lines up with the faders' labels beside it. */
export function PickButtons({label,options,titles,value,onChange,columns=1,square=false,row=false,stack=false,compact=false,tall=false,narrow=false,colours,icons,disabled=false,tone='teal'}){
 return <div className={'pick tone-'+tone+(square?' square':'')+(row||stack?' row':'')+(compact?' compact':'')+(tall?' tall':'')+(narrow?' narrow':'')+(icons?' icons':'')} role="radiogroup" aria-label={label} style={{'--cols':row&&!stack?options.length:columns}}>
  <div className="pick-grid">{options.map((o,i)=><button type="button" key={i} role="radio" aria-checked={value===i} disabled={disabled} className={value===i?'on':''} style={colours?{'--tone':colours[i],borderColor:colours[i]+'77',...(value===i?{}:{color:colours[i]})}:undefined} title={titles?.[i]??o} aria-label={icons?(titles?.[i]??o):undefined} onClick={()=>onChange(i)}>{icons?icons[i]:o}</button>)}</div>
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

/** A two-way choice as a horizontal slide switch: both ends are named above it (the current one brighter) and the control's own name
 *  sits below. Narrow enough to stack several in the width of one lever. */
export function HToggle({spec,value,options,titles=options,onChange,tone='cream',label=spec.label}){
 const on=value===1;
 return <div className={'htoggle tone-'+tone+(on?' on':'')}>
  <span className="htoggle-ends" aria-hidden="true"><span className={on?'':'now'}>{options[0]}</span><span className={on?'now':''}>{options[1]}</span></span>
  <button type="button" className="htoggle-track" role="switch" aria-checked={on} aria-label={label} title={`${label}: ${titles[value]}`} onClick={()=>onChange(spec.key,on?0:1)}><span className="htoggle-knob"/></button>
  <span className="fader-label">{label}</span>
 </div>;
}

// Waveform pictograms (the paths are the calmbgm synth's own, src/util/util.js, drawn in a 50 × 50 box): the oscillator waves and the LFO shapes.
const PATHS={
 'Off':'M 15 25 L 35 25 M 20 20 L 20 30 M 30 20 L 30 30','Sine':'M 10 25 Q 18 10 25 25 Q 32 40 40 25','Triangle':'M 10 25 L 19 16 L 31 34 L 40 25',
 'Saw':'M 10 32 L 10 18 L 25 32 L 25 18 L 40 32 L 40 18','Pulse':'M 10 32 L 10 18 L 17 18 L 17 32 L 40 32 L 40 18','Square':'M 10 32 L 10 18 L 25 18 L 25 32 L 40 32 L 40 18',
 'Organ':'M 14 14 L 14 36 M 20 20 L 20 36 M 26 14 L 26 36 M 32 26 L 32 36 M 38 22 L 38 36','Hollow':'M 10 30 Q 10 18 17 18 Q 24 18 24 25 Q 24 32 31 32 Q 40 32 40 20',
 'Choir':'M 14 22 Q 25 12 36 22 Q 25 40 14 22','Glass':'M 25 12 L 35 25 L 25 38 L 15 25 Z','Reed':'M 10 30 L 18 18 Q 20 30 26 30 L 32 18 Q 34 30 40 30',
 'Band-limited triangle':'M 10 25 Q 14 17 19 16 Q 25 25 31 34 Q 36 33 40 25','Sample & hold':'M 10 30 L 10 20 L 17 20 L 17 32 L 24 32 L 24 16 L 31 16 L 31 28 L 40 28',
};
/** The pictogram for a wave or LFO shape by its name, or null where there is none. */
export const waveIcon=name=>PATHS[name]?<svg viewBox="8 9 34 32" aria-hidden="true"><path d={PATHS[name]}/></svg>:null;

/** DI-Poly's sounds bar: the architecture keys, then the OLED display and knob. */
export function PolyPicker(props){
 const {values,change}=props,names=['Prophet','Jupiter','Dual','Juno'];
 return <>
  {values&&<PickButtons row label="Architecture" options={names} titles={MODELS.map(m=>m.name)} value={values['global.model']} onChange={i=>change('global.model',i)}/>}
  <OledPicker {...props}/>
 </>;
}
