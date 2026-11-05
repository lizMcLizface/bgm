import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {load,save} from '../storage';

// A panel that floats over the page and is dragged by a handle (its header). The place is remembered under `key` and kept
// inside the window (also the first time it appears, if the window is smaller than when it was left, and when the panel
// itself changes size). The panel last opened or touched is in front. Spread `handle` on the draggable header, `ref`/`style`
// on the panel and `raise` as its onPointerDownCapture.
let top=60;
const clampPos=(p,el)=>{
 const w=el?.offsetWidth??600,h=el?.offsetHeight??300;
 return {x:Math.min(Math.max(0,p.x),Math.max(0,window.innerWidth-Math.min(w,window.innerWidth))),y:Math.min(Math.max(0,p.y),Math.max(0,window.innerHeight-Math.min(h,window.innerHeight)))};
};
const same=(a,b)=>a.x===b.x&&a.y===b.y;
export default function useFloating(key,home=null){
 const ref=useRef(null),drag=useRef(null);
 const [pos,setPos]=useState(()=>{const p=load(key,null);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:home;});
 const [z,setZ]=useState(()=>++top);
 const raise=()=>setZ(z0=>z0===top?z0:++top);
 const down=e=>{
  if(e.button!==0||e.target.closest('button,select,input,a,[role=slider]'))return;
  const r=ref.current.getBoundingClientRect();drag.current={dx:e.clientX-r.left,dy:e.clientY-r.top,id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();
 };
 const move=e=>{if(drag.current?.id===e.pointerId)setPos(clampPos({x:e.clientX-drag.current.dx,y:e.clientY-drag.current.dy},ref.current));};
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setPos(p=>{if(p)save(key,p);return p;});};
 // bring a remembered place back into view
 useLayoutEffect(()=>{
  const fit=()=>setPos(p=>{if(!p)return p;const c=clampPos(p,ref.current);return same(p,c)?p:c;});
  fit();
  window.addEventListener('resize',fit);
  const ro=typeof ResizeObserver==='function'&&ref.current?new ResizeObserver(fit):null;ro?.observe(ref.current);
  return ()=>{window.removeEventListener('resize',fit);ro?.disconnect();};
 },[]);
 useEffect(()=>{raise();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 return {ref,raise,style:{zIndex:z,...(pos?{left:pos.x,top:pos.y,right:'auto'}:{})},handle:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,title:'Drag to move'}};
}
