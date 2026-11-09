import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import Desk from './Desk';
import useDeskTouchPan,{bindDeskTouchPan} from './useDeskTouchPan';
import {Fader,Pot} from '../all/deskParts';

let root,container,cleanup;const previousAct=globalThis.IS_REACT_ACT_ENVIRONMENT;
class TestPointerEvent extends MouseEvent{constructor(type,options={}){super(type,{bubbles:true,cancelable:true,button:0,buttons:1,...options});Object.defineProperties(this,{pointerId:{value:options.pointerId??1},pointerType:{value:options.pointerType??'touch'}});}}
function setup(){
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('PointerEvent',TestPointerEvent);
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 container=document.createElement('div');document.body.append(container);root=createRoot(container);localStorage.clear();
}
const pointer=(el,type,id,x=20,y=20,extra={})=>{const e=new TestPointerEvent(type,{pointerId:id,clientX:x,clientY:y,...extra});act(()=>el.dispatchEvent(e));return e;};
afterEach(()=>{act(()=>{cleanup?.();root?.unmount();});container?.remove();localStorage.clear();vi.unstubAllGlobals();globalThis.IS_REACT_ACT_ENVIRONMENT=previousAct;root=container=cleanup=null;});

it('pans across real faders/knobs, cancels the first control and swallows the remaining finger and ghost click',()=>{
 setup();const calls={start:vi.fn(),move:vi.fn(),end:vi.fn()},change=vi.fn(),clicked=vi.fn();
 function Rig(){const ref=useRef();useDeskTouchPan(ref,true,calls);const [v,set]=useState(.5);return <div ref={ref} data-view><section onPointerDown={e=>e.stopPropagation()}><Pot label="Pan" v={v} onChange={n=>{change(n);set(n);}}/><Fader label="Level" v={v} onChange={change}/></section><button onClick={clicked}>Control</button></div>;}
 act(()=>root.render(<Rig/>));const view=container.querySelector('[data-view]'),pot=container.querySelector('[aria-label=Pan]'),fader=container.querySelector('[aria-label=Level]');
 fader.getBoundingClientRect=()=>({top:0,height:100});
 const captured=new Set();pot.setPointerCapture=id=>captured.add(id);pot.hasPointerCapture=id=>captured.has(id);pot.releasePointerCapture=vi.fn(id=>captured.delete(id));view.setPointerCapture=vi.fn();
 pointer(pot,'pointerdown',1,20,60);pointer(pot,'pointermove',1,20,48);expect(change).toHaveBeenCalledTimes(1); // ordinary one-finger edit
 const second=pointer(fader,'pointerdown',2,80,60);expect(second.defaultPrevented).toBe(true);expect(change).toHaveBeenCalledTimes(1);expect(calls.start).toHaveBeenCalledWith({clientX:50,clientY:54,pointerId:'touch-pan'});
 expect(pot.releasePointerCapture).toHaveBeenCalledWith(1);expect(view.setPointerCapture.mock.calls).toEqual([[1],[2]]);
 pointer(pot,'pointermove',1,40,80);pointer(fader,'pointermove',2,100,80);expect(calls.move).toHaveBeenLastCalledWith({clientX:70,clientY:80,pointerId:'touch-pan'});expect(change).toHaveBeenCalledTimes(1);
 pointer(view,'pointerup',2);pointer(pot,'pointermove',1,40,10);expect(change).toHaveBeenCalledTimes(1);expect(calls.end).toHaveBeenCalledOnce();
 pointer(view,'pointerup',1);act(()=>container.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));expect(clicked).not.toHaveBeenCalled();
 pointer(pot,'pointermove',1,40,0);expect(change).toHaveBeenCalledTimes(1); // first knob's drag was cancelled
 pointer(pot,'pointerdown',3,20,60);pointer(pot,'pointermove',3,20,48);expect(change).toHaveBeenCalledTimes(2);pointer(pot,'pointerup',3);
 act(()=>container.querySelector('button').click());expect(clicked).toHaveBeenCalledOnce();
});

it('moves only the contained camera over a full panel while leaving one-finger controls and saved object poses intact',()=>{
 setup();const change=vi.fn();act(()=>root.render(<Desk containedNavigation storageKey="test:touch"><section data-desk-item data-desk-object-id="mixer" style={{left:40,top:80}}><div data-background>Panel surface</div><Pot label="Pan" v={.5} onChange={change}/></section></Desk>));
 const pot=container.querySelector('[role=slider]'),surface=container.querySelector('[data-background]'),panel=container.querySelector('section'),pose=panel.getAttribute('style');
 pointer(pot,'pointerdown',1);pointer(pot,'pointermove',1,20,10);pointer(pot,'pointerup',1);expect(change).toHaveBeenCalledOnce();expect(localStorage.getItem('test:touch')).toBeNull();
 pointer(surface,'pointerdown',2);pointer(surface,'pointermove',2,90,110);pointer(surface,'pointerup',2);expect(localStorage.getItem('test:touch')).not.toBeNull();const before=JSON.parse(localStorage.getItem('test:touch'));
 pointer(pot,'pointerdown',3,50,50);pointer(pot,'pointerdown',4,100,50);const edits=change.mock.calls.length;pointer(pot,'pointermove',3,10,-10);pointer(pot,'pointermove',4,60,-10);pointer(pot,'pointerup',3);pointer(pot,'pointerup',4);
 const after=JSON.parse(localStorage.getItem('test:touch'));expect(after.zoom).toBe(before.zoom);expect(after.x).not.toBe(before.x);expect(after.y).not.toBe(before.y);expect(panel.getAttribute('style')).toBe(pose);expect(change).toHaveBeenCalledTimes(edits);
});

it('does not jump a touch fader before the second finger, while retaining touch tap/drag and immediate mouse edits',()=>{
 setup();const calls={start:vi.fn(),move:vi.fn(),end:vi.fn()},change=vi.fn();
 function Rig(){const ref=useRef();useDeskTouchPan(ref,true,calls);return <div ref={ref}><Fader label="Level" v={.5} onChange={change}/><Pot label="Pan" v={.5} onChange={change}/></div>;}
 act(()=>root.render(<Rig/>));const fader=container.querySelector('[aria-label=Level]'),pot=container.querySelector('[aria-label=Pan]');fader.getBoundingClientRect=()=>({top:0,height:100});
 pointer(fader,'pointerdown',1,20,90);expect(change).not.toHaveBeenCalled();pointer(pot,'pointerdown',2,80,90);pointer(fader,'pointermove',1,20,10);pointer(pot,'pointermove',2,80,10);pointer(fader,'pointerup',1);pointer(pot,'pointerup',2);expect(change).not.toHaveBeenCalled();
 pointer(fader,'pointerdown',3,20,70);pointer(fader,'pointerup',3,20,70);expect(change.mock.calls.at(-1)[0]).toBeCloseTo(.3);
 change.mockClear();pointer(fader,'pointerdown',4,20,70);pointer(fader,'pointermove',4,20,69);expect(change).not.toHaveBeenCalled();pointer(fader,'pointermove',4,20,40);pointer(fader,'pointerup',4,20,40);expect(change).toHaveBeenCalledOnce();expect(change).toHaveBeenLastCalledWith(.6);
 change.mockClear();pointer(fader,'pointerdown',5,20,80,{pointerType:'mouse'});expect(change.mock.calls[0][0]).toBeCloseTo(.2);pointer(fader,'pointerup',5,20,80,{pointerType:'mouse'});
});

it('leaves keyboard multi-touch, mouse pointers and navigation controls with their original owners',()=>{
 setup();container.innerHTML='<div data-view><div class="keybox"><button>Key</button></div><div class="desk-zoom"><button>Fit</button></div><div data-surface></div></div>';
 const view=container.querySelector('[data-view]'),calls={start:vi.fn(),move:vi.fn(),end:vi.fn()};cleanup=bindDeskTouchPan(view,calls);
 for(const target of [container.querySelector('.keybox button'),container.querySelector('.desk-zoom button')]){expect(pointer(target,'pointerdown',1).defaultPrevented).toBe(false);pointer(target,'pointerdown',2);pointer(target,'pointerup',1);pointer(target,'pointerup',2);}
 const surface=container.querySelector('[data-surface]');pointer(surface,'pointerdown',1,20,20,{pointerType:'mouse'});pointer(surface,'pointerdown',2,30,30,{pointerType:'mouse'});expect(calls.start).not.toHaveBeenCalled();
 pointer(surface,'pointerdown',3);pointer(surface,'pointerdown',4);pointer(surface,'pointerup',3);pointer(surface,'pointerup',4);
 const nav=container.querySelector('.desk-zoom button');pointer(nav,'pointerdown',5);pointer(nav,'pointerup',5);const click=new MouseEvent('click',{bubbles:true,cancelable:true,detail:1});act(()=>nav.dispatchEvent(click));expect(click.defaultPrevented).toBe(false);
});

it('ends on cancel/blur and disposes without retaining pointers or resuming a leftover finger',()=>{
 setup();const calls={start:vi.fn(),move:vi.fn(),end:vi.fn()};container.innerHTML='<div data-view><div data-control></div></div>';const view=container.firstChild,target=view.firstChild;cleanup=bindDeskTouchPan(view,calls);
 pointer(target,'pointerdown',1);pointer(target,'pointerdown',2);pointer(target,'pointercancel',1);pointer(target,'pointermove',2,80,80);expect(calls.move).not.toHaveBeenCalled();pointer(target,'pointerup',2);
 pointer(target,'pointerdown',3);pointer(target,'pointerdown',4);act(()=>window.dispatchEvent(new Event('blur')));expect(calls.end).toHaveBeenCalledTimes(2);pointer(target,'pointermove',4,80,80);expect(calls.move).not.toHaveBeenCalled();
 pointer(target,'pointerdown',5);pointer(target,'pointerdown',6);act(()=>cleanup());cleanup=null;expect(calls.end).toHaveBeenCalledTimes(3);pointer(target,'pointerdown',7);pointer(target,'pointerdown',8);expect(calls.start).toHaveBeenCalledTimes(3);
});

it('forgets a single touch ending outside a removed control rather than pairing it with a future gesture',()=>{
 setup();container.innerHTML='<div data-view><div data-control></div></div>';const view=container.firstChild,target=view.firstChild,calls={start:vi.fn(),move:vi.fn(),end:vi.fn()};cleanup=bindDeskTouchPan(view,calls);
 pointer(target,'pointerdown',1);target.remove();pointer(document.body,'pointerup',1);pointer(view,'pointerdown',2);expect(calls.start).not.toHaveBeenCalled();pointer(view,'pointerup',2);
});
