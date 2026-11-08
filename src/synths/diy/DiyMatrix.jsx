import React,{useRef,useState} from 'react';
import {formatValue,toPosition,fromPosition} from '../params';

// The routing matrix: sources down the side, destinations across the top. A cell is one of
//   built-in  a depth the synth already has as its own control (LFO 1 → pitch, velocity → cutoff…);
//   route     one of the four free routes, taking a slot while it has a depth;
//   empty     nothing there yet.
// Drag a cell up or down to set its depth (a route is made on the first drag and gives its slot back when it returns to zero).
// Shift for fine, double-click to clear, arrow keys when focused. The four slots are the engine's limit.
const short=name=>name.split(' · ')[0].replace('Pulse width','PW').replace('Amplitude','Amp').replace('Stereo balance','Balance').replace('Feedback','Fdbk').replace(/^Operator (\d) level.*/,'Op $1').replace('Mod envelope','Mod env').replace('Amp envelope','Amp env').replace('Filter envelope','Filter env').replace('Smooth random','Random').replace('Keyboard','Key');

// [source index, destination index] → parameter, by the order of the mod source / target lists
const POLY_BUILT_IN={'1,1':'lfoPitch','1,2':'lfoFilter','1,3':'lfoPwm','2,1':'lfo2Pitch','2,2':'lfo2Filter','2,4':'lfo2Amp','5,1':'envelopePitch','5,2':'filterAmount','5,3':'envPwm','6,2':'velocityTone','6,4':'velocityAmp','7,2':'keytrack','8,1':'pressurePitch','8,2':'pressureTone','8,4':'pressureAmp'};
// the operators' own sensitivities are cells too: velocity, key position and pressure down the side, each operator's level across the top
const FM_BUILT_IN={'1,1':'vibrato','1,2':'lfoIndex','1,4':'tremolo',...Object.fromEntries([...Array(8).keys()].flatMap(i=>[[`4,${6+i}`,`operators.${i}.velocity`],[`5,${6+i}`,`operators.${i}.keyScale`],[`6,${6+i}`,`operators.${i}.pressure`]]))};

export default function RoutingMatrix({fm,values,specs,prefix,sources,targets,change}){
 const [full,setFull]=useState(false);
 const drag=useRef(null),lastTap=useRef(null);
 const built=fm?FM_BUILT_IN:POLY_BUILT_IN,pre=fm?'global.':prefix;
 const rows=sources.slice(1),cols=targets.slice(1);
 const used=n=>values[`${pre}modSource${n}`]>0&&values[`${pre}modTarget${n}`]>0;
 const routes=[1,2,3,4].filter(used).map(n=>({n,source:values[`${pre}modSource${n}`],target:values[`${pre}modTarget${n}`]}));
 const depthSpec=n=>specs[`${pre}modDepth${n}`];
 // what a cell is and what it edits: a value (built-in or route), the amp envelope's fixed link, or nothing yet
 const find=(r,c)=>{
  const name=built[`${r},${c}`],key=name&&(name.startsWith('operators.')?name:pre+name);
  if(key&&specs[key])return {kind:'built',key,spec:specs[key]};
  if(!fm&&r===4&&c===4)return {kind:'fixed'};
  const mine=routes.find(x=>x.source===r&&x.target===c);
  if(mine)return {kind:'via',n:mine.n,key:`${pre}modDepth${mine.n}`,spec:depthSpec(mine.n),tag:'R'+mine.n};
  return {kind:'empty'};
 };
 const free=()=>{for(let n=1;n<=4;n++)if(!used(n))return n;return 0;};
 const freeSlot=n=>{change(`${pre}modSource${n}`,0);change(`${pre}modTarget${n}`,0);change(`${pre}modDepth${n}`,0);};
 const flash=()=>{setFull(true);setTimeout(()=>setFull(false),900);};
 const take=(n,r,c)=>{change(`${pre}modSource${n}`,r);change(`${pre}modTarget${n}`,c);return {kind:'via',n,key:`${pre}modDepth${n}`,spec:depthSpec(n),tag:'R'+n};};

 // dragging is relative, like the faders; an empty cell takes a free route when the drag starts
 const down=(r,c,e)=>{
  if(e.button>0)return;
  const x=find(r,c);
  if(x.kind==='fixed')return;
  e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(lastTap.current&&lastTap.current.r===r&&lastTap.current.c===c&&now-lastTap.current.time<320){
   lastTap.current=null;drag.current=null;
   if(x.kind==='built')change(x.key,x.spec.default);else if(x.kind==='via')freeSlot(x.n);
   return;
  }
  lastTap.current={r,c,time:now};
  drag.current={id:e.pointerId,r,c,y:e.clientY,x,start:x.kind==='empty'?null:toPosition(x.spec,values[x.key]),last:null};
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  if(Math.abs(e.clientY-d.y)>=3)lastTap.current=null;
  if(d.x.kind==='empty'){
   if(Math.abs(e.clientY-d.y)<3)return;
   const n=free();
   if(!n){drag.current=null;flash();return;}
   d.x=take(n,d.r,d.c);d.start=toPosition(d.x.spec,0);
  }
  const p=Math.min(1,Math.max(0,d.start+(d.y-e.clientY)/(e.shiftKey?600:150)));
  let v=fromPosition(d.x.spec,p);
  if(d.x.kind==='via'&&Math.abs(v)<.045)v=0; // a route settles on zero so it is easy to let go of
  d.last=v;change(d.x.key,v);
 };
 const up=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;
  // a route dragged back to nothing gives its slot back
  if(d.x.kind==='via'&&d.last!==null&&Math.abs(d.last)<.005)freeSlot(d.x.n);
 };
 const key=(r,c,e)=>{
  const x=find(r,c);if(x.kind==='fixed')return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(x.kind==='built')change(x.key,x.spec.default);else if(x.kind==='via')freeSlot(x.n);return;}
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step===undefined)return;
  e.preventDefault();
  let target=x;
  if(x.kind==='empty'){const n=free();if(!n){flash();return;}target=take(n,r,c);}
  const now=target.kind==='via'&&x.kind==='empty'?0:values[target.key];
  change(target.key,fromPosition(target.spec,Math.min(1,Math.max(0,toPosition(target.spec,now)+step))));
 };

 const render=(r,c)=>{
  const x=find(r,c);let text='',fill=null,active=false,tip='';
  if(x.kind==='fixed'){text='●';active=true;tip='The amp envelope always shapes the amplitude';}
  else if(x.kind==='empty')tip='Free: drag to make a route';
  else{
   const v=values[x.key],p=toPosition(x.spec,v),bipolar=x.spec.min<0&&x.spec.max>0,zero=bipolar?toPosition(x.spec,0):0;
   text=formatValue(x.spec,v);active=x.kind==='via'||v!==0;tip=x.kind==='via'?`Route ${x.n}`:x.spec.label;
   fill=[Math.min(zero,p)*100,Math.abs(p-zero)*100];
  }
  return {x,text,fill,active,tip};
 };
 return <div className="rmx" role="grid" aria-label="Modulation routing" style={{'--cols':cols.length,'--cell':fm?'50px':'40px'}}>
  <div className="rmx-foot"><span><i className="swatch built"/>Built-in</span><span className={full?'warn':''}><i className="swatch via"/>Route · {routes.length} of 4 used{full?' · full':''}</span></div>
  <div className="rmx-head" role="row"><span className="rmx-corner">From ↓ · To →</span>{cols.map((c,i)=><span key={i} role="columnheader" title={c}>{short(c)}</span>)}</div>
  {rows.map((name,ri)=>{const r=ri+1;return <div className="rmx-row" role="row" key={r}>
   <span className="rmx-source" role="rowheader" title={name}>{short(name)}</span>
   {cols.map((cname,ci)=>{
    const c=ci+1,{x,text,fill,active,tip}=render(r,c);
    return <button type="button" key={c} role="gridcell" aria-label={`${short(name)} to ${short(cname)}`} title={`${short(name)} → ${short(cname)}${tip?' · '+tip:''}`} className={'rmx-cell '+(x.kind==='fixed'?'built':x.kind)+(active?' on':'')}
     onPointerDown={e=>down(r,c,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>key(r,c,e)}>
     {fill&&<i className="rmx-fill" style={{bottom:fill[0]+'%',height:fill[1]+'%'}}/>}
     <span className="rmx-text">{text}</span>{x.tag&&<small>{x.tag}</small>}
    </button>;})}
  </div>;})}
 </div>;
}

/**
 * The FM operators' wiring in the routing matrix's own design: a row is an operator, a column is what it feeds (a later operator, or the output). Drag a cell up or
 * down to set the amount (shift for fine), double-click to clear, arrow keys when focused. The cell on the diagonal makes that operator the one with feedback.
 */
export function OperatorGrid({values,specs,count,change}){
 const drag=useRef(null),lastTap=useRef(0);
 // always the full six rows and columns, so the table does not change size: what the synth has no operator for is dark
 const SLOTS=8,keyOf=(i,j)=>j===SLOTS?`carriers.${i}`:`routes.${i}.${j}`;
 const down=(i,j,e)=>{
  if(e.button>0)return;
  const key=keyOf(i,j),spec=specs[key];if(!spec)return;
  e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);e.currentTarget.focus({preventScroll:true});
  const now=performance.now();
  if(now-lastTap.current<320){lastTap.current=0;drag.current=null;change(key,0);return;}
  lastTap.current=now;
  drag.current={id:e.pointerId,key,spec,y:e.clientY,start:toPosition(spec,values[key])};
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const p=Math.min(1,Math.max(0,d.start+(d.y-e.clientY)/(e.shiftKey?600:150)));
  let v=fromPosition(d.spec,p);if(Math.abs(v)<.03)v=0;
  change(d.key,Number(v.toFixed(3)));
 };
 const up=e=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 const keydown=(i,j,e)=>{
  const key=keyOf(i,j),spec=specs[key];if(!spec)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(key,0);return;}
  const step={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02,PageUp:.1,PageDown:-.1}[e.key];
  if(step===undefined)return;
  e.preventDefault();change(key,Number(fromPosition(spec,Math.min(1,Math.max(0,toPosition(spec,values[key])+step))).toFixed(3)));
 };
 const cols=Array.from({length:SLOTS+1},(_,j)=>j);
 return <div className="rmx" role="grid" aria-label="Operator routing" style={{'--cols':SLOTS+1,'--cell':'50px'}}>
  <div className="rmx-head" role="row"><span className="rmx-corner">From ↓ · To →</span>{cols.map(j=><span key={j} role="columnheader" style={j<SLOTS&&j>=count?{opacity:.35}:undefined}>{j===SLOTS?'Output':'Op '+(j+1)}</span>)}</div>
  {Array.from({length:SLOTS},(_,i)=><div className="rmx-row" role="row" key={i}>
   <span className="rmx-source" role="rowheader" style={i>=count?{opacity:.35}:undefined}>Op {i+1}</span>
   {cols.map(j=>{
    // no operator there (past the count, or at or below the diagonal): a dark, dead cell
    if(i>=count||(j<SLOTS&&(j>=count||j<=i))){
     if(i<count&&j===i)return <button type="button" key={j} role="gridcell" aria-label={`Feedback on operator ${i+1}`} aria-pressed={values['global.feedbackOp']===i} title={`Feedback: operator ${i+1} feeds its own pitch back (the amount is Feedback depth)`} className={'rmx-cell fb'+(values['global.feedbackOp']===i?' on':'')} style={{cursor:'pointer'}} onClick={()=>change('global.feedbackOp',i)}><span className="rmx-text">↻</span></button>;
     return <span key={j} className="rmx-cell off" role="gridcell" aria-label="Unavailable"/>;
    }
    const key=keyOf(i,j),spec=specs[key],v=values[key],p=toPosition(spec,v);
    return <button type="button" key={j} role="gridcell" aria-label={j===SLOTS?`Operator ${i+1} to the output`:`Operator ${i+1} to operator ${j+1}`} title={`${spec.label} · drag to set, double-click to clear`} className={'rmx-cell '+(j===SLOTS?'via':'built')+(v>0?' on':'')}
     onPointerDown={e=>down(i,j,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>keydown(i,j,e)}>
     {v>0&&<i className="rmx-fill" style={{bottom:0,height:p*100+'%'}}/>}
     <span className="rmx-text">{v>0?formatValue(spec,v):''}</span>
    </button>;
   })}
  </div>)}
 </div>;
}
