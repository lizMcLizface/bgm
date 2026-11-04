import {useRef,useState,useEffect,useLayoutEffect} from 'react';
import {load,save} from '../storage';

// A block that keeps its place in the page but can be moved away from it by a grip: it is shifted by an offset (relative
// positioning, never a transform: a transform would make the block the container of the floating panels inside it, such as the effects), kept inside the window, remembered under `key`, and brought in front of its neighbours while it is held or has
// just been moved. Double-click the grip to put it back. Spread `handle` on the grip, `ref` and `style` on the block.
let front=10;
export default function useDraggable(key){
 const ref=useRef(null),drag=useRef(null);
 const [offset,setOffset]=useState(()=>{const p=load(key,null);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:{x:0,y:0};});
 const [z,setZ]=useState(0);
 const clamp=(o,base)=>{
  const w=ref.current?.offsetWidth??0,h=ref.current?.offsetHeight??0;
  const minX=-base.left,maxX=Math.max(minX,window.innerWidth-base.left-Math.min(w,window.innerWidth));
  const minY=-base.top,maxY=Math.max(minY,window.innerHeight-base.top-Math.min(h,window.innerHeight));
  return {x:Math.min(Math.max(o.x,minX),maxX),y:Math.min(Math.max(o.y,minY),maxY)};
 };
 // where the block would sit with no offset
 const home=()=>{const r=ref.current.getBoundingClientRect();return {left:r.left-offset.x,top:r.top-offset.y};};
 const down=e=>{
  if(e.button!==0)return;
  drag.current={x:e.clientX,y:e.clientY,start:offset,base:home(),id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();setZ(++front);
 };
 const move=e=>{const d=drag.current;if(d?.id===e.pointerId)setOffset(clamp({x:d.start.x+e.clientX-d.x,y:d.start.y+e.clientY-d.y},d.base));};
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setOffset(o=>{save(key,o);return o;});};
 const reset=()=>{setOffset({x:0,y:0});save(key,{x:0,y:0});};
 // a remembered place that is off screen in a smaller window comes back into view
 useLayoutEffect(()=>{
  const fit=()=>{if(!ref.current)return;setOffset(o=>{if(!o.x&&!o.y)return o;const c=clamp(o,home());return c.x===o.x&&c.y===o.y?o:c;});};
  fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(offset.x||offset.y)setZ(z0=>z0||++front);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const moved=!!(offset.x||offset.y);
 return {ref,moved,style:{...(moved||z?{position:'relative',zIndex:z||undefined}:{}),...(moved?{left:offset.x,top:offset.y}:{})},
  handle:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onDoubleClick:reset,title:'Drag to move · double-click to put back'}};
}
