import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SynthShell from './SynthShell';
import {EnsemblePanelContext} from './EmbeddedShell';

const gain={key:'gain',label:'Gain',min:0,max:1,default:.5,curve:'linear'};
const synth={id:'case-test',params:{BY_KEY:{gain},sanitize:v=>v},presets:[]};
let container,root,change;
const object={key:'case-test:source',home:{x:10,y:20},className:'effects-source-box',label:'Test instrument'};
const render=caseObject=>act(()=>root.render(<EnsemblePanelContext.Provider value={{bound:true,values:{gain:.2},onChange:change,caseObject}}>
 <SynthShell synth={synth} className="diy diy-poly" picker={()=>null}>{api=>api.control('gain','teal')}</SynthShell>
</EnsemblePanelContext.Provider>));
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 localStorage.clear();container=document.createElement('div');document.body.append(container);root=createRoot(container);change=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());container.remove();localStorage.clear();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('uses one instrument case, moves from its own grip, and keeps controls and saved pose independent',()=>{
 render(object);
 const source=container.querySelector('.effects-source-box'),grip=source.querySelector('.rig-grip');
 expect(source.children).toHaveLength(1);expect(source.firstElementChild.className).toBe('rig');
 expect(container.querySelector('.effects-desk-box')).toBeNull();expect(container.querySelectorAll('.rig-grip')).toHaveLength(1);
 const pointer=(type,x,y)=>act(()=>{const e=new MouseEvent(type,{button:0,bubbles:true,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});grip.dispatchEvent(e);});
 pointer('pointerdown',100,100);pointer('pointermove',180,140);pointer('pointerup',180,140);
 expect(source.style.left).toBe('90px');expect(source.style.top).toBe('60px');
 act(()=>grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(source.style.transform).toBe('rotate(5deg)');
 act(()=>source.querySelector('[role=slider]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(change.mock.lastCall[0].gain).toBeCloseTo(.22);expect(source.style.left).toBe('90px');expect(source.style.transform).toBe('rotate(5deg)');
 act(()=>root.unmount());root=createRoot(container);render(object);
 const restored=container.querySelector('.effects-source-box');expect(restored.style.left).toBe('90px');expect(restored.style.top).toBe('60px');expect(restored.style.transform).toBe('rotate(5deg)');
});
it('leaves other hosted panels in their existing case without adding a grip',()=>{
 render(undefined);expect(container.querySelector('.instrument.bound>.rig')).toBeTruthy();expect(container.querySelector('.rig-grip')).toBeNull();
});
