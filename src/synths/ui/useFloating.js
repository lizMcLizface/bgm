import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {load,save} from '../storage';
import {useDesk,RESET_EVENT} from './Desk';

// A panel that floats over the page and is dragged by a handle (its header). The place is remembered under `key` and kept
// inside the window (also the first time it appears, if the window is smaller than when it was left, and when the panel
// itself changes size). The panel last opened or touched is in front. Spread `handle` on the draggable header, `ref`/`style`
// on the panel and `raise` as its onPointerDownCapture.
let top=60;
// positions are in the units of the desk the panel sits on (the window itself when there is no desk), measured from the instrument; the
// desk reaches a fixed distance left and up and is made bigger by a panel pushed past its right or bottom edge
const clampPos=(p,el,desk)=>{
 const w=el?.offsetWidth??600,h=el?.offsetHeight??300,l=desk.limits(w,h);
 return {x:Math.min(Math.max(l.minX,p.x),Math.max(l.minX,l.maxX)),y:Math.min(Math.max(l.minY,p.y),Math.max(l.minY,l.maxY))};
};
const same=(a,b)=>a.x===b.x&&a.y===b.y;
// `home` is where a panel with no remembered place starts: a point, or a function of the instrument's size ({w,h}) once the desk has measured it
export default function useFloating(key,home=null,{anchor=null}={}){
 const ref=useRef(null),drag=useRef(null),desk=useDesk();
 const current=useRef({home,desk});current.current={home,desk};
 const [pos,setPos]=useState(()=>{const p=load(key,null);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:typeof home==='function'?null:home;});
 const [z,setZ]=useState(()=>++top);
 // no remembered place and a default that depends on the instrument's size: put it there as soon as the desk knows that, and keep it there as the instrument
 // settles into its final size (a panel nobody has moved follows its default; one that has been moved stays where it was put)
 const auto=useRef(false);
 useLayoutEffect(()=>{
  if(typeof home!=='function'||!desk.ready||(pos&&!auto.current))return;
  const h=home(desk.home,ref.current,desk);
  if(h&&(!pos||h.x!==pos.x||h.y!==pos.y)){auto.current=true;setPos(h);}
 },[pos,desk.ready,desk.home.w,desk.home.h]);// eslint-disable-line react-hooks/exhaustive-deps
 useLayoutEffect(()=>{
  if(!anchor)return undefined;
  const el=ref.current,root=current.current.desk.el;
  const targets=anchor.map(selector=>root?.querySelector(selector)).filter(Boolean);
  const update=()=>{
   const {home:place,desk:d}=current.current;
   if(typeof place!=='function'||!d.ready)return;
   setPos(p=>{
    if(p&&!auto.current)return p;
    const h=place(d.home,el,d);
    if(!h||p&&same(p,h))return p;
    auto.current=true;return h;
   });
  };
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
  if(el)ro?.observe(el);targets.forEach(target=>ro?.observe(target));
  const mo=typeof MutationObserver==='function'?new MutationObserver(update):null;
  targets.forEach(target=>mo?.observe(target,{attributes:true,attributeFilter:['style']}));
  update();
  return ()=>{ro?.disconnect();mo?.disconnect();};
 },[anchor?.join('|'),desk.el,desk.ready]);// eslint-disable-line react-hooks/exhaustive-deps
 // the layout was reset: back to the default place
 useEffect(()=>{
  const reset=()=>{const {home:place,desk:d}=current.current;const h=typeof place==='function'?(d.ready?place(d.home,ref.current,d):null):place;auto.current=typeof place==='function';setPos(h??null);if(h)d.report(key,{x:h.x,y:h.y,w:ref.current?.offsetWidth??0,h:ref.current?.offsetHeight??0});else d.report(key,null);};
  window.addEventListener(RESET_EVENT,reset);return ()=>window.removeEventListener(RESET_EVENT,reset);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const raise=()=>setZ(z0=>z0===top?z0:++top);
 const down=e=>{
  if(e.button!==0||e.target.closest('button,select,input,a,[role=slider]'))return;
  const r=ref.current.getBoundingClientRect(),z=desk.zoom;drag.current={dx:(e.clientX-r.left)/z,dy:(e.clientY-r.top)/z,id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();
 };
 const move=e=>{if(drag.current?.id===e.pointerId){const o=desk.origin(),z=desk.zoom;{const c=clampPos({x:(e.clientX-o.left)/z-drag.current.dx,y:(e.clientY-o.top)/z-drag.current.dy},ref.current,desk);setPos(c);desk.report(key,{x:c.x,y:c.y,w:ref.current?.offsetWidth??0,h:ref.current?.offsetHeight??0});desk.grow(c.x+(ref.current?.offsetWidth??0),c.y+(ref.current?.offsetHeight??0),c.x,c.y);}}};
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;auto.current=false;setPos(p=>{if(p)save(key,p);return p;});};
 // bring a remembered place back into view
 useLayoutEffect(()=>{
  const fit=()=>setPos(p=>{if(!p)return p;const c=clampPos(p,ref.current,desk);return same(p,c)?p:c;});
  fit();
  window.addEventListener('resize',fit);
  const ro=typeof ResizeObserver==='function'&&ref.current?new ResizeObserver(fit):null;ro?.observe(ref.current);
  return ()=>{window.removeEventListener('resize',fit);ro?.disconnect();};
 },[]);
 // a panel on the desk is its own thing to drag: the desk is not moved by it
 useLayoutEffect(()=>{ref.current?.setAttribute('data-desk-item','');},[]);
 // where it is, for the desk to know what is on it
 useEffect(()=>{
  const el=ref.current;if(!el||!pos)return undefined;
  desk.report(key,{x:pos.x,y:pos.y,w:el.offsetWidth,h:el.offsetHeight});
  return undefined;
 },[pos]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>desk.report(key,null),[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{raise();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 return {ref,raise,style:{zIndex:z,...(pos?{left:pos.x,top:pos.y,right:'auto'}:{})},handle:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,title:'Drag to move'}};
}
