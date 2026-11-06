import React,{useRef,useState,useMemo,useEffect,useLayoutEffect} from 'react';
import {Dial} from '../ui/controls';
import {formatValue} from '../params';
import {BY_KEY} from './params';
import {buildWave,toDrawing,analyse,drawn,harmonics,DRAW_POINTS,SHAPES} from './waves';
import {SLOT_NAMES} from './waves';

const W=256,H=88,BARS=32;

// A small outline of a wave, for the shape display and the menu.
const outline=(def,w=60,h=18)=>{
 const s=buildWave(def),mean=s.reduce((a,v)=>a+v,0)/s.length;
 let pk=1e-9;for(const v of s)pk=Math.max(pk,Math.abs(v-mean));
 const out=[];for(let n=0;n<s.length;n+=32)out.push(`${(n/s.length*w).toFixed(1)},${(h/2-(s[n]-mean)/pk*(h/2-1.5)).toFixed(1)}`);
 return out.join(' ');
};
const OUTLINES=SHAPES.map(([,d])=>outline(d));
const SHAPE_SPEC={key:'wtShape',min:0,max:SHAPES.length-1,curve:'step',unit:'choice',options:SHAPES.map(([n])=>n),default:0};

// The hovering menu of stock shapes, opened from the shape display. It closes on a choice, a click elsewhere or Escape.
function ShapeMenu({anchor,current,onPick,onClose}){
 const box=useRef(null),[place,setPlace]=useState(null);
 useLayoutEffect(()=>{
  const r=anchor.getBoundingClientRect(),el=box.current,w=el.offsetWidth,h=el.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  setPlace({left:Math.max(8,Math.min(r.left,vw-w-8)),top:r.bottom+6+h<=vh-8?r.bottom+6:Math.max(8,r.top-6-h)});
 },[anchor]);
 useEffect(()=>{
  const key=e=>{if(e.key==='Escape')onClose();};
  const away=e=>{if(!box.current?.contains(e.target)&&!anchor.contains(e.target))onClose();};
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',away);
  return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',away);};
 },[anchor,onClose]);
 return <div ref={box} className="wt-shape-menu" role="listbox" aria-label="Shapes" data-desk-item style={place?{left:place.left,top:place.top}:{visibility:'hidden',left:0,top:0}}>
  {SHAPES.map(([name],i)=><button type="button" key={name} role="option" aria-selected={current===i} className={current===i?'on':''} onClick={()=>onPick(i)}>
   <svg viewBox="0 0 60 18" aria-hidden="true"><polyline points={OUTLINES[i]}/></svg><span>{name}</span></button>)}
 </div>;
}

// One wave: its outline, a draw mode (drag across to sketch it), a harmonic mode (drag across the bars), and the stock shapes. Edits become a new
// definition handed to onChange; the kernel normalises the level. The box around it gives the title, the Waveform/Harmonics selector (`mode`) and
// the smooth and invert buttons. `control` draws the page's own knobs.
export default function WaveEditor({slot,def,onChange,control,values,mode,change}){
 const lcd=key=>formatValue(BY_KEY[key],values[key]);
 const [pick,setPick]=useState(0),[menu,setMenu]=useState(null);
 // a wave that is none of the stock shapes (after an edit) reads Custom
 const matched=SHAPES.findIndex(([,d])=>JSON.stringify(d)===JSON.stringify(def)),shapeIdx=matched>=0?matched:pick;
 const svg=useRef(null),last=useRef(null);
 const points=useMemo(()=>{
  const w=buildWave(def),mean=w.reduce((s,v)=>s+v,0)/w.length;
  let pk=1e-9;for(const v of w)pk=Math.max(pk,Math.abs(v-mean));
  const out=[];for(let n=0;n<w.length;n+=4)out.push(`${(n/w.length*W).toFixed(1)},${(H/2-(w[n]-mean)/pk*(H/2-5)).toFixed(1)}`);
  return out.join(' ');
 },[def]);
 const spectrum=useMemo(()=>mode==='harm'?analyse(def,BARS):null,[def,mode]);
 const at=e=>{const b=svg.current.getBoundingClientRect();return [(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height];};
 const draw=e=>{
  const [fx,fy]=at(e),i=Math.max(0,Math.min(DRAW_POINTS-1,Math.floor(fx*DRAW_POINTS))),v=Math.max(-1,Math.min(1,1-2*fy));
  const y=def.t==='draw'?def.y.slice():toDrawing(def);
  // fill the points skipped between two pointer events
  const from=last.current??i;
  for(let k=Math.min(from,i);k<=Math.max(from,i);k++)y[k]=v;
  last.current=i;onChange(drawn(y));
 };
 const bars=e=>{
  const [fx,fy]=at(e),h=Math.max(0,Math.min(BARS-1,Math.floor(fx*BARS))),v=Math.max(0,Math.min(1,1-fy));
  const {a,p}=spectrum;const next=a.slice();next[h]=v;onChange(harmonics(next,p));
 };
 const down=e=>{e.preventDefault();svg.current.setPointerCapture(e.pointerId);last.current=null;(mode==='draw'?draw:bars)(e);};
 const move=e=>{if(e.buttons)(mode==='draw'?draw:bars)(e);};
 const k=n=>`${n}${slot+1}`;
 const pair=(key,label)=><div className="wt-knob">{control([key,label,'knob'],'cream')}<output className="wt-lcd" aria-label={label}>{lcd(key)}</output></div>;
 const choose=i=>{setPick(i);onChange(SHAPES[i][1]);setMenu(null);};
 return <div className="wt-editor">
  <div className="wt-wavebox">
  <svg ref={svg} data-desk-item viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="wt-wave" role="application" aria-label={`Wave ${SLOT_NAMES[slot]} editor`} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{last.current=null;}}>
   <line x1="0" y1={H/2} x2={W} y2={H/2} className="wt-axis"/>
   {mode==='draw'?<polyline points={points} className="wt-outline"/>
    :spectrum.a.map((a,i)=><rect key={i} x={i*W/BARS+1} y={H-a*(H-6)} width={W/BARS-2} height={a*(H-6)} className="wt-bar"/>)}
  </svg>
  </div>
  <div className="wt-ctl">
   <div className="wt-row wt-shape-row">
    <button type="button" className="wt-lcd tall" title="Pick a shape" aria-haspopup="listbox" aria-expanded={!!menu} onClick={e=>{const a=e.currentTarget;setMenu(m=>m?null:a);}}>
     {matched>=0?SHAPES[matched][0]:'Custom'}</button>
    <Dial spec={SHAPE_SPEC} value={shapeIdx} label="Shape" tone="cream" onChange={(_,v)=>choose(v)}/>
   </div>
   {menu&&<ShapeMenu anchor={menu} current={matched} onPick={choose} onClose={()=>setMenu(null)}/>}
   <div className="wt-row"><span className="wt-tag">Tune</span>{pair(k('coarse'),'Coarse')}{pair(k('fine'),'Fine')}</div>
   <div className="wt-row"><span className="wt-tag">Morph</span>
    <div className="wt-knob"><Dial spec={BY_KEY[k('warpMode')]} value={values[k('warpMode')]} label="Warp" tone="cream" onChange={change}/><output className="wt-lcd" aria-label="Warp mode">{lcd(k('warpMode'))}</output></div>
    {pair(k('warpAmt'),'Warp amount')}</div>
   <div className="wt-row"><span className="wt-tag">Mix</span>{pair(k('level'),'Level')}{pair(k('pan'),'Pan')}</div>
  </div>
 </div>;
}
