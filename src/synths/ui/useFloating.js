import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {load,save} from '../storage';
import {useDesk,RESET_EVENT} from './Desk';
import {useDeskObjects,useObjectAdapter} from './WorkbenchObjects';

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
const normalize=a=>((a+180)%360+360)%360-180;
export const snapAngle=a=>{const n=normalize(a);return Math.abs(n)<=3?0:n;};
const editable='button,select,input,textarea,label,a,[role=button],[role=spinbutton],[role=slider],[role=radio],[role=switch]';
const bearing=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
// `home` is where a panel with no remembered place starts: a point, or a function of the instrument's size ({w,h}) once the desk has measured it
export default function useFloating(key,home=null,{anchor=null,spawnOnly:spawnOption=false,rotatable:rotateOption=false}={}){
 const ref=useRef(null),drag=useRef(null),desk=useDesk();
 const objects=useDeskObjects(),object=objects?.get(key),rotatable=rotateOption||!!object,spawnOnly=spawnOption||!!object;
 const current=useRef({home,desk});current.current={home,desk};
 const [pos,setPos]=useState(()=>{const p=object?object.pose:load(key,null);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y}:typeof home==='function'?null:home;});
 const [z,setZ]=useState(()=>object?.z??++top);
 const [angle,setAngle]=useState(()=>{const a=object?object.pose?.angle??0:load(key+':angle',0);return rotatable&&Number.isFinite(a)?snapAngle(a):0;});
 const touches=useRef(new Map()),spawned=useRef(false),pose=useRef({pos,angle});pose.current={pos,angle};
 const rotate=(value,persist=true)=>{const a=snapAngle(value);pose.current.angle=a;setAngle(a);if(persist&&!object)save(key+':angle',a);};
 const position=p=>{pose.current.pos=p;setPos(p);};
 const persist=()=>{if(object)return;if(pose.current.pos)save(key,pose.current.pos);if(rotatable)save(key+':angle',pose.current.angle);};
 const placeHome=(h)=>{if(spawnOnly&&h){spawned.current=true;if(!object)save(key,h);}return h;};
 // no remembered place and a default that depends on the instrument's size: put it there as soon as the desk knows that, and keep it there as the instrument
 // settles into its final size (a panel nobody has moved follows its default; one that has been moved stays where it was put)
 const auto=useRef(false);
 useObjectAdapter(key,ref,o=>{
  drag.current=null;touches.current.clear();
  const next=o.pose??(typeof current.current.home==='function'?null:current.current.home);
  auto.current=!next;spawned.current=!!next;pose.current={pos:next,angle:o.pose?.angle??0};
  setPos(next);setAngle(o.pose?.angle??0);setZ(o.z);
 });
 useLayoutEffect(()=>{
  if(object&&pos)objects.update(key,{pose:{x:pos.x,y:pos.y,angle},z});
 },[objects,key,pos,angle,z]);// eslint-disable-line react-hooks/exhaustive-deps
 // Utility windows without a home use their existing CSS position once.
 useLayoutEffect(()=>{if(object&&!pos&&home===null&&ref.current)setPos({x:ref.current.offsetLeft,y:ref.current.offsetTop});},[object?.id,pos,home]);
 useLayoutEffect(()=>{
  if(typeof home!=='function'||!desk.ready||(pos&&!auto.current)||(spawnOnly&&spawned.current))return;
  const h=home(desk.home,ref.current,desk);
  if(h&&(!pos||h.x!==pos.x||h.y!==pos.y)){auto.current=true;setPos(placeHome(h));}
 },[pos,desk.ready,desk.home.w,desk.home.h]);// eslint-disable-line react-hooks/exhaustive-deps
 useLayoutEffect(()=>{
  if(!anchor)return undefined;
  const el=ref.current,root=current.current.desk.el;
  const targets=anchor.map(selector=>root?.querySelector(selector)).filter(Boolean);
  const update=()=>{
   const {home:place,desk:d}=current.current;
   if(typeof place!=='function'||!d.ready||(spawnOnly&&spawned.current))return;
   setPos(p=>{
    if(p&&!auto.current)return p;
    const h=place(d.home,el,d);
    if(!h||p&&same(p,h))return p;
    auto.current=true;return placeHome(h);
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
  const reset=()=>{drag.current=null;touches.current.clear();spawned.current=false;setAngle(0);save(key+':angle',0);const {home:place,desk:d}=current.current;const h=typeof place==='function'?(d.ready?place(d.home,ref.current,d):null):place;auto.current=typeof place==='function';setPos(placeHome(h)??null);if(h)d.report(key,{x:h.x,y:h.y,w:ref.current?.offsetWidth??0,h:ref.current?.offsetHeight??0});else d.report(key,null);};
  window.addEventListener(RESET_EVENT,reset);return ()=>window.removeEventListener(RESET_EVENT,reset);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const raise=()=>object?setZ(objects.raise(key)):setZ(z0=>z0===top?z0:++top);
 const startPos=()=>pose.current.pos??{x:ref.current.offsetLeft,y:ref.current.offsetTop};
 const center=()=>{const r=ref.current.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 const startTouch=()=>{
  const points=[...touches.current.values()];
  if(points.length===2){const [a,b]=points;drag.current={mode:'twist',start:startPos(),angle:pose.current.angle,center:center(),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},bearing:bearing(a,b),delta:0};}
  else if(points.length===1){const a=points[0];drag.current={mode:'move',start:startPos(),x:a.x,y:a.y,id:a.id};}
 };
 const down=(e,turn=false)=>{
  if(!turn&&e.target.closest(editable))return;
  if(e.pointerType==='touch'){
   if(touches.current.size>=2)return;
   touches.current.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY});
   if(rotatable)startTouch();else drag.current={mode:'move',start:startPos(),x:e.clientX,y:e.clientY,id:e.pointerId};
  }else if(rotatable&&(turn||e.button===2)){
   const c=center();drag.current={mode:'rotate',id:e.pointerId,center:c,bearing:bearing(c,{x:e.clientX,y:e.clientY}),angle:pose.current.angle,delta:0};
  }else if(e.button===0)drag.current={mode:'move',start:startPos(),x:e.clientX,y:e.clientY,id:e.pointerId};
  else return;
  auto.current=false;e.stopPropagation?.();e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();
 };
 const move=e=>{
  const d=drag.current;if(!d)return;
  if(touches.current.has(e.pointerId))touches.current.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY});
  if(d.mode==='twist'){
   const [a,b]=[...touches.current.values()];if(!a||!b)return;
   const next=bearing(a,b);d.delta+=normalize(next-d.bearing);d.bearing=next;
   const rad=normalize(snapAngle(d.angle+d.delta)-d.angle)*Math.PI/180,dx=d.center.x-d.mid.x,dy=d.center.y-d.mid.y;
   const x=(a.x+b.x)/2+dx*Math.cos(rad)-dy*Math.sin(rad),y=(a.y+b.y)/2+dx*Math.sin(rad)+dy*Math.cos(rad);
   position(clampPos({x:d.start.x+(x-d.center.x)/desk.zoom,y:d.start.y+(y-d.center.y)/desk.zoom},ref.current,desk));rotate(d.angle+d.delta,false);
  }else if(d.id===e.pointerId&&d.mode==='rotate'){
   const next=bearing(d.center,{x:e.clientX,y:e.clientY});d.delta+=normalize(next-d.bearing);d.bearing=next;rotate(d.angle+d.delta,false);
  }else if(d.id===e.pointerId){
   position(clampPos({x:d.start.x+(e.clientX-d.x)/desk.zoom,y:d.start.y+(e.clientY-d.y)/desk.zoom},ref.current,desk));
  }
 };
 const up=e=>{
  if(!touches.current.has(e.pointerId)&&drag.current?.id!==e.pointerId)return;
  touches.current.delete(e.pointerId);persist();drag.current=null;
  if(touches.current.size)startTouch();
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const context=e=>{if(rotatable&&!e.target.closest(editable))e.preventDefault();};
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
  const rad=angle*Math.PI/180,w=el.offsetWidth,h=el.offsetHeight,rw=Math.abs(w*Math.cos(rad))+Math.abs(h*Math.sin(rad)),rh=Math.abs(h*Math.cos(rad))+Math.abs(w*Math.sin(rad));
  const x=pos.x+(w-rw)/2,y=pos.y+(h-rh)/2;
  desk.report(key,{x,y,w:rw,h:rh});if(rotatable)desk.grow(x+rw,y+rh,x,y);
  return undefined;
 },[pos,angle]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>desk.report(key,null),[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!object)raise();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 return {ref,raise,style:{zIndex:z,...(rotatable?{transform:`rotate(${angle}deg)`,transformOrigin:'center'}:{}),...(pos?{left:pos.x,top:pos.y,right:'auto'}:{})},handle:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onLostPointerCapture:up,onContextMenu:context,style:{touchAction:'none'},tabIndex:rotatable?0:undefined,'aria-label':rotatable?`Object grip, ${Math.round(angle)} degrees`:undefined,title:rotatable?'Drag to move · right-drag or two-finger twist to rotate · snaps straight within 3°': 'Drag to move',onKeyDown:rotatable?e=>{if(e.target!==e.currentTarget)return;const d={ArrowLeft:-5,ArrowDown:-5,ArrowRight:5,ArrowUp:5}[e.key];if(d||e.key==='Home'){e.preventDefault();e.stopPropagation();rotate(e.key==='Home'?0:angle+d);}}:undefined},rotation:rotatable?{angle,reset:()=>rotate(0)}:null};
}
