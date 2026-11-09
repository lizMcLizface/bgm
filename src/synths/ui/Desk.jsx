import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {load,save} from '../storage';
import useDeskTouchPan from './useDeskTouchPan';

// The play area. An instrument sits on a desk: a large surface (4K at least, as large as the window when that is bigger) with the
// instrument laid out on it at its own size (at least HOME_W by HOME_H, and as wide and tall as its design needs) and never re-flowed to the window. The panels that float
// (tuning, effects, scope, set-up) are placed on the desk around it, and a panel pushed past the desk's right or bottom edge makes
// the desk bigger. The window is a view onto the desk:
//   a big screen        shows the desk at 1:1, so nothing is zoomed in and nothing of the screen is left unused;
//   a smaller screen    starts on the instrument at 1:1 (or a fit to it, if that does not fit), and the rest of the desk is a pan away;
//   zoom and pan        Ctrl/Cmd + wheel or the + and - buttons zoom about the pointer, dragging empty desk (or the middle button) moves it.
// The desk keeps the size it has grown to; "Fit all" zooms to show everything on it. On a touch screen the page is given the
// instrument's width as its layout viewport, so the browser's own pinch zoom and panning move around it.
export const HOME_W=1500,HOME_H=840;
export const BASE_W=3840,BASE_H=2160;
const MIN_ZOOM=.25,MAX_ZOOM=2.5,GROW_PAD=160,CONTENT_MARGIN=48;
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export const isVisibleDeskItem=el=>{
 for(let node=el;node;node=node.parentElement){
  const style=getComputedStyle(node);
  if(node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility!=='visible')return false;
 }
 return true;
};
export function measureVisibleDesk(home,zoom,includeHome=true){
 const o=home.getBoundingClientRect();let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
 const items=home.querySelectorAll('[data-desk-item],.rig,.keybox,.rackc,.setup-pop,.scope,.help-pop,.lab-window');
 for(const el of includeHome?[home,...items]:items){
  if(!isVisibleDeskItem(el))continue;
  const q=el.getBoundingClientRect();if(!q.width||!q.height)continue;
  l=Math.min(l,(q.left-o.left)/zoom);t=Math.min(t,(q.top-o.top)/zoom);r=Math.max(r,(q.right-o.left)/zoom);b=Math.max(b,(q.bottom-o.top)/zoom);
 }
 return Number.isFinite(l)?{l,t,r,b}:null;
}

const FALLBACK={zoom:1,el:null,limits:(w,h)=>({minX:0,minY:0,maxX:window.innerWidth-Math.min(w,window.innerWidth),maxY:window.innerHeight-Math.min(h,window.innerHeight)}),
 origin:()=>({left:0,top:0}),grow:()=>{},report:()=>{},fixedWidth:false,ready:true,
 home:{get w(){return window.innerWidth;},get h(){return window.innerHeight;}},subscribe:fn=>{fn();return ()=>{};}};
export const DeskContext=createContext(null);
/** The desk the caller sits on: its scale, where its corner is on the screen, how far a panel may go, and how to make the desk bigger. Without a desk, the window itself. */
// The shell that holds the desk is outside it, so what it moves (the instrument's rig and the keyboard) cannot read the desk from context: for those, the
// desk that is mounted is looked up each time it is asked.
let live=null;
const listeners=new Set(); // told when the desk knows how big the instrument is
const LIVE={
 get zoom(){return (live??FALLBACK).zoom;},get el(){return (live??FALLBACK).el;},get fixedWidth(){return (live??FALLBACK).fixedWidth;},
 get ready(){return (live??FALLBACK).ready;},get home(){return (live??FALLBACK).home;},subscribe:fn=>{listeners.add(fn);if(live?.ready)fn();return ()=>listeners.delete(fn);},
 limits:(w,h)=>(live??FALLBACK).limits(w,h),origin:()=>(live??FALLBACK).origin(),grow:(...a)=>(live??FALLBACK).grow(...a),report:(k,r)=>(live??FALLBACK).report(k,r),
};
export const useDesk=()=>useContext(DeskContext)??LIVE;
/** Whether the instrument on the desk has this class (a synth's own start arrangement of the floating panels depends on it). */
/** Forget where everything was put (the desk, its view, the rig, keyboard and every floating panel) and start over from the defaults. */
export const RESET_EVENT='synths:reset-layout';
export const resetLayout=()=>{
 try{Object.keys(window.localStorage).filter(key=>{const k=key.replace(/:angle$/,'');return /^synths:(desk|scope-pos|keys-pos|rack-pos|setup-pos|diy:)/.test(k)||/^synths:all:(generator|voices|ambience|mixer|sequencer|keys-pos|scope-pos|win-.+|rack-.+)$/.test(k)||/^synths:[^:]+:(rig|seq|machine|arranger|generator|mixer|ambience|voices|sequencer)-pos$/.test(k);}).forEach(k=>window.localStorage.removeItem(k));}catch{/* storage unavailable */}
 window.dispatchEvent(new Event(RESET_EVENT));
};
export const onSynth=(...classes)=>typeof document!=='undefined'&&classes.some(cls=>!!document.querySelector('.instrument.'+cls));

const INTERACTIVE='button,input,select,textarea,a,label,[role=slider],[role=radio],[role=spinbutton],[role=dialog],.fader,.keys,.ribbon,.touchpad,.pick,.grip,.preset-knob,canvas,.lab-window,.rackc,.setup-pop,.help-pop,.scope,[data-desk-item],.synth-graphic';
const SURFACE_CONTROLS='button,input,select,textarea,a,label,[contenteditable=true],[role=slider],[role=radio],[role=spinbutton],[role=dialog],.fader,.keys,.ribbon,.touchpad,.pick,.grip,.rig-grip,.box-grip,.preset-knob,canvas,.setup-pop,.help-pop,.synth-graphic';
const isTouchScreen=()=>typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
const defaultLayout=(box,homeW=HOME_W,homeH=HOME_H)=>{
 const w=Math.max(BASE_W,Math.ceil(box.w)),h=Math.max(BASE_H,Math.ceil(box.h));
 return {w,h,x:Math.round((w-homeW)/2),y:Math.round((h-homeH)/2)};
};

export default function Desk({children,includeHomeInFit=true,objects=null,storageKey='synths:desk',arrangeRequest=0,arrangeWidth=3000,arrangeObjects=null,resetObjects=null,minZoom=MIN_ZOOM,containedNavigation=false}){
 const VIEW_KEY=storageKey,LAYOUT_KEY=storageKey+':layout';
 const view=useRef(null),homeRef=useRef(null),deskRef=useRef(null),[homeEl,setHomeEl]=useState(null);
 const coarse=useMemo(isTouchScreen,[]),touch=coarse&&!containedNavigation;
 const [moving,setMoving]=useState(false);
 // a ref callback that stays the same between renders: a new one each time would null the element in the middle of a drag
 const setHome=useCallback(n=>{homeRef.current=n;if(n)setHomeEl(n);},[]);
 const [box,setBox]=useState({w:HOME_W,h:HOME_H,measured:false});
 // the instrument is as tall as its content needs (never less than HOME_H); the panels placed on the desk report where they are, so the desk knows what is on it
 const [homeH,setHomeH]=useState(HOME_H),[homeW,setHomeW]=useState(HOME_W),[homeReady,setHomeReady]=useState(false);
 const itemsRef=useRef(new Map()),[,setItemsVersion]=useState(0);
 const [stored]=useState(()=>{const s=load(LAYOUT_KEY,null);return s&&Number.isFinite(s.w)&&Number.isFinite(s.h)&&Number.isFinite(s.x)&&Number.isFinite(s.y)&&s.w>=HOME_W&&s.h>=HOME_H?s:null;});
 const [layoutState,setLayout]=useState(stored);
 const [manual,setManual]=useState(()=>{const v=load(VIEW_KEY,null);return v&&Number.isFinite(v.zoom)?{zoom:clamp(v.zoom,minZoom,MAX_ZOOM),x:v.x??0,y:v.y??0}:null;});
 // a touch screen has no desk beyond the instrument
 const layout=touch?{w:homeW,h:homeH,x:0,y:0}:layoutState??defaultLayout(box,homeW,homeH);
 const layoutRef=useRef(layout);layoutRef.current=layout;

 useLayoutEffect(()=>{
  const el=view.current;if(!el)return undefined;
  const measure=()=>setBox({w:el.clientWidth,h:el.clientHeight,measured:true});
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return ()=>ro.disconnect();
 },[]);
 useLayoutEffect(()=>{
  if(!homeEl)return undefined;
  const measure=()=>{setHomeH(Math.max(HOME_H,Math.ceil(homeEl.offsetHeight)));setHomeW(Math.max(HOME_W,Math.ceil(homeEl.offsetWidth)));setHomeReady(true);};
  measure();const ro=new ResizeObserver(measure);ro.observe(homeEl);return ()=>ro.disconnect();
 },[homeEl]);

 // the first time on this device: lay the desk out for this window and keep it
 useEffect(()=>{if(touch||!box.measured||!homeReady||layoutState)return;const l=defaultLayout(box,homeW,homeH);setLayout(l);save(LAYOUT_KEY,l);},[touch,box,layoutState,homeW,homeH,homeReady]);

 // zoom: the instrument's width at 1:1 when it fits the window, else fitted to the width; a window too short for all of it moves up and down
 const fitHome=clamp(box.w/(homeW+60),minZoom,1);
 const zoom=touch?1:manual?manual.zoom:fitHome;
 const zoomRef=useRef(zoom);zoomRef.current=zoom;

 // where the desk's corner is on screen: centred on the instrument by default; the desk is centred across the window on an axis where it is smaller than the window

 // what is on the desk: the instrument and every panel placed on it, with some room round them. The view can only be moved over that: when it all
 // fits in the window there is nothing to scroll to.
 const content=()=>{
  let l=layout.x,t=layout.y,r=layout.x+homeW,b=layout.y+homeH;
  for(const it of itemsRef.current.values()){l=Math.min(l,layout.x+it.x);t=Math.min(t,layout.y+it.y);r=Math.max(r,layout.x+it.x+it.w);b=Math.max(b,layout.y+it.y+it.h);}
  return {l:Math.max(0,l-CONTENT_MARGIN),t:Math.max(0,t-CONTENT_MARGIN),r:Math.min(layout.w,r+CONTENT_MARGIN),b:Math.min(layout.h,b+CONTENT_MARGIN)};
 };
 const contentRef=useRef(null);contentRef.current=content();
 // The desk can be moved freely, the same in every direction. The one limit is the same on all four sides: some of what is on the desk (a fifth of the window's
 // smaller side, at least) stays in view, so it cannot be lost. A move that starts outside that limit may only move toward it, so the view never jumps.
 const place=useCallback((z,p,from=null,measured=null)=>{
  const c=measured??contentRef.current,peek=Math.max(120,Math.min(box.w,box.h)*.2);
  const ax=[peek-c.r*z,box.w-peek-c.l*z],ay=[peek-c.b*z,box.h-peek-c.t*z];
  const wide=(r,f)=>f==null?r:[Math.min(r[0],f),Math.max(r[1],f)];
  const bx=wide(ax,from?.x),by=wide(ay,from?.y);
  return {x:clamp(p.x,bx[0],bx[1]),y:clamp(p.y,by[0],by[1])};
 },[box]);
 // What is on the desk, measured from the elements themselves (the instrument, the rig and keyboard wherever they have been moved to, every floating panel),
 // in desk units. Done when it is needed (fit, and the start of a move), so it is always what is really there.
 const measure=(includeHome=true)=>{
  const home=homeRef.current,dk=deskRef.current;if(!home||!dk)return contentRef.current;
  const bounds=measureVisibleDesk(home,zoomRef.current,includeHome),L=layoutRef.current;
  if(!bounds)return contentRef.current;
  // measured from the instrument, so it does not depend on where the desk's own edge is (which moves as the desk grows)
  return {l:L.x+bounds.l-CONTENT_MARGIN,t:L.y+bounds.t-CONTENT_MARGIN,r:L.x+bounds.r+CONTENT_MARGIN,b:L.y+bounds.b+CONTENT_MARGIN};
 };
 // by default the instrument is centred across the window, and down it when it all fits, else it starts at the top
 const centred=z=>({x:box.w/2-(layout.x+homeW/2)*z,y:homeH*z<=box.h?box.h/2-(layout.y+homeH/2)*z:-(layout.y-12)*z});
 // the view is where it was put (by a pan, a zoom or Fit all) and is not moved behind your back; the default is the instrument centred
 const latest=useRef({});latest.current={place,measure};
 const at=touch?{x:0,y:0}:manual?{x:manual.x,y:manual.y}:centred(zoom);
 const atRef=useRef(at);atRef.current=at;
 // the desk reaches as far as the window can see: where the view shows beyond an edge (zoomed out, or on a bigger screen) the desk is made bigger on that
 // side, so every part of the screen is desk to put things on. Growing on the left or top moves the instrument over, and the view with it.
 useEffect(()=>{
  if(touch||!box.measured||!layoutState)return;
  const x0=-at.x/zoom,y0=-at.y/zoom,x1=x0+box.w/zoom,y1=y0+box.h/zoom;
  const dl=Math.max(0,Math.ceil(-x0)),dt=Math.max(0,Math.ceil(-y0)),dr=Math.max(0,Math.ceil(x1-layoutState.w)),db=Math.max(0,Math.ceil(y1-layoutState.h));
  if(!(dl||dt||dr||db))return;
  const next={x:layoutState.x+dl,y:layoutState.y+dt,w:layoutState.w+dl+dr,h:layoutState.h+dt+db};
  setLayout(next);save(LAYOUT_KEY,next);
  if(dl||dt)setManual(m=>{const v=m?{...m,x:m.x-dl*zoom,y:m.y-dt*zoom}:{zoom,x:at.x-dl*zoom,y:at.y-dt*zoom};save(VIEW_KEY,v);return v;});
 },[touch,box,zoom,at.x,at.y,layoutState]);

 // a touch screen: the page's layout width is the instrument's, so media queries see a desktop and the browser's pinch and pan do the rest
 useEffect(()=>{
  if(!touch)return undefined;
  const meta=document.querySelector('meta[name=viewport]');if(!meta)return undefined;
  const old=meta.getAttribute('content');
  const screenW=Math.min(window.screen?.width||window.innerWidth,window.innerWidth||9999);
  const lowest=screenW/homeW,start=clamp(Math.max(lowest,.5),lowest,1);
  // the part of the desk in view at first, for the full-screen prompt to sit in
  document.documentElement.style.setProperty('--vv-w',Math.round(screenW/start)+'px');document.documentElement.style.setProperty('--vv-h',Math.round((window.screen?.height||800)/start)+'px');
  meta.setAttribute('content',`width=${homeW}, initial-scale=${start.toFixed(3)}, minimum-scale=${lowest.toFixed(3)}, maximum-scale=3, user-scalable=yes, viewport-fit=cover`);
  return ()=>meta.setAttribute('content',old);
 },[touch,homeW]);

 const clearNativeScroll=useCallback(()=>{if(view.current){view.current.scrollTop=0;view.current.scrollLeft=0;}},[]);
 const commit=useCallback((z,x,y)=>{clearNativeScroll();const next={zoom:clamp(z,minZoom,MAX_ZOOM),x,y};setManual(next);save(VIEW_KEY,next);},[clearNativeScroll,minZoom]);
 // zoom about a point of the window (or its middle)
 const zoomTo=useCallback((z,px=box.w/2,py=box.h/2)=>{
  const old=zoomRef.current,next=clamp(z,minZoom,MAX_ZOOM),a=atRef.current;
  const dx=(px-a.x)/old,dy=(py-a.y)/old;
  commit(next,px-dx*next,py-dy*next);
 },[box,commit,minZoom]);
 const reset=useCallback(()=>{clearNativeScroll();setManual(null);save(VIEW_KEY,{});},[clearNativeScroll]);
 // zoom to fit: everything on the desk (the instrument and every panel) in the window at once, as large as it can be without going past 1:1
 const fitAll=useCallback(()=>{
  const c=measure(includeHomeInFit),cw=c.r-c.l,ch=c.b-c.t;
  const nav=containedNavigation?(view.current?.querySelector('.desk-zoom')?.getBoundingClientRect().height??0)+12:0,height=Math.max(1,box.h-nav);
  const z=clamp(Math.min(box.w/cw,height/ch),minZoom,1);
  commit(z,(box.w-cw*z)/2-c.l*z,(height-ch*z)/2-c.t*z);
 },[box,commit,includeHomeInFit,minZoom,containedNavigation]);

 // the first time on this device the view starts on everything that is on the desk (the instrument and the panels around it)
 // after a reset the desk is laid out afresh and the view starts on everything again (the panels put themselves back)
 const fitRef=useRef(fitAll);fitRef.current=fitAll;
 const arranger=useRef(arrangeObjects);arranger.current=arrangeObjects;
 const spreadOptions=()=>arrangeWidth==='auto'?{aspect:box.w/Math.max(1,box.h),gap:64}:{width:arrangeWidth};
 useEffect(()=>{
  if(!arrangeRequest||!objects)return;
  let fit;
  const arrange=requestAnimationFrame(()=>{if(arranger.current)arranger.current(objects);else objects.spread(spreadOptions());fit=requestAnimationFrame(()=>fitRef.current());});
  return ()=>{cancelAnimationFrame(arrange);if(fit)cancelAnimationFrame(fit);};
 },[arrangeRequest,arrangeWidth,objects]);
 const resetThisLayout=()=>{
  if(storageKey==='synths:desk'){resetLayout();return;}
  objects?.clearPoses({apply:true});setManual(null);setLayout(null);save(VIEW_KEY,{});save(LAYOUT_KEY,null);
  requestAnimationFrame(()=>{if(objects&&resetObjects)resetObjects(objects);fitRef.current();});
 };
 const firstFit=useRef(false);
 useEffect(()=>{
  const reset=()=>{firstFit.current=false;setLayout(null);setManual(null);setTimeout(()=>{if(!firstFit.current){firstFit.current=true;fitRef.current();}},250);};
  window.addEventListener(RESET_EVENT,reset);return ()=>window.removeEventListener(RESET_EVENT,reset);
 },[]);
 useEffect(()=>{
  if(touch||manual||firstFit.current||!homeReady||!box.measured)return undefined;
  const t=setTimeout(()=>{if(!firstFit.current){firstFit.current=true;fitRef.current();}},200);
  return ()=>clearTimeout(t);
 },[touch,manual,homeReady,box.measured]);

 useEffect(()=>{
  const el=view.current;if(!el||touch)return undefined;
  const wheel=e=>{
   const r=el.getBoundingClientRect();
   if(e.ctrlKey||e.metaKey){e.preventDefault();zoomTo(zoomRef.current*Math.exp(-e.deltaY*(e.deltaMode?.05:.0022)),e.clientX-r.left,e.clientY-r.top);return;}
   // the wheel moves the desk, except over something that scrolls itself
   const z=zoomRef.current;
   for(let n=e.target;n&&n!==el;n=n.parentElement){const s=getComputedStyle(n);if(/(auto|scroll)/.test(s.overflowY)&&n.scrollHeight>n.clientHeight+1||/(auto|scroll)/.test(s.overflowX)&&n.scrollWidth>n.clientWidth+1)return;}
   const a=atRef.current,L=latest.current,n=L.place(z,{x:a.x-e.deltaX,y:a.y-e.deltaY},a,L.measure());e.preventDefault();commit(z,n.x,n.y);
  };
  el.addEventListener('wheel',wheel,{passive:false});
  return ()=>el.removeEventListener('wheel',wheel);
 },[touch,zoomTo,commit]);

 // A panel surface can pan too; its actual controls keep one-finger editing.
 const pan=useRef(null);
 const beginPan=e=>{
  const z=zoomRef.current;
  const a=atRef.current,L=layoutRef.current;
  // the pan is anchored to the desk's origin as it is on screen (the view and the desk's own corner both move when the desk grows on the left or top, but this does not)
  pan.current={id:e.pointerId,px:e.clientX,py:e.clientY,ax:a.x+L.x*z,ay:a.y+L.y*z};
 };
 const down=e=>{
  if(touch||(e.button!==0&&e.button!==1))return;
  if(e.target.closest?.('.desk-zoom,.desk-spread'))return;
  if(e.button===0&&!moving&&(containedNavigation?e.defaultPrevented||e.target.closest?.(SURFACE_CONTROLS):e.target.closest?.(INTERACTIVE)))return;
  beginPan(e);e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();
 };
 const move=e=>{
  const p=pan.current;if(p?.id!==e.pointerId)return;
  const z=zoomRef.current,L=layoutRef.current,cur=atRef.current;
  const n=place(z,{x:p.ax+(e.clientX-p.px)-L.x*z,y:p.ay+(e.clientY-p.py)-L.y*z},{x:cur.x,y:cur.y},measure());commit(z,n.x,n.y);
 };
 const up=e=>{if(pan.current?.id===e.pointerId)pan.current=null;};
 useDeskTouchPan(view,containedNavigation,{start:beginPan,move,end:()=>{if(pan.current?.id==='touch-pan')pan.current=null;}});
 const focusObject=binding=>{
  const object=objects?.get(binding),el=object&&homeRef.current?.querySelector(`[data-desk-object-id="${object.id}"]`);
  if(!el||!isVisibleDeskItem(el))return;
  const r=el.getBoundingClientRect(),v=view.current.getBoundingClientRect(),z=zoomRef.current,a=atRef.current;
  if(!r.width||!r.height)return;
  const w=r.width/z,h=r.height/z,nav=view.current.querySelector('.desk-zoom')?.getBoundingClientRect().height??0,available=Math.max(1,box.h-nav-24),next=clamp(Math.min((box.w-24)/w,available/h),minZoom,1);
  objects.focus(binding);setMoving(false);commit(next,(box.w-w*next)/2-(r.left-v.left-a.x)/z*next,(available-h*next)/2-(r.top-v.top-a.y)/z*next);
 };

 const api=useMemo(()=>({
  get zoom(){return zoomRef.current;},el:homeEl,fixedWidth:true,ready:homeReady,home:{w:homeW,h:homeH},subscribe:fn=>{listeners.add(fn);if(homeReady)fn();return ()=>listeners.delete(fn);},
  // panels are placed relative to the instrument; the desk reaches this far to the left and up of it, and as far as it is grown to the right and down
  limits:(w,h)=>{return {minX:touch?0:-Infinity,minY:touch?0:-Infinity,maxX:touch?homeW-Math.min(w,homeW):Infinity,maxY:touch?homeH-Math.min(h,homeH):Infinity};},
  origin:()=>{const r=homeRef.current?.getBoundingClientRect();return {left:r?.left??0,top:r?.top??0};},
  // something now reaches `right` and `bottom` (in the instrument's coordinates): make the desk big enough, with some room beyond
  report:(key,rect)=>{
   const m=itemsRef.current,old=m.get(key);
   if(!rect){if(m.delete(key))setItemsVersion(v=>v+1);return;}
   if(old&&old.x===rect.x&&old.y===rect.y&&old.w===rect.w&&old.h===rect.h)return;
   m.set(key,rect);setItemsVersion(v=>v+1);
  },
  // something now reaches `right` and `bottom`, `left` and `top` (in the instrument's coordinates): when it goes past an edge of the desk, that edge is moved out
  // (a little beyond it, so the desk is not grown a pixel at a time); nothing happens until then
  grow:(right,bottom,left=0,top=0)=>{
   if(touch)return;
   const l=layoutRef.current,z=zoomRef.current;
   const dl=l.x+left<0?Math.ceil(GROW_PAD-(l.x+left)):0,dt=l.y+top<0?Math.ceil(GROW_PAD-(l.y+top)):0;
   let w=l.w+dl,h=l.h+dt;
   if(l.x+dl+right>w)w=Math.ceil(l.x+dl+right+GROW_PAD);
   if(l.y+dt+bottom>h)h=Math.ceil(l.y+dt+bottom+GROW_PAD);
   if(!dl&&!dt&&w===l.w&&h===l.h)return;
   const next={x:l.x+dl,y:l.y+dt,w,h};layoutRef.current=next; // at once, so a second move before the next render does not grow it again
   setLayout(next);save(LAYOUT_KEY,next);
   // growing on the left or top moves the instrument over by that much; the view is held where it is on screen, so nothing is seen to move
   if(dl||dt){const a=atRef.current;setManual(m=>{const v=m?{...m,x:m.x-dl*z,y:m.y-dt*z}:{zoom:z,x:a.x-dl*z,y:a.y-dt*z};save(VIEW_KEY,v);return v;});}
  },
 }),[homeEl,touch,homeW,homeH,homeReady]);

 useEffect(()=>{live=api;if(api.ready)listeners.forEach(fn=>fn());return ()=>{if(live===api)live=null;};},[api]);
 const style=touch?{width:homeW,height:homeH}:{width:layout.w,height:layout.h,transform:`translate(${at.x}px,${at.y}px) scale(${zoom})`};
 const percent=Math.round(zoom*100),isFit=!manual;
 return <div className={'desk-view'+(touch?' is-touch':'')+(containedNavigation?' is-contained':'')+(moving?' is-moving':'')} ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
  <DeskContext.Provider value={api}>
   <div className="desk" ref={deskRef} style={style} data-zoom={zoom.toFixed(2)} data-size={layout.w+'x'+layout.h}>
    <div className="desk-home" ref={setHome} style={{left:layout.x,top:layout.y,width:'max-content',minWidth:HOME_W,minHeight:HOME_H}}>{children}</div>
   </div>
  </DeskContext.Provider>
  {!touch&&<div className="desk-zoom" role="group" aria-label="Zoom the desk">
   {containedNavigation&&<span className="desk-touch-hint">Drag surfaces · 2 fingers over controls</span>}
   {containedNavigation&&objects?.list&&<select aria-label="Go to desk object" value="" onChange={e=>focusObject(e.target.value)}><option value="">Go to…</option>{objects.list().filter(o=>o.visible&&o.size.w>0&&o.size.h>0).map(o=><option key={o.id} value={o.binding}>{o.label}</option>)}</select>}
   {containedNavigation&&<button type="button" aria-pressed={moving} onClick={()=>setMoving(v=>!v)} title="Move the view by dragging anywhere; switch off to use instrument controls">Move desk</button>}
   <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl + wheel)" onClick={()=>zoomTo(zoomRef.current/1.15)}>−</button>
   <button type="button" className={'desk-zoom-fit'+(isFit?' is-fit':'')} aria-label="Back to the instrument" title="Back to the instrument at the default zoom" onClick={reset}>{percent}%</button>
   <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl + wheel)" onClick={()=>zoomTo(zoomRef.current*1.15)}>+</button>
   <button type="button" className="desk-crop" title="Zoom to fit everything on the desk in the window" onClick={fitAll}>Fit all</button>
   <button type="button" className="desk-crop" title="Put the instrument, keyboard and panels back where they start" onClick={resetThisLayout}>Reset layout</button>
   {objects&&containedNavigation&&<button type="button" className="desk-crop" title="Arrange visible boxes without changing their sound or connections" onClick={()=>{objects.spread(spreadOptions());requestAnimationFrame(()=>fitRef.current());}}>Spread</button>}
  </div>}
  {objects&&!containedNavigation&&<button type="button" className="desk-spread" title="Arrange visible boxes without changing their sound or connections" onClick={()=>{objects.spread(spreadOptions());requestAnimationFrame(()=>fitRef.current());}}>Spread</button>}
 </div>;
}
