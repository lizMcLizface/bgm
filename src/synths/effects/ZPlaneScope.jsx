import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {zplaneSections,zplaneResponse} from './zplaneMath';
import {ZPLANE_SHAPE_NAMES,ZPLANE_CUSTOM,ZPLANE_MAX_NODES,ZPLANE_PARTS,customKey,countKey,nodesOf,padNodes,insertNode,dropNode,resizeNodes,cleanNodes} from './zplaneShapes';
import {RACK_PARAMS} from './params';
import {load,save} from '../storage';

// The z-plane filter's whole panel below the header: a display of what it is doing, and what sets it.
//  - the response on a log frequency axis (shape A and shape B dashed, the morphed result solid)
//  - the poles (x) and zeros (o) in the upper half of the z-plane, drawn zoomed: the rim is the unit circle, the angle follows the
//    same log frequency axis as the response (low at the right, where DC is) and the distance from the rim is magnified, because
//    real poles sit within a hair of it and would otherwise all pile up in one spot
//  - one row for each shape: a knob and display for the shape (a click on the display opens a list of every shape with its curve, and
//    the shapes saved in this browser; the knob steps through the built-in ones and then Custom), a save icon, a knob and display for
//    the number of nodes (one to twelve), and a button that picks the shape the handles on the display edit
//  - handles (nodes) on the display for the shape being edited: drag across for the frequency, up and down for the boost, wheel for the
//    width, double-click a node to take it out and the empty display to put one in. Editing a built-in shape copies it into that side's
//    Custom shape first; the custom numbers are rack parameters, so they travel with the rack.
const W=300,H=136,LO=40,HI=12000,DB=24,POINTS=96,LAST=ZPLANE_SHAPE_NAMES.length-1;
const FREQS=Array.from({length:POINTS},(_,i)=>LO*(HI/LO)**(i/(POINTS-1)));
const X=hz=>Math.log(Math.max(LO,Math.min(HI,hz))/LO)/Math.log(HI/LO)*W,Y=db=>H/2-Math.max(-DB,Math.min(DB,db))/DB*(H/2-6);
const path=db=>db.map((d,i)=>(i?'L':'M')+X(FREQS[i]).toFixed(1)+' '+Y(d).toFixed(1)).join('');
const TICKS=[100,1000,10000];
const MAGNIFY=7,LIBRARY_KEY='synths:zplane:library',LIBRARY_MAX=40;
const clamp=x=>Math.min(1,Math.max(0,x));
const clampTo=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const SIDES=['a','b'];
const readLibrary=()=>(load(LIBRARY_KEY,[])||[]).map(e=>e&&typeof e.name==='string'?{name:e.name,nodes:cleanNodes(e.nodes)}:null).filter(e=>e?.nodes);

// a shape's little curve for the list: 28 points over the same axis, drawn in a 64 x 26 box
const THUMB_FREQS=Array.from({length:28},(_,i)=>LO*(HI/LO)**(i/27));
const thumb=(index,rows)=>{
 const db=zplaneResponse(zplaneSections(index,index,0,0,.5,undefined,{a:rows,b:rows}),THUMB_FREQS);
 return db.map((d,i)=>(i?'L':'M')+(i/27*64).toFixed(1)+' '+(13-clampTo(d,-DB,DB)/DB*11).toFixed(1)).join('');
};

/** A small rotary: drag up or down, wheel, arrow keys, double-click for the default. `position` runs 0..1. */
function ZKnob({label,display,position,onPosition,onReset,step=.02,span=140}){
 const drag=useRef(null);
 return <div className="zp-dial" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(position.toFixed(3))} aria-valuetext={display} title={label+': drag, wheel or arrow keys · double-click resets'}
  onPointerDown={e=>{if(e.button>0)return;e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={id:e.pointerId,y:e.clientY,p:position};}}
  onPointerMove={e=>{const d=drag.current;if(d&&d.id===e.pointerId)onPosition(clamp(d.p+(d.y-e.clientY)/(e.shiftKey?span*3:span)));}}
  onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
  onDoubleClick={onReset}
  onWheel={e=>onPosition(clamp(position+(e.deltaY<0?1:-1)*step))}
  onKeyDown={e=>{const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();onPosition(clamp(position+d*step));}}}>
  <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" className="skirt"/><g transform={`rotate(${-135+270*clamp(position)} 24 24)`}><circle cx="24" cy="24" r="15" className="cap"/><line x1="24" y1="6.5" x2="24" y2="16" className="pointer"/></g></svg>
 </div>;
}

/** The list of every shape, each with its curve, then the saved ones, opened over the shape display; it sits by the display it belongs to, clear of the box's own scrolling. */
function ShapeList({anchor,side,index,custom,library,onPick,onLoad,onDelete,onClose}){
 const box=useRef(null),[at,setAt]=useState(null);
 useLayoutEffect(()=>{
  const r=anchor.getBoundingClientRect(),w=Math.min(272,window.innerWidth-16),h=box.current?.offsetHeight??240;
  const below=r.bottom+4+h<=window.innerHeight-8,top=below?r.bottom+4:Math.max(8,r.top-4-h);
  setAt({left:clampTo(r.left,8,window.innerWidth-w-8),top,width:w});
 },[anchor,library.length]);
 useEffect(()=>{
  const away=e=>{if(!box.current?.contains(e.target)&&!anchor.contains(e.target))onClose();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();anchor.focus();}};
  document.addEventListener('pointerdown',away,true);window.addEventListener('keydown',key);
  box.current?.querySelector('[aria-selected=true]')?.focus();
  return ()=>{document.removeEventListener('pointerdown',away,true);window.removeEventListener('keydown',key);};
 },[anchor,onClose]);
 const move=(e,i)=>{
  const step={ArrowRight:1,ArrowDown:3,ArrowLeft:-1,ArrowUp:-3}[e.key];if(!step)return;
  const options=box.current?.querySelectorAll('[role=option]');if(!options)return;
  e.preventDefault();options[clampTo(i+step,0,options.length-1)]?.focus();
 };
 return createPortal(<div className="zp-list" ref={box} role="listbox" aria-label="Shapes" data-side={side} style={at?{left:at.left,top:at.top,width:at.width}:{visibility:'hidden',left:0,top:0}}>
  {ZPLANE_SHAPE_NAMES.map((name,i)=><button type="button" role="option" key={name} aria-selected={i===index} className={i===index?'on':''} onClick={()=>{onPick(i);onClose();}} onKeyDown={e=>move(e,i)}>
   <svg viewBox="0 0 64 26" aria-hidden="true"><path d="M0 13H64" className="zero"/><path d={thumb(i,custom)} className="curve"/></svg><span>{name}</span>
  </button>)}
  {library.length>0&&<h4>Saved</h4>}
  {library.map((entry,k)=><div className="zp-saved" key={entry.name}>
   <button type="button" role="option" aria-selected={false} onClick={()=>{onLoad(entry);onClose();}} onKeyDown={e=>move(e,ZPLANE_SHAPE_NAMES.length+k)}>
    <svg viewBox="0 0 64 26" aria-hidden="true"><path d="M0 13H64" className="zero"/><path d={thumb(ZPLANE_CUSTOM,entry.nodes.rows)} className="curve"/></svg><span>{entry.name}</span>
   </button>
   <button type="button" className="zp-del" aria-label={'Delete the saved shape '+entry.name} title="Delete this saved shape" onClick={()=>onDelete(entry)}>×</button>
  </div>)}
 </div>,document.body);
}

const FloppyIcon=()=><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 3h11l3 3v11H3z"/><path d="M6 3v4.5h6V3M6 17v-5h8v5"/></svg>;

/** One side's row: the shape (knob, display that opens the list, save icon), its number of nodes (knob, display), and the button that picks it for editing. */
function ShapeRow({side,index,count,custom,editing,library,onEdit,onIndex,onCount,onSave,onLoad,onDelete,onReset}){
 const [open,setOpen]=useState(false),lcd=useRef(null),name=ZPLANE_SHAPE_NAMES[index],label='Shape '+side.toUpperCase();
 return <div className={'zp-row '+side+(editing?' is-editing':'')}>
  <ZKnob label={label} display={name} position={index/LAST} step={1/LAST} span={LAST*10} onPosition={p=>onIndex(Math.round(p*LAST))} onReset={onReset}/>
  <button type="button" className="zp-lcd" ref={lcd} aria-haspopup="listbox" aria-expanded={open} aria-label={label+': '+name+', choose a shape'} onClick={()=>setOpen(o=>!o)}><small>{label}</small><b>{name}</b><i/></button>
  <button type="button" className="zp-icon" aria-label={'Save '+label+' to your shapes'} title="Save this shape to your list" onClick={onSave}><FloppyIcon/></button>
  <ZKnob label={label+' nodes'} display={String(count)} position={(count-1)/(ZPLANE_MAX_NODES-1)} step={1/(ZPLANE_MAX_NODES-1)} span={(ZPLANE_MAX_NODES-1)*10} onPosition={p=>onCount(1+Math.round(p*(ZPLANE_MAX_NODES-1)))} onReset={()=>onCount(6)}/>
  <div className="zp-count" role="status" aria-label={label+' nodes'}><small>Nodes</small><b>{count}</b></div>
  <button type="button" className="zp-edit" aria-pressed={editing} title={`Edit ${label} with the handles on the display`} onClick={onEdit}>Edit</button>
  {open&&<ShapeList anchor={lcd.current} side={side} index={index} custom={custom} library={library} onPick={onIndex} onLoad={onLoad} onDelete={onDelete} onClose={()=>setOpen(false)}/>}
 </div>;
}

export default function ZPlaneScope({values,onChange,faders}){
 const v=k=>values['zplane.'+k],get=k=>v(k),a=Math.round(v('a')),b=Math.round(v('b')),morph=v('morph'),shift=v('shift'),q=v('q');
 const idx={a,b};
 const set=(key,value)=>{const spec=RACK_PARAMS.BY_KEY['zplane.'+key];onChange({['zplane.'+key]:Math.max(spec.min,Math.min(spec.max,value))});};
 const reset=key=>set(key,RACK_PARAMS.BY_KEY['zplane.'+key].default);
 const nodes={a:nodesOf(a,'a',get),b:nodesOf(b,'b',get)};
 const custom={a:nodesOf(ZPLANE_CUSTOM,'a',get).rows,b:nodesOf(ZPLANE_CUSTOM,'b',get).rows};
 const sections=zplaneSections(a,b,morph,shift,q,undefined,custom);
 const ghost=side=>zplaneSections(idx[side],idx[side],0,shift,q,undefined,{a:custom[side],b:custom[side]});
 const curve=zplaneResponse(sections,FREQS),ghostA=zplaneResponse(ghost('a'),FREQS),ghostB=zplaneResponse(ghost('b'),FREQS);
 const R=48,CX=62,CY=H-16,at=(r,f)=>{const t=Math.PI*X(f)/W,d=Math.max(.04,1-(1-r)*MAGNIFY);return [CX+d*R*Math.cos(t),CY-d*R*Math.sin(t)];};
 const active=sections.filter(s=>Math.abs(s.boost)>=1);

 // ---- editing ----
 // each side's Edit button is its own switch: the nodes of the sides that are switched on show on the display, and none need be
 const [editing,setEditing]=useState({a:true,b:false}),[hot,setHot]=useState(null),[library,setLibrary]=useState(readLibrary);
 const turnOn=side=>setEditing(e=>e[side]?e:{...e,[side]:true});
 const display=useRef(null),drag=useRef(null),tap=useRef({t:0,x:0,y:0,at:null});
 // two quick presses in one place are a double tap (counted here, not from the double-click event: touch has none worth the name)
 const doubled=(e,at,radius)=>{
  const now=performance.now(),last=tap.current,yes=last.at===at&&now-last.t<350&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<radius;
  tap.current=yes?{t:0,x:0,y:0,at:null}:{t:now,x:e.clientX,y:e.clientY,at};
  return yes;
 };
 const octave=2**shift,shown=SIDES.filter(side=>editing[side]);
 // writes a side's nodes into its custom parameters (only what changed, or all of it when the side was not custom yet) and makes the side custom
 const commit=(side,rows,count)=>{
  const was=idx[side]===ZPLANE_CUSTOM,change={};
  rows.forEach((row,i)=>ZPLANE_PARTS.forEach((part,k)=>{
   const key=customKey(side,i,part),spec=RACK_PARAMS.BY_KEY['zplane.'+key],value=clampTo(row[k],spec.min,spec.max);
   if(!was||Math.abs(value-v(key))>1e-6)change['zplane.'+key]=value;
  }));
  if(!was||v(countKey(side))!==count)change['zplane.'+countKey(side)]=count;
  if(!was)change['zplane.'+side]=ZPLANE_CUSTOM;
  if(Object.keys(change).length)onChange(change);
 };
 const commitNodes=(side,n)=>{if(n)commit(side,n.rows,n.count);};
 // choosing Custom for a side that has never been edited starts from the shape it was on, so there is something to bend
 const pick=(side,i)=>{
  if(i===ZPLANE_CUSTOM&&idx[side]!==ZPLANE_CUSTOM&&custom[side].every(r=>Math.abs(r[2])<.01))commitNodes(side,nodes[side]);
  else set(side,i);
  if(i===ZPLANE_CUSTOM)turnOn(side);
 };
 const geometry=()=>{const r=display.current.getBoundingClientRect();return {r,dbPerPx:DB/(H/2-6)*H/r.height,logPerPx:Math.log(HI/LO)/r.width};};
 const remove=(side,i)=>{commitNodes(side,dropNode(nodes[side].rows,nodes[side].count,i));setHot(null);};
 const down=(e,side,i)=>{
  if(e.button>0)return;
  e.stopPropagation();
  if(doubled(e,side+i,7)){e.preventDefault();remove(side,i);return;}
  e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);
  drag.current={id:e.pointerId,i,x:e.clientX,y:e.clientY,base:nodes[side].rows.map(r=>[...r]),count:nodes[side].count,side};setHot({side,i});
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const {dbPerPx,logPerPx}=geometry(),slow=e.shiftKey?.25:1,next=d.base.map(r=>[...r]);
  next[d.i]=[d.base[d.i][0]*Math.exp((e.clientX-d.x)*logPerPx*slow),d.base[d.i][1],d.base[d.i][2]-(e.clientY-d.y)*dbPerPx*slow];
  d.moved=d.moved||Math.hypot(e.clientX-d.x,e.clientY-d.y)>4;
  commit(d.side,next,d.count);
 };
 const up=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  drag.current=null;
  if(d.moved)tap.current={t:0,x:0,y:0,at:null};
  // the nodes go back in order of frequency, so that a morph pairs them sensibly
  const now=nodesOf(ZPLANE_CUSTOM,d.side,get),sorted=padNodes(now.rows.slice(0,now.count));
  if(sorted.rows.some((r,i)=>Math.abs(r[0]-now.rows[i][0])>1e-6))commitNodes(d.side,sorted);
 };
 const widen=(side,i,factor)=>commit(side,nodes[side].rows.map((r,k)=>k===i?[r[0],clampTo(r[1]*factor,8,8000),r[2]]:[...r]),nodes[side].count);
 // a node goes onto the shape being edited; with both being edited, onto the one whose curve is nearer the press
 const add=e=>{
  if(!shown.length)return;
  const {r}=geometry(),fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;
  const freq=clampTo(LO*(HI/LO)**fx/octave,40,12000),boost=clampTo((H/2-fy*H)/(H/2-6)*DB,-DB,DB);
  const near=side=>Math.abs(zplaneResponse(ghost(side),[freq*octave])[0]-boost);
  const side=shown.reduce((best,s)=>near(s)<near(best)?s:best);
  commitNodes(side,insertNode(nodes[side].rows,nodes[side].count,[freq,clampTo(freq*.3,40,2500),boost]));
 };
 const background=e=>{if(e.button>0||e.target.closest('[data-handle]'))return;if(doubled(e,'background',9))add(e);};
 const keys=(e,side,i)=>{
  const rows=nodes[side].rows,count=nodes[side].count,r=rows[i],step=e.shiftKey?.25:1;
  const to=row=>{e.preventDefault();commit(side,rows.map((x,k)=>k===i?row:[...x]),count);};
  if(e.key==='ArrowLeft')to([r[0]*2**(-step/12),r[1],r[2]]);else if(e.key==='ArrowRight')to([r[0]*2**(step/12),r[1],r[2]]);
  else if(e.key==='ArrowUp')to([r[0],r[1],r[2]+step]);else if(e.key==='ArrowDown')to([r[0],r[1],r[2]-step]);
  else if(e.key==='+'||e.key==='=')to([r[0],clampTo(r[1]*1.12,8,8000),r[2]]);else if(e.key==='-')to([r[0],clampTo(r[1]/1.12,8,8000),r[2]]);
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(side,i);}
 };
 // the wheel over a node changes its width (a native listener, so the page does not scroll with it)
 const wheelRef=useRef(null);wheelRef.current=widen;
 useEffect(()=>{
  const el=display.current;if(!el)return undefined;
  const wheel=e=>{const h=e.target.closest?.('[data-handle]');if(!h)return;e.preventDefault();wheelRef.current(h.dataset.side,Number(h.dataset.handle),e.deltaY<0?1.12:1/1.12);};
  el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);
 },[]);

 // ---- the saved shapes ----
 const store=next=>{setLibrary(next);save(LIBRARY_KEY,next.map(e=>({name:e.name,nodes:e.nodes.rows.slice(0,e.nodes.count)})));};
 const saveShape=side=>{
  const text=window.prompt('Name this shape',idx[side]===ZPLANE_CUSTOM?'My shape':ZPLANE_SHAPE_NAMES[idx[side]]+' edit')?.trim();
  if(text)store([...library.filter(x=>x.name!==text),{name:text,nodes:padNodes(nodes[side].rows.slice(0,nodes[side].count))}].slice(-LIBRARY_MAX));
 };
 const loadShape=(side,entry)=>{commitNodes(side,entry.nodes);turnOn(side);};
 const deleteShape=entry=>{if(window.confirm(`Delete the saved shape “${entry.name}”?`))store(library.filter(x=>x.name!==entry.name));};
 const handles=shown.flatMap(side=>{
  const {rows,count}=nodes[side],db=zplaneResponse(ghost(side),rows.slice(0,count).map(r=>r[0]*octave));
  return rows.slice(0,count).map((r,i)=>({side,r,i,db:db[i]}));
 });
 const readout=hot&&nodes[hot.side]&&hot.i<nodes[hot.side].count?nodes[hot.side].rows[hot.i]:null;
 // the morphed curve goes from shape A's colour to shape B's as the morph does
 const blend={'--zp-m':`color-mix(in oklab, var(--zp-a) ${Math.round((1-morph)*100)}%, var(--zp-b) ${Math.round(morph*100)}%)`};
 return <div className="rack-scope" style={blend}>
  <div className="zp-main">
  <div className="rack-scope-display" ref={display} onPointerDown={background} title="Drag a node: across for frequency, up and down for boost. Wheel over it for width. Double-tap a node to remove it, double-tap the display to add one. The Edit buttons below choose whose nodes show." role="group" aria-label={`Z-plane filter: ${ZPLANE_SHAPE_NAMES[a]} to ${ZPLANE_SHAPE_NAMES[b]}, ${Math.round(morph*100)}% morphed.`}>
   <svg className="rack-scope-response" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
    {[-12,0,12].map(d=><line key={d} x1="0" x2={W} y1={Y(d)} y2={Y(d)} className={d?'grid':'grid zero'}/>)}
    {TICKS.map(t=><g key={t}><line x1={X(t)} x2={X(t)} y1="0" y2={H} className="grid"/></g>)}
    <path d={path(ghostA)} className={'ghost'+(editing.a?' editing':'')}/><path d={path(ghostB)} className={'ghost b'+(editing.b?' editing':'')}/>
    <path d={path(curve)+`L${W} ${H}L0 ${H}Z`} className="fill"/><path d={path(curve)} className="line"/>
   </svg>
   <span className="rack-scope-ticks" aria-hidden="true">{TICKS.map(t=><i key={t} style={{left:X(t)/W*100+'%'}}>{t>=1000?t/1000+'k':t}</i>)}</span>
   {handles.map(({side,r,i,db})=>{
    const left=X(Math.min(HI,r[0]*octave))/W*100,top=Y(db)/H*100,on=hot?.side===side&&hot.i===i;
    return <div key={side+i} data-side={side} data-handle={i} className={'zp-handle '+side+(on?' is-hot':'')} style={{left:left+'%',top:top+'%'}} tabIndex={0} role="slider" aria-label={`Shape ${side.toUpperCase()} node ${i+1}`} aria-valuenow={Math.round(r[2]*10)/10} aria-valuetext={`${Math.round(r[0])} hertz, ${r[2].toFixed(1)} decibels, width ${Math.round(r[1])} hertz`}
     onPointerDown={e=>down(e,side,i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerEnter={()=>setHot(h=>drag.current?h:{side,i})} onPointerLeave={()=>{if(!drag.current)setHot(null);}} onFocus={()=>setHot({side,i})} onBlur={()=>setHot(null)}
     onKeyDown={e=>keys(e,side,i)}/>;
   })}
   {readout&&<span className="rack-scope-read" aria-hidden="true">{Math.round(readout[0])} Hz · {readout[2]>0?'+':''}{readout[2].toFixed(1)} dB · width {Math.round(readout[1])}</span>}
  </div>
  <svg className="rack-scope-plane" viewBox={`0 0 ${CX*2} ${H}`} role="img" aria-label="Poles and zeros on the z-plane, zoomed near the unit circle">
   <path d={`M${CX-R} ${CY}A${R} ${R} 0 0 1 ${CX+R} ${CY}`} className="circle"/><path d={`M${CX-R-6} ${CY}H${CX+R+6}`} className="grid"/>
   {active.map((s,i)=>{
    const [px,py]=at(s.pole,s.freq),[zx,zy]=at(s.zero,s.freq);
    return <g key={i}><path d={`M${px-2.5} ${py-2.5}l5 5m0-5l-5 5`} className="pole"/><circle cx={zx} cy={zy} r="2.6" className="zero"/></g>;
   })}
   <text x={CX+R-12} y={CY+11}>DC</text><text x={CX-R-4} y={CY+11}>12k</text>
  </svg>
  <div className="zp-rows">
   {SIDES.map(side=><ShapeRow key={side} side={side} index={idx[side]} count={nodes[side].count} custom={custom[side]} editing={editing[side]} library={library}
    onEdit={()=>setEditing(e=>({...e,[side]:!e[side]}))} onIndex={i=>pick(side,i)} onReset={()=>reset(side)} onSave={()=>saveShape(side)} onLoad={entry=>loadShape(side,entry)} onDelete={deleteShape}
    onCount={n=>{commitNodes(side,resizeNodes(nodes[side].rows,nodes[side].count,n));turnOn(side);}}/>)}
  </div>
  </div>
  <div className="rack-controls zp-faders">{faders}</div>
 </div>;
}
