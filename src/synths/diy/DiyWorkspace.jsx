import React,{createContext,useCallback,useContext,useLayoutEffect,useRef,useState} from 'react';
import {load,save} from '../storage';
import {useDesk,RESET_EVENT} from '../ui/Desk';

// A free-form workspace for a synth's sections. Each section is a FloatBox: first the boxes flow into rows so the page opens
// tidy, then each is pinned where it landed and can be dragged by its title anywhere inside the workspace. Places are
// remembered per synth. "Reset layout" lays them out again.
const Ctx=createContext(null);
let front=10;

export function Workspace({storeKey,arrange,fixed=false,children}){
 const ref=useRef(null),desk=useDesk();
 const [homes,setHomes]=useState(null),[epoch,setEpoch]=useState(0),[height,setHeight]=useState(0),[width,setWidth]=useState(0);
 const measure=useCallback(()=>{
  const el=ref.current;if(!el)return;
  let bottom=0,right=0;for(const n of el.querySelectorAll('[data-box]')){bottom=Math.max(bottom,n.offsetTop+n.offsetHeight);right=Math.max(right,n.offsetLeft+n.offsetWidth);}
  setHeight(h=>h===bottom?h:bottom);setWidth(w=>w===right?w:right);
 },[]);
 useLayoutEffect(()=>{
  if(homes)return;
  // measured on screen, in the units of the page: the desk may be zoomed
  const el=ref.current,r=el.getBoundingClientRect(),z=desk.zoom||1,next={},sizes={};
  for(const n of el.querySelectorAll('[data-box]')){const b=n.getBoundingClientRect();next[n.dataset.box]={x:Math.round((b.left-r.left)/z),y:Math.round((b.top-r.top)/z)};sizes[n.dataset.box]={w:b.width/z,h:b.height/z};}
  // the page's own arrangement, if it has one; otherwise the boxes stay where they flowed
  setHomes(arrange?{...next,...arrange(sizes,r.width/z)}:next);
 },[homes,epoch]);
 useLayoutEffect(()=>{if(homes)measure();});
 const reset=()=>{
  for(const n of ref.current.querySelectorAll('[data-box]'))save(storeKey+n.dataset.box,null);
  setHomes(null);setEpoch(e=>e+1);
 };
 // the desk's own Reset layout puts the boxes back too
 const resetRef=useRef(reset);resetRef.current=reset;
 useLayoutEffect(()=>{const on=()=>resetRef.current();window.addEventListener(RESET_EVENT,on);return ()=>window.removeEventListener(RESET_EVENT,on);},[]);
 return <Ctx.Provider value={{homes,storeKey,measure,epoch,fixed}}>
  {!fixed&&<div className="ws-bar"><span>Drag any box by its title to arrange the panel</span><button type="button" onClick={reset}>Reset layout</button></div>}
  <div ref={ref} className={'workspace'+(homes?' pinned':' flow')} style={homes?{minHeight:height+16,width:width||undefined}:undefined}><React.Fragment key={epoch}>{children}</React.Fragment></div>
 </Ctx.Provider>;
}

const spot=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?v:null;

// Outside a Workspace a FloatBox is simply a box in the page, which is how a fixed layout uses it.
export function FloatBox(props){
 return useContext(Ctx)?<Floating {...props}/>:<section className={'group diy-box static '+(props.className??'')} data-box={props.id}><h3 className="box-handle">{props.title}{props.actions}</h3><div className="group-controls">{props.children}</div></section>;
}

function Floating({id,title,tone,children,actions,className=''}){
 const ctx=useContext(Ctx),desk=useDesk(),ref=useRef(null),drag=useRef(null);
 const key=ctx.storeKey+id;
 // a fixed workspace keeps the arrangement it was laid out in: nothing is read from, or moved to, a remembered place
 const [pos,setPos]=useState(()=>ctx.fixed?null:spot(load(key,null)));
 const [z,setZ]=useState(0);
 const home=ctx.homes?.[id],place=pos??home??(ctx.homes?{x:8,y:8}:null);
 const down=e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const r=ref.current.getBoundingClientRect();
  const z=desk.zoom||1;
  drag.current={dx:(e.clientX-r.left)/z,dy:(e.clientY-r.top)/z,id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();setZ(++front);
 };
 const move=e=>{
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const w=ref.current.parentElement.getBoundingClientRect(),el=ref.current,z=desk.zoom||1;
  setPos({x:Math.round(Math.min(Math.max(0,(e.clientX-w.left)/z-d.dx),Math.max(0,w.width/z-el.offsetWidth))),y:Math.round(Math.max(0,(e.clientY-w.top)/z-d.dy))});
 };
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setPos(p=>{if(p)save(key,p);return p;});ctx.measure();};
 // a box that changes size can move the bottom edge of the workspace
 useLayoutEffect(()=>{
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>ctx.measure()):null;ro?.observe(ref.current);return()=>ro?.disconnect();
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 return <section ref={ref} data-box={id} className={'group diy-box'+(ctx.fixed?' is-fixed ':' ')+className} style={place?{position:'absolute',left:place.x,top:place.y,zIndex:z||undefined,...(home?.h?{minHeight:home.h}:{}),...(home?.w?{minWidth:home.w}:{})}:undefined} onPointerDownCapture={()=>setZ(++front)}>
  {ctx.fixed?<h3 className="box-handle">{title}{actions}</h3>:<h3 className="box-handle" data-desk-item="" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Drag to move">{title}{actions}</h3>}
  <div className="group-controls">{children}</div>
 </section>;
}
