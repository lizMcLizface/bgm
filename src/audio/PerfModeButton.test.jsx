import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import PerfModeButton from './PerfModeButton';
import {setPerfChoice} from './perfMode';
let node,root;
beforeEach(()=>{history.replaceState(null,'','/');setPerfChoice(null);node=document.createElement('div');document.body.append(node);root=createRoot(node);globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{act(()=>root.unmount());node.remove();setPerfChoice(null);delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('disables repeated rebuilds and reflects the effective temporary policy',async()=>{
 let finish;const onToggle=vi.fn(next=>new Promise(resolve=>{setPerfChoice(next);finish=resolve;}));await act(async()=>root.render(<PerfModeButton onToggle={onToggle}/>));const button=node.querySelector('button');await act(async()=>button.click());expect(button.disabled).toBe(true);expect(button.getAttribute('aria-pressed')).toBe('true');button.click();expect(onToggle).toHaveBeenCalledOnce();await act(async()=>finish());expect(button.disabled).toBe(false);expect(button.textContent).toBe('Perf: on');
});
it('reports a failed rebuild instead of leaving the control busy',async()=>{
 await act(async()=>root.render(<PerfModeButton onToggle={async()=>{throw Error('Unavailable');}}/>));await act(async()=>node.querySelector('button').click());expect(node.querySelector('button').disabled).toBe(false);expect(node.querySelector('[role="alert"]').textContent).toBe('Unavailable');
});
