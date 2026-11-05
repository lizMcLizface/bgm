import {useRef,useState,useEffect,useLayoutEffect} from 'react';
import {load,save} from '../storage';
import {useDesk,RESET_EVENT} from './Desk';

// A block that keeps its place in the page but can be moved away from it by a grip: it is shifted by an offset (relative
// positioning, never a transform: a transform would make the block the container of the floating panels inside it, such as the effects), kept inside the window, remembered under `key`, and brought in front of its neighbours while it is held or has
// just been moved. Double-click the grip to put it back. Spread `handle` on the grip, `ref` and `style` on the block.
let front=10;
// `defaults` is where a block with no remembered place starts, as an offset from its natural place: an offset, or a function of the instrument's size ({w,h})
export default function useDraggable(key,defaults=null){
 const ref=useRef(null),drag=useRef(null),desk=useDesk();
 const [offset,setOffset]=useState(()=>{const p=load(key,null);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:{x:0,y:0};});
 const [z,setZ]=useState(0),remembered=useRef(!!load(key,null)),applied=useRef(false);
 // the default offset is applied once, when the desk knows the instrument's size, unless a place was remembered
 useEffect(()=>{
  if(!defaults||remembered.current)return undefined;
  return desk.subscribe(()=>{
   if(applied.current)return;applied.current=true;
   const d=typeof defaults==='function'?defaults(desk.home):defaults;
   if(d&&(d.x||d.y)){setOffset(d);setZ(z0=>z0||++front);}
  });
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 // the layout was reset: back to the default place
 useEffect(()=>{
  const reset=()=>{remembered.current=false;const d=typeof defaults==='function'?defaults(desk.home):defaults;setOffset(d&&(d.x||d.y)?d:{x:0,y:0});};
  window.addEventListener(RESET_EVENT,reset);return ()=>window.removeEventListener(RESET_EVENT,reset);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const clamp=(o,base)=>{
  const w=ref.current?.offsetWidth??0,h=ref.current?.offsetHeight??0;
  // `base` is where the block sits with no offset, from the instrument's corner; the desk reaches this far left and up, and is grown to the right and down
  const l=desk.limits(w,h);
  const minX=l.minX-base.left,maxX=Math.max(minX,l.maxX-base.left);
  const minY=l.minY-base.top,maxY=Math.max(minY,l.maxY-base.top);
  return {x:Math.min(Math.max(o.x,minX),maxX),y:Math.min(Math.max(o.y,minY),maxY)};
 };
 // where the block would sit with no offset
 const home=()=>{const r=ref.current.getBoundingClientRect(),o=desk.origin(),z=desk.zoom;return {left:(r.left-o.left)/z-offset.x,top:(r.top-o.top)/z-offset.y};};
 const down=e=>{
  if(e.button!==0)return;
  drag.current={x:e.clientX,y:e.clientY,start:offset,base:home(),id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();setZ(++front);
 };
 const move=e=>{const d=drag.current;if(d?.id===e.pointerId){const z=desk.zoom,o=clamp({x:d.start.x+(e.clientX-d.x)/z,y:d.start.y+(e.clientY-d.y)/z},d.base);setOffset(o);desk.report(key,{x:d.base.left+o.x,y:d.base.top+o.y,w:ref.current?.offsetWidth??0,h:ref.current?.offsetHeight??0});desk.grow(d.base.left+o.x+(ref.current?.offsetWidth??0),d.base.top+o.y+(ref.current?.offsetHeight??0),d.base.left+o.x,d.base.top+o.y);}};
 const up=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setOffset(o=>{save(key,o);return o;});};
 const reset=()=>{setOffset({x:0,y:0});save(key,{x:0,y:0});};
 // a remembered place that is off screen in a smaller window comes back into view
 useLayoutEffect(()=>{
  const fit=()=>{if(!ref.current)return;setOffset(o=>{if(!o.x&&!o.y)return o;const c=clamp(o,home());return c.x===o.x&&c.y===o.y?o:c;});};
  fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(offset.x||offset.y)setZ(z0=>z0||++front);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const moved=!!(offset.x||offset.y);
 // where it is, for the desk to know what is on it
 useEffect(()=>{
  const el=ref.current;if(!el)return;
  if(!moved){desk.report(key,null);return;}
  const b=home();desk.report(key,{x:b.left+offset.x,y:b.top+offset.y,w:el.offsetWidth,h:el.offsetHeight});
 },[offset.x,offset.y]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>desk.report(key,null),[]);// eslint-disable-line react-hooks/exhaustive-deps
 return {ref,moved,style:{...(moved||z?{position:'relative',zIndex:z||undefined}:{}),...(moved?{left:offset.x,top:offset.y}:{})},
  handle:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onDoubleClick:reset,title:'Drag to move · double-click to put back'}};
}
