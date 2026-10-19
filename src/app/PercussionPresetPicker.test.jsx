import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Picker from './PercussionPresetPicker';
import {percussionPresetKit} from './percussionVoices';
let node,root;
beforeEach(()=>{node=document.createElement('div');document.body.append(node);root=createRoot(node);globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
test('the shared sound browser shows only kits and waits for an async kit selection',async()=>{
 let finish;const change=vi.fn(()=>new Promise(r=>finish=r));await act(async()=>root.render(<Picker value="felt" kit={percussionPresetKit('felt')} onChange={change}/>));
 await act(async()=>node.querySelector('[aria-label="Choose percussion preset"]').click());const dialog=document.querySelector('.gen-vb');expect(dialog).toBeTruthy();
 expect([...dialog.querySelectorAll('.gen-pb-pick strong')].map(e=>e.textContent)).toEqual(['Felt','Crisp','808','Hand percussion']);expect(dialog.textContent).toContain('Wasm only');
 await act(async()=>dialog.querySelector('[data-preset=tr808]').click());expect(change).toHaveBeenCalledWith('tr808');expect(dialog.getAttribute('aria-busy')).toBe('true');expect([...dialog.querySelectorAll('.gen-pb-pick')].every(e=>e.disabled)).toBe(true);
 await act(async()=>finish());expect(dialog.getAttribute('aria-busy')).toBe('false');expect(document.querySelector('.gen-vb')).toBe(dialog);
 await act(async()=>dialog.querySelector('[aria-label=Close]').click());expect(document.querySelector('.gen-vb')).toBeNull();
});
test('a failed kit selection is visible and reset preserves the selected voice',async()=>{
 const kit=percussionPresetKit('crisp');kit.snare.tone=.3;const change=vi.fn().mockRejectedValue(Error('Kernel unavailable'));
 await act(async()=>root.render(<Picker value="crisp" kit={kit} onChange={change}/>));expect(node.textContent).toContain('edited');
 await act(async()=>node.querySelector('[aria-label="Choose percussion preset"]').click());await act(async()=>document.querySelector('.gen-vb [data-preset=hand]').click());expect(document.querySelector('.gen-vb [role=alert]').textContent).toContain('Kernel unavailable');
 await act(async()=>document.querySelector('.gen-vb [aria-label=Close]').click());await act(async()=>[...node.querySelectorAll('button')].find(e=>e.textContent==='Reset kit preset').click());expect(change).toHaveBeenLastCalledWith('crisp');expect(node.querySelector('[role=alert]').textContent).toContain('Kernel unavailable');
});
test('brackets in the kit browser select only the adjacent drum kit',async()=>{
 const change=vi.fn();await act(async()=>root.render(<Picker value="felt" kit={percussionPresetKit('felt')} onChange={change}/>));await act(async()=>node.querySelector('[aria-label="Choose percussion preset"]').click());
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:']',bubbles:true})));expect(change).toHaveBeenCalledWith('crisp');
 await act(async()=>document.querySelector('.gen-vb [aria-label=Close]').click());
});
