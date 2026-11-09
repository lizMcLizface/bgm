import {describe,it,expect} from 'vitest';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Desk from './Desk';
import {isVisibleDeskItem,measureVisibleDesk,resetLayout,useDesk} from './Desk';

describe('reset layout',()=>{
 it('contains coarse-pointer navigation without rewriting the page viewport or clamping objects onto each other',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:true}));localStorage.clear();
  const meta=document.createElement('meta');meta.name='viewport';meta.content='width=device-width, initial-scale=1';document.head.append(meta);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),limits=[];
  function Probe(){const desk=useDesk();limits.push(desk.limits(850,400));return <button className="test-control">Control</button>;}
  const pointer=(type,x,y)=>{const e=new MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:3});Object.defineProperty(e,'pointerType',{value:'touch'});return e;};
  try{act(()=>root.render(<Desk containedNavigation storageKey="test:contained" minZoom={.1}><Probe/></Desk>));const view=container.querySelector('.desk-view');expect(view.classList.contains('is-touch')).toBe(false);expect(view.classList.contains('is-contained')).toBe(true);expect(meta.content).toBe('width=device-width, initial-scale=1');expect(limits.at(-1).maxX).toBe(Infinity);
   const control=container.querySelector('.test-control'),initial=localStorage.getItem('test:contained');act(()=>{control.dispatchEvent(pointer('pointerdown',10,10));control.dispatchEvent(pointer('pointerup',10,10));});expect(localStorage.getItem('test:contained')).toBe(initial);
   act(()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Move desk').click());expect(view.classList.contains('is-moving')).toBe(true);const down=pointer('pointerdown',10,10);act(()=>{control.dispatchEvent(down);view.dispatchEvent(pointer('pointermove',80,100));view.dispatchEvent(pointer('pointerup',80,100));});expect(down.defaultPrevented).toBe(true);expect(JSON.parse(localStorage.getItem('test:contained')).zoom).toBeGreaterThan(0);
  }finally{act(()=>root.unmount());container.remove();meta.remove();localStorage.clear();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('only applies a requested arrangement once, while reset can restore the page-specific physical layout',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  localStorage.clear();const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const first=vi.fn(),reset=vi.fn(),objects={spread:vi.fn(),clearPoses:vi.fn()};
  try{
   act(()=>root.render(<Desk storageKey="test:rig" objects={objects} arrangeRequest={1} arrangeObjects={first} resetObjects={reset}><div>Instrument</div></Desk>));
   await vi.waitFor(()=>expect(first).toHaveBeenCalledOnce());
   act(()=>root.render(<Desk storageKey="test:rig" objects={objects} arrangeRequest={1} arrangeObjects={null} resetObjects={reset}><div>Serial mode</div></Desk>));
   await new Promise(resolve=>setTimeout(resolve,40));expect(objects.spread).not.toHaveBeenCalled();
   act(()=>container.querySelectorAll('.desk-crop')[1].click());await vi.waitFor(()=>expect(reset).toHaveBeenCalledWith(objects));expect(objects.clearPoses).toHaveBeenCalledWith({apply:true});
  }finally{act(()=>root.unmount());container.remove();localStorage.clear();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('leaves horizontal scrolling inside panels to the panel instead of panning the desk',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  localStorage.clear();const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try{
   act(()=>root.render(<Desk><div data-testid="scroller" style={{overflowX:'auto'}}><span>Choices</span></div></Desk>));
   const child=container.querySelector('[data-testid=scroller]');Object.defineProperties(child,{clientWidth:{value:100},scrollWidth:{value:500}});
   const e=new WheelEvent('wheel',{deltaX:60,bubbles:true,cancelable:true});act(()=>child.dispatchEvent(e));expect(e.defaultPrevented).toBe(false);
  }finally{act(()=>root.unmount());container.remove();localStorage.clear();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('clears native focus-scroll offsets when fitting or restoring the camera',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  localStorage.clear();const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try{
   act(()=>root.render(<Desk><div>Instrument</div></Desk>));
   const view=container.querySelector('.desk-view');
   for(const button of [container.querySelector('.desk-crop'),container.querySelector('[aria-label="Back to the instrument"]')]){
    view.scrollTop=80;view.scrollLeft=40;
    act(()=>button.click());expect(view.scrollTop).toBe(0);expect(view.scrollLeft).toBe(0);
   }
  }finally{act(()=>root.unmount());container.remove();localStorage.clear();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('resets all-page positions without deleting saved songs or generator preferences',()=>{
  localStorage.clear();
  for(const key of ['generator','mixer','keys-pos','scope-pos','win-lead','rack-bass','state','continuous-buffer'])
   localStorage.setItem('synths:all:'+key,JSON.stringify({x:1,y:2}));
  resetLayout();
  for(const key of ['generator','mixer','keys-pos','scope-pos','win-lead','rack-bass'])
   expect(localStorage.getItem('synths:all:'+key)).toBeNull();
  expect(localStorage.getItem('synths:all:state')).not.toBeNull();
  expect(localStorage.getItem('synths:all:continuous-buffer')).not.toBeNull();
  localStorage.clear();
 });

 describe('visible desk items',()=>{
  it('excludes hidden panels and their descendants from measurement',()=>{
   const panel=document.createElement('div'),child=document.createElement('div');
   panel.append(child);document.body.append(panel);
   expect(isVisibleDeskItem(panel)).toBe(true);
   panel.style.visibility='hidden';
   expect(isVisibleDeskItem(panel)).toBe(false);
   expect(isVisibleDeskItem(child)).toBe(false);
   panel.style.visibility='visible';
   panel.style.display='none';
   expect(isVisibleDeskItem(panel)).toBe(false);
   panel.remove();
  });
  it('fits visible All panels without the empty home area or hidden descendants',()=>{
   const home=document.createElement('div'),visible=document.createElement('div'),hidden=document.createElement('div'),child=document.createElement('div');
   visible.dataset.deskItem='';hidden.dataset.deskItem='';child.className='rig';
   hidden.setAttribute('aria-hidden','true');hidden.style.visibility='hidden';child.style.visibility='visible';
   hidden.append(child);home.append(visible,hidden);document.body.append(home);
   const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
   home.getBoundingClientRect=()=>rect(10,20,1500,1700);
   visible.getBoundingClientRect=()=>rect(110,220,500,300);
   hidden.getBoundingClientRect=()=>rect(10000,10000,500,300);
   child.getBoundingClientRect=()=>rect(20000,20000,500,300);
   expect(isVisibleDeskItem(child)).toBe(false);
   expect(measureVisibleDesk(home,1,false)).toEqual({l:100,t:200,r:600,b:500});
   expect(measureVisibleDesk(home,1,true)).toEqual({l:0,t:0,r:1500,b:1700});
   hidden.removeAttribute('aria-hidden');hidden.style.visibility='visible';child.style.visibility='';
   expect(measureVisibleDesk(home,1,false).r).toBe(20490);
   home.remove();
  });
 });
});
