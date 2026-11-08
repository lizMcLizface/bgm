import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import StageKeys from './StageKeys';

it('keeps all 88 keys at their physical width even inside a narrow parent, while saved Fit remains available',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const context={scalePcs:[0,2,4,5,7,9,11],chords:[]};
 try{
  act(()=>root.render(<StageKeys low={48} context={context} notes={[]} onDown={()=>{}} onUp={()=>{}}/>));
  const box=container.querySelector('.keybox');expect(box.style.width).toBe('1584px');expect(box.style.maxWidth).toBe('none');expect(container.querySelectorAll('.lab-piano button')).toHaveLength(88);
  act(()=>root.render(<StageKeys size="fit" low={48} context={context} notes={[]} onDown={()=>{}} onUp={()=>{}}/>));
  expect(container.querySelector('.keybox').style.maxWidth).toBe('');expect(container.querySelectorAll('.lab-piano button').length).toBeLessThan(88);
 }finally{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
