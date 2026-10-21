import React,{act,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import WasmOptions,{useAudioEngine,AudioEngineButton} from './WasmOptions';
function Controls({generator,required=false}){const engine=useAudioEngine(generator,{required});return <><AudioEngineButton engine={engine}/><WasmOptions engine={engine}/></>;}
let node,root;
beforeEach(()=>{history.replaceState(null,'','/');localStorage.clear();node=document.createElement('div');document.body.append(node);root=createRoot(node);globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('a single perf parameter selects Wasm without changing the saved engine',async()=>{
 history.replaceState(null,'','/?perf=1');localStorage.setItem('bgm-audio-engine','legacy');const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<Controls generator={generator}/>));expect(generator.audioEngine).toBe('wasm');expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
});
it('is on for a fresh visitor without saving it, and persists an explicit opt-out',async()=>{
 const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<Controls generator={generator}/>));const input=node.querySelector('input');expect(input.checked).toBe(true);expect(generator.audioEngine).toBe('wasm');expect(localStorage.getItem('bgm-audio-engine')).toBeNull();await act(async()=>{input.click();await Promise.resolve();});expect(input.checked).toBe(false);expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
});
it('restores the saved engine once even under StrictMode effects',async()=>{
 localStorage.setItem('bgm-audio-engine','wasm');const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<StrictMode><Controls generator={generator}/></StrictMode>));expect(generator.setAudioEngine).toHaveBeenCalledOnce();expect(node.querySelector('input').checked).toBe(true);
});
it('keeps the old selection and reports a failed engine preparation',async()=>{
 const generator={audioEngine:'legacy',setAudioEngine:vi.fn().mockRejectedValue(Error('Kernel unavailable'))};await act(async()=>root.render(<Controls generator={generator}/>));await act(async()=>{node.querySelector('input').click();await Promise.resolve();});expect(node.querySelector('input').checked).toBe(false);expect(node.textContent).toContain('Kernel unavailable');expect(localStorage.getItem('bgm-audio-engine')).toBeNull();
});

it('keeps the engine button, V shortcut and options checkbox synchronized',async()=>{
 localStorage.setItem('bgm-audio-engine','legacy');const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<Controls generator={generator}/>));
 const button=node.querySelector('button'),input=node.querySelector('input');
 await act(async()=>button.click());expect(input.checked).toBe(true);expect(button.getAttribute('aria-pressed')).toBe('true');
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',cancelable:true})));expect(input.checked).toBe(false);expect(button.textContent).toContain('Previous');expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
 await act(async()=>input.click());expect(button.getAttribute('aria-pressed')).toBe('true');
});
it('ignores shortcut repeats, modifiers, editing and modal windows',async()=>{
 localStorage.setItem('bgm-audio-engine','legacy');const generator={setAudioEngine:vi.fn()};await act(async()=>root.render(<Controls generator={generator}/>));
 for(const extra of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true}])window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',...extra}));
 for(const tag of ['input','select','textarea','div']){const field=document.createElement(tag);if(tag==='div')field.setAttribute('contenteditable','');node.append(field);field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',bubbles:true}));field.remove();}
 const dialog=document.createElement('div');dialog.setAttribute('role','dialog');node.append(dialog);window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));dialog.remove();
 expect(generator.setAudioEngine).not.toHaveBeenCalled();
});
it('serializes preparation and leaves both controls on the current engine until ready',async()=>{
 localStorage.setItem('bgm-audio-engine','legacy');let finish;const generator={audioEngine:'legacy',setAudioEngine:vi.fn(()=>new Promise(resolve=>{finish=()=>{generator.audioEngine='wasm';resolve();};}))};await act(async()=>root.render(<Controls generator={generator}/>));
 await act(async()=>{node.querySelector('button').click();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));});
 expect(generator.setAudioEngine).toHaveBeenCalledOnce();expect(node.querySelector('button').disabled).toBe(true);expect(node.querySelector('input').disabled).toBe(true);expect(node.querySelector('input').checked).toBe(false);
 await act(async()=>finish());expect(node.querySelector('button').disabled).toBe(false);expect(node.querySelector('input').checked).toBe(true);
});

it('uses a temporary Wasm debugging link without changing the saved preference, even when toggled',async()=>{
 history.replaceState(null,'','/?preset=rainy-cafe&wasm=1');localStorage.setItem('bgm-audio-engine','legacy');
 const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<Controls generator={generator}/>));
 expect(generator.audioEngine).toBe('wasm');expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');expect(node.textContent).toContain('Temporary engine override');
 await act(async()=>node.querySelector('button').click());expect(generator.audioEngine).toBe('legacy');expect(new URLSearchParams(location.search).get('wasm')).toBe('0');expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
});
it('a previous-engine debugging link overrides a saved opt-in',async()=>{
 history.replaceState(null,'','/?wasm=0');localStorage.setItem('bgm-audio-engine','wasm');const generator={audioEngine:'legacy',setAudioEngine:vi.fn()};await act(async()=>root.render(<Controls generator={generator}/>));expect(generator.setAudioEngine).not.toHaveBeenCalled();expect(node.querySelector('input').checked).toBe(false);expect(localStorage.getItem('bgm-audio-engine')).toBe('wasm');
});
it('temporarily enables required voices and restores the prior engine when leaving them',async()=>{
 localStorage.setItem('bgm-audio-engine','legacy');const generator={audioEngine:'legacy',setAudioEngine:vi.fn(async function(mode){this.audioEngine=mode;})};await act(async()=>root.render(<Controls generator={generator} required/>));expect(generator.audioEngine).toBe('wasm');expect(node.querySelector('button').disabled).toBe(true);expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
 await act(async()=>root.render(<Controls generator={generator}/>));expect(generator.audioEngine).toBe('legacy');expect(node.querySelector('button').disabled).toBe(false);expect(localStorage.getItem('bgm-audio-engine')).toBe('legacy');
});
