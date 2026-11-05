import React,{createContext,useCallback,useContext,useLayoutEffect,useRef,useState} from 'react';
import {load,save} from '../storage';

// A free-form workspace for a synth's sections. Each section is a FloatBox: first the boxes flow into rows so the page opens
// tidy, then each is pinned where it landed and can be dragged by its title anywhere inside the workspace. Places are
// remembered per synth. "Reset layout" lays them out again.
const Ctx=createContext(null);
let front=10;

export function Workspace({storeKey,arrange,children}){
 const ref=useRef(null);
 const [homes,setHomes]=useState(null),[epoch,setEpoch]=useState(0),[height,setHeight]=useState(0);
 const measure=useCallback(()=>{
  const el=ref.current;if(!el)return;
  let bottom=0;for(const n of el.querySelectorAll('[data-box]'))bottom=Math.max(bottom,n.offsetTop+n.offsetHeight);
  setHeight(h=>h===bottom?h:bottom);
 },[]);
 useLayoutEffect(()=>{
  if(homes)return;
  const el=ref.current,r=el.getBoundingClientRect(),next={},sizes={};
  for(const n of el.querySelectorAll('[data-box]')){const b=n.getBoundingClientRect();next[n.dataset.box]={x:Math.round(b.left-r.left),y:Math.round(b.top-r.top)};sizes[n.dataset.box]={w:b.width,h:b.height};}
  // the page's own arrangement, if it has one; otherwise the boxes stay where they flowed
  setHomes(arrange?{...next,...arrange(sizes,r.width)}:next);
 },[homes,epoch]);
 useLayoutEffect(()=>{if(homes)measure();});
 const reset=()=>{
  for(const n of ref.current.querySelectorAll('[data-box]'))save(storeKey+n.dataset.box,null);
  setHomes(null);setEpoch(e=>e+1);
 };
 return <Ctx.Provider value={{homes,storeKey,measure,epoch}}>
  <div className="ws-bar"><span>Drag any box by its title to arrange the panel</span><button type="button" onClick={reset}>Reset layout</button></div>
  <div ref={ref} className={'workspace'+(homes?' pinned':' flow')} style={homes?{minHeight:height+16}:undefined}><React.Fragment key={epoch}>{children}</React.Fragment></div>
 </Ctx.Provider>;
}

const spot=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?v:null;

// Outside a Workspace a FloatBox is simply a box in the page, which is how a fixed layout uses it.
export function FloatBox(props){
 return useContext(Ctx)?<Floating {...props}/>:<section className={'group diy-box static '+(props.className??'')} data-box={props.id}><h3 className="box-handle">{props.title}{props.actions}</h3><div className="group-controls">{props.children}</div></section>;
}

function Floating({id,title,tone,children,actions,className=''}){
 const ctx=useContext(Ctx),ref=useRef(null),drag=useRef(null);
 const key=ctx.storeKey+id;
 const [pos,setPos]=useState(()=>spot(load(key,null)));
 const [z,setZ]=useState(0);
 const place=pos??ctx.homes?.[id]??(ctx.homes?{x:8,y:8}:null);
 const down=e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const r=ref.current.getBoundingClientRect();
  drag.current={dx:e.clientX-r.left,dy:e.clientY-r.top,id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();setZ(++front);
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const w=ref.current.parentElement.getBoundingClientRect(),el=ref.current;
  setPos({x:Math.round(Math.min(Math.max(0,e.clientX-d.dx-w.left),Math.max(0,w.width-el.offsetWidth))),y:Math.round(Math.max(0,e.clientY-d.dy-w.top))});
 };
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setPos(p=>{if(p)save(key,p);return p;});ctx.measure();};
 // a box that changes size can move the bottom edge of the workspace
 useLayoutEffect(()=>{
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>ctx.measure()):null;ro?.observe(ref.current);return()=>ro?.disconnect();
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 return <section ref={ref} data-box={id} className={'group diy-box '+className} style={place?{position:'absolute',left:place.x,top:place.y,zIndex:z||undefined}:undefined} onPointerDownCapture={()=>setZ(++front)}>
  <h3 className="box-handle" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Drag to move">{title}{actions}</h3>
  <div className="group-controls">{children}</div>
 </section>;
}
