import {useEffect,useRef} from 'react';

// Capture before a slider/grip can swallow the second finger. One finger is
// still owned by the control; two fingers transfer ownership to the camera.
// The keyboard keeps multi-touch notes. Navigation and portalled dialogs are
// outside this gesture. Never resume a control with a leftover finger.
export function bindDeskTouchPan(element,callbacks){
 const pointers=new Map();let pair=null,claimed=false,suppressClick=false,cancelling=false;
 const excluded=target=>target.closest?.('.desk-zoom,.desk-spread,.keybox');
 const stop=e=>{e.preventDefault();e.stopPropagation();};
 const cancelControl=p=>{
  cancelling=true;
  try{
   p.target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:p.id,pointerType:'touch',clientX:p.x,clientY:p.y}));
   for(let el=p.target;el&&el!==element;el=el.parentElement){
    if(el.hasPointerCapture?.(p.id))el.releasePointerCapture(p.id);
   }
  }finally{cancelling=false;}
 };
 const centre=()=>{const a=pointers.get(pair[0]),b=pointers.get(pair[1]);return {clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2,pointerId:'touch-pan'};};
 const down=e=>{
  if(!pointers.size)suppressClick=false;
  if(e.pointerType!=='touch'||!claimed&&excluded(e.target))return;
  const p={id:e.pointerId,x:e.clientX,y:e.clientY,target:e.target};pointers.set(p.id,p);
  if(claimed){stop(e);element.setPointerCapture?.(p.id);return;}
  if(pointers.size!==2)return;
  stop(e);claimed=true;suppressClick=true;pair=[...pointers.keys()];
  // Clear the first control's drag/note and capture, before claiming both IDs.
  for(const pointer of pointers.values()){cancelControl(pointer);element.setPointerCapture?.(pointer.id);}
  callbacks.start(centre());
 };
 const move=e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  p.x=e.clientX;p.y=e.clientY;
  if(!claimed)return;
  stop(e);if(pair&&pointers.has(pair[0])&&pointers.has(pair[1]))callbacks.move(centre());
 };
 const up=e=>{
  if(cancelling||!pointers.has(e.pointerId))return;
  pointers.delete(e.pointerId);
  if(!claimed)return;
  stop(e);
  if(pair?.includes(e.pointerId)){pair=null;callbacks.end();}
  if(!pointers.size)claimed=false;
 };
 const click=e=>{if(suppressClick&&e.detail!==0)stop(e);};
 const reset=()=>{
  if(claimed)callbacks.end();
  for(const p of pointers.values()){
   cancelControl(p);if(element.hasPointerCapture?.(p.id))element.releasePointerCapture(p.id);
  }
  pointers.clear();pair=null;claimed=false;
 };
 const hidden=()=>{if(document.visibilityState==='hidden')reset();};
 const outsideUp=e=>{if(!element.contains(e.target))up(e);};
 const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,click};
 for(const [name,handler]of Object.entries(handlers))element.addEventListener(name,handler,{capture:true,passive:false});
 window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
 window.addEventListener('pointerup',outsideUp,true);window.addEventListener('pointercancel',outsideUp,true);
 return ()=>{reset();for(const [name,handler]of Object.entries(handlers))element.removeEventListener(name,handler,true);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pointerup',outsideUp,true);window.removeEventListener('pointercancel',outsideUp,true);};
}

export default function useDeskTouchPan(ref,enabled,callbacks){
 const latest=useRef(callbacks);latest.current=callbacks;
 useEffect(()=>{
  if(!enabled||!ref.current)return undefined;
  return bindDeskTouchPan(ref.current,{start:e=>latest.current.start(e),move:e=>latest.current.move(e),end:()=>latest.current.end()});
 },[enabled,ref]);
}
