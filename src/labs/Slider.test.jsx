import React,{act} from 'react';
import {Simulate} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import Slider,{snapToNeutral} from './Slider';

it('resets exactly to neutral with a value-button click or slider double-click',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const node=document.createElement('div');document.body.append(node);const root=createRoot(node),change=vi.fn();
 act(()=>root.render(<Slider label="Pitch bend" value={.37} min={-2} max={2} neutral={0} onChange={change}/>));
 act(()=>node.querySelector('button').click());expect(change).toHaveBeenLastCalledWith(0);
 act(()=>Simulate.doubleClick(node.querySelector('input')));expect(change).toHaveBeenLastCalledWith(0);
 act(()=>root.render(<Slider label="Expression level" value={.4} neutral={1} onChange={change}/>));act(()=>node.querySelector('button').click());expect(change).toHaveBeenLastCalledWith(1);
 act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
it('snaps pointer drags near centre while keeping precise keyboard adjustments possible',()=>{
 expect(snapToNeutral(.02,-1,1,0)).toBe(0);expect(snapToNeutral(.05,-2,2,0)).toBe(0);expect(snapToNeutral(.1,-1,1,0)).toBe(.1);expect(snapToNeutral(.01,0,1,0)).toBe(.01);
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const node=document.createElement('div');document.body.append(node);const root=createRoot(node),change=vi.fn();act(()=>root.render(<Slider label="Brightness" value={0} min={-1} neutral={0} onChange={change}/>));const input=node.querySelector('input');
 act(()=>Simulate.pointerDown(input));act(()=>Simulate.change(input,{target:{value:'.02'}}));expect(change).toHaveBeenLastCalledWith(0);
 act(()=>Simulate.pointerUp(input));act(()=>Simulate.change(input,{target:{value:'.01'}}));expect(change).toHaveBeenLastCalledWith(.01);
 act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
