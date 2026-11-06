import React,{useRef,useState} from 'react';
import {formatValue,toPosition,fromPosition} from '../params';
import {BY_KEY} from './params';

// The routing matrix of the wavetable synthesizer, in the design of the DIY synths': sources down the side, destinations across the top. A cell is one of
//   built-in  a depth the synth already has as its own control (LFO 1 → pitch, velocity → filter…);
//   route     one of the four free routes, taking a slot while it has a depth;
//   empty     nothing there yet.
// Drag a cell up or down to set its depth (a route is made on the first drag and gives its slot back when it returns to zero). Shift for fine,
// double-click to clear, arrow keys when focused. A dark cell is a pairing that makes no sense (the vector envelope to pitch is a free route, not a dark cell).
// destinations across the top (code: the kernel's route destination) and sources down the side (code: its route source), with the depth each pairing
// already has as a control of its own, in the order of the columns
export const TARGETS=[['Pitch',1],['Filter',2],['Res',7],['Drive',8],['Joy X',3],['Joy Y',4],['Amp',5],['Warp',6],['Detune',9],['Angle',10],['Radius',11]];
// columns: Pitch, Filter, Res, Drive, Joy X, Joy Y, Amp, Warp, Detune, Angle, Radius
const row=(o)=>Array.from({length:11},(_,i)=>o[i]??null);
const lfo=(n,r,t)=>row({0:`lfo${n}Pitch`,1:`lfo${n}Cut`,4:`lfo${n}X`,5:`lfo${n}Y`,6:`lfo${n}Amp`,9:t,10:r});
export const SOURCES=[
 ['LFO 1',1,lfo(1,'lfo1R','lfo1T')],['LFO 2',2,lfo(2,'lfo2R','lfo2T')],
 ['Vector env',3,row({4:'vecX',5:'vecY',9:'vecT',10:'vecR'})],
 ['Mod env',8,row({})],
 ['Filter env',9,row({1:'filterEnv'})],
 ['Amp env',10,row({6:'fixed'})],
 ['Velocity',4,row({1:'velFilter',4:'velX',5:'velY',6:'velAmp',9:'velT',10:'velR'})],
 ['Key',5,row({1:'keyFollow',4:'keyX',5:'keyY',9:'keyT',10:'keyR'})],
 ['Random',11,row({})],
 ['Mod wheel',6,row({0:'modPitch',1:'modFilter',4:'modX',5:'modY',6:'modAmp'})],
 ['Pressure',7,row({0:'prsPitch',1:'prsFilter',4:'prsX',5:'prsY',6:'prsAmp',9:'prsT',10:'prsR'})],
 ['Pitch wheel',12,row({})],
];
const NOTES={modPitch:'Mod wheel: how much LFO 1 vibrato it adds',prsPitch:'Pressure: how much LFO 1 vibrato it adds',modAmp:'Mod wheel up swells the sound in (0 leaves the level alone)',prsAmp:'Pressure swells the sound in (0 leaves the level alone)'};
const SLOTS=[1,2,3,4];

export default function WtMatrix({values,change}){
 const [full,setFull]=useState(false);
 const drag=useRef(null),lastTap=useRef(0);
 const used=n=>values[`routeSource${n}`]>0&&values[`routeTarget${n}`]>0;
 const routes=SLOTS.filter(used).map(n=>({n,source:values[`routeSource${n}`],target:values[`routeTarget${n}`]}));
 // what a cell is and what it edits
 const find=(r,c)=>{
  const key=SOURCES.find(x=>x[1]===r)[2][TARGETS.findIndex(t=>t[1]===c)];
  if(key==='fixed')return {kind:'fixed'};
  if(key)return {kind:'built',key,spec:BY_KEY[key]};
  const mine=routes.find(x=>x.source===r&&x.target===c);
  if(mine)return {kind:'via',n:mine.n,key:`routeDepth${mine.n}`,spec:BY_KEY[`routeDepth${mine.n}`],tag:'R'+mine.n};
  return {kind:'empty'};
 };
 const free=()=>SLOTS.find(n=>!used(n))??0;
 const freeSlot=n=>{change(`routeSource${n}`,0);change(`routeTarget${n}`,0);change(`routeDepth${n}`,0);};
 const flash=()=>{setFull(true);setTimeout(()=>setFull(false),900);};
 const take=(n,r,c)=>{change(`routeSource${n}`,r);change(`routeTarget${n}`,c);return {kind:'via',n,key:`routeDepth${n}`,spec:BY_KEY[`routeDepth${n}`],tag:'R'+n};};
 const clear=x=>{if(x.kind==='built')change(x.key,0);else if(x.kind==='via')freeSlot(x.n);};

 // dragging is relative, like the faders; an empty cell takes a free route when the drag starts
 const down=(r,c,e)=>{
  if(e.button>0)return;
  const x=find(r,c);
  if(x.kind==='fixed')return;
  e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(now-lastTap.current<320){lastTap.current=0;drag.current=null;clear(x);return;}
  lastTap.current=now;
  drag.current={id:e.pointerId,r,c,y:e.clientY,x,start:x.kind==='empty'?null:toPosition(x.spec,values[x.key]),last:null};
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  if(d.x.kind==='empty'){
   if(Math.abs(e.clientY-d.y)<3)return;
   const n=free();
   if(!n){drag.current=null;flash();return;}
   d.x=take(n,d.r,d.c);d.start=toPosition(d.x.spec,0);d.y=e.clientY;
  }
  const p=Math.min(1,Math.max(0,d.start+(d.y-e.clientY)/(e.shiftKey?600:150)));
  let v=fromPosition(d.x.spec,p);
  if(Math.abs(v)<.02*(d.x.spec.max-d.x.spec.min))v=0; // settles on zero so it is easy to let go of
  d.last=v;change(d.x.key,v);
 };
 const up=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;
  // a route dragged back to nothing gives its slot back
  if(d.x.kind==='via'&&d.last!==null&&Math.abs(d.last)<.005)freeSlot(d.x.n);
 };
 const key=(r,c,e)=>{
  const x=find(r,c);
  if(x.kind==='fixed')return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();clear(x);return;}
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step===undefined)return;
  e.preventDefault();
  let target=x;
  if(x.kind==='empty'){const n=free();if(!n){flash();return;}target=take(n,r,c);}
  const now=target.kind==='via'&&x.kind==='empty'?0:values[target.key];
  change(target.key,fromPosition(target.spec,Math.min(1,Math.max(0,toPosition(target.spec,now)+step))));
 };

 return <div className="rmx wt-rmx" role="grid" aria-label="Modulation routing" style={{'--cols':TARGETS.length,'--cell':'32px'}}>
  <div className="rmx-foot"><span><i className="swatch built"/>Built-in</span><span className={full?'warn':''}><i className="swatch via"/>Route · {routes.length} of 4 used{full?' · full':''}</span></div>
  <div className="rmx-head" role="row"><span className="rmx-corner">From ↓ · To →</span>{TARGETS.map(([t])=><span key={t} role="columnheader">{t}</span>)}</div>
  {SOURCES.map(([name,r])=>{return <div className="rmx-row" role="row" key={name}>
   <span className="rmx-source" role="rowheader">{name}</span>
   {TARGETS.map(([target,c])=>{
    const x=find(r,c);
    let text='',fill=null,active=false,tip='Free: drag to make a route';
    if(x.kind==='fixed'){text='●';active=true;tip='The amp envelope always shapes the amplitude';}
    else if(x.kind!=='empty'){
     const v=values[x.key],p=toPosition(x.spec,v),zero=x.spec.min<0&&x.spec.max>0?toPosition(x.spec,0):0;
     text=formatValue(x.spec,v);active=x.kind==='via'||v!==0;tip=(x.kind==='via'?`Route ${x.n}`:NOTES[x.key]??x.spec.label)+' · drag to set, double-click to clear';
     fill=[Math.min(zero,p)*100,Math.abs(p-zero)*100];
    }
    return <button type="button" key={c} role="gridcell" aria-label={`${name} to ${target}`} title={`${name} → ${target} · ${tip}`} className={'rmx-cell '+(x.kind==='fixed'?'built':x.kind)+(active?' on':'')}
     onPointerDown={e=>down(r,c,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>key(r,c,e)}>
     {fill&&<i className="rmx-fill" style={{bottom:fill[0]+'%',height:fill[1]+'%'}}/>}
     <span className="rmx-text">{text}</span>{x.tag&&<small>{x.tag}</small>}
    </button>;})}
  </div>;})}
 </div>;
}
