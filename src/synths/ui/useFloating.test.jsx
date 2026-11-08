import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import useFloating,{snapAngle} from './useFloating';
import {DeskContext,RESET_EVENT} from './Desk';

it('spawns once, stays independent of its anchor, drags at zoom and restores rotation',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
 const observers=[];globalThis.ResizeObserver=class{constructor(fn){observers.push(fn);}observe(){}disconnect(){}};
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container);
 let home={x:100,y:300};const desk={ready:true,el:container,zoom:.5,home:{w:1200,h:600},origin:()=>({left:0,top:0}),limits:()=>({minX:-Infinity,minY:-Infinity,maxX:Infinity,maxY:Infinity}),report:vi.fn(),grow:vi.fn()};
 let latest;
 function Panel(){const f=useFloating('synths:all:win-test',()=>home,{spawnOnly:true,rotatable:true,anchor:['#anchor']});latest=f;return <div ref={f.ref} style={f.style}><div className="grip" {...f.handle}/></div>;}
 const render=()=>act(()=>root.render(<DeskContext.Provider value={desk}><span id="anchor"/><Panel/></DeskContext.Provider>));
 render();expect(latest.style.left).toBe(100);home={x:500,y:800};act(()=>observers.forEach(fn=>fn()));expect(latest.style.left).toBe(100);
 act(()=>container.querySelector('.grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(latest.style.transform).toBe('rotate(5deg)');
 const e={button:0,target:container.querySelector('.grip'),currentTarget:{setPointerCapture(){}},pointerId:1,clientX:100,clientY:100,preventDefault(){}};
 act(()=>latest.handle.onPointerDown(e));act(()=>latest.handle.onPointerMove({...e,clientX:150,clientY:125}));act(()=>latest.handle.onPointerUp(e));expect(latest.style.left).toBe(200);expect(latest.style.top).toBe(350);
 act(()=>root.unmount());root=createRoot(container);render();
 expect(latest.style.left).toBe(200);expect(latest.style.top).toBe(350);expect(latest.style.transform).toBe('rotate(5deg)');
 act(()=>window.dispatchEvent(new Event(RESET_EVENT)));expect(latest.style.left).toBe(500);expect(latest.style.transform).toBe('rotate(0deg)');
 act(()=>root.unmount());container.remove();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('right-drags around the object center and twists with two touch pointers without a release jump',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const desk={ready:true,el:container,zoom:.5,home:{w:1000,h:600},limits:()=>({minX:-Infinity,minY:-Infinity,maxX:Infinity,maxY:Infinity}),report:vi.fn(),grow:vi.fn()};let latest;
 function Panel(){const f=useFloating('gesture-test',{x:0,y:0},{rotatable:true});latest=f;return <div ref={f.ref} style={f.style}><div className="grip" {...f.handle}/><button>Control</button></div>;}
 act(()=>root.render(<DeskContext.Provider value={desk}><Panel/></DeskContext.Provider>));
 latest.ref.current.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});
 const grip=container.querySelector('.grip'),target={setPointerCapture(){},hasPointerCapture(){return false;}};
 const event=(id,x,y,extra={})=>({pointerId:id,clientX:x,clientY:y,button:0,target:grip,currentTarget:target,preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
 const down=e=>act(()=>latest.handle.onPointerDown(e)),move=e=>act(()=>latest.handle.onPointerMove(e)),up=e=>act(()=>latest.handle.onPointerUp(e));
 try{
  down(event(1,200,50,{button:2}));move(event(1,100,150,{button:2}));up(event(1,100,150,{button:2}));
  expect(latest.style.transform).toBe('rotate(90deg)');expect(latest.style.left).toBe(0);expect(latest.style.top).toBe(0);
  // Return to two degrees from straight with the actual right-drag gesture.
  down(event(1,200,50,{button:2}));
  const near={x:100+100*Math.cos(-88*Math.PI/180),y:50+100*Math.sin(-88*Math.PI/180)};
  move(event(1,near.x,near.y,{button:2}));up(event(1,near.x,near.y,{button:2}));
  expect(latest.style.transform).toBe('rotate(0deg)');expect(JSON.parse(localStorage.getItem('gesture-test:angle'))).toBe(0);
  const context=event(1,0,0);latest.handle.onContextMenu(context);expect(context.preventDefault).toHaveBeenCalledOnce();
  const control=event(1,0,0,{target:container.querySelector('button')});latest.handle.onContextMenu(control);expect(control.preventDefault).not.toHaveBeenCalled();
  act(()=>latest.rotation.reset());
  down(event(2,50,50,{pointerType:'touch'}));down(event(3,150,50,{pointerType:'touch'}));
  move(event(3,100,100,{pointerType:'touch'}));move(event(2,100,0,{pointerType:'touch'}));
  expect(latest.style.transform).toBe('rotate(90deg)');expect(latest.style.left).toBeCloseTo(0);expect(latest.style.top).toBeCloseTo(0);
  up(event(3,100,100,{pointerType:'touch'}));move(event(2,110,10,{pointerType:'touch'}));up(event(2,110,10,{pointerType:'touch'}));
  expect(latest.style.left).toBeCloseTo(20);expect(latest.style.top).toBeCloseTo(20);expect(latest.style.transform).toBe('rotate(90deg)');
  expect(JSON.parse(localStorage.getItem('gesture-test:angle'))).toBe(90);
 }finally{act(()=>root.unmount());container.remove();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

it('snaps within three degrees of straight, including angles across a full turn',()=>{
 for(const a of [-363,-360,-357,-3,-2,0,2,3,357,360,363])expect(snapAngle(a)).toBe(0);
 expect(snapAngle(3.1)).toBeCloseTo(3.1);expect(snapAngle(-3.1)).toBeCloseTo(-3.1);expect(snapAngle(90)).toBe(90);
});
