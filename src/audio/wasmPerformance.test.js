import {readWasmPerformance,writeWasmPerformance,sourcePerformance,WASM_PERFORMANCE_KEY,WASM_PERFORMANCE_EVENT} from './wasmPerformance';
import {initialFM} from '../synth-lab/fmPatch';
import {initialPatch} from '../synth-lab/patch';
afterEach(()=>localStorage.removeItem(WASM_PERFORMANCE_KEY));
it('retains full quality by default and rejects malformed preferences',()=>{
 expect(readWasmPerformance()).toBe('full');localStorage.setItem(WASM_PERFORMANCE_KEY,'anything');expect(readWasmPerformance()).toBe('full');expect(writeWasmPerformance('anything')).toBe(false);
});
it('persists an explicit economy choice and notifies existing voices',()=>{
 const change=vi.fn();window.addEventListener(WASM_PERFORMANCE_EVENT,change);
 try{expect(writeWasmPerformance('economy')).toBe(true);expect(readWasmPerformance()).toBe('economy');expect(change).toHaveBeenCalledOnce();writeWasmPerformance('full');expect(readWasmPerformance()).toBe('full');}finally{window.removeEventListener(WASM_PERFORMANCE_EVENT,change);}
});
it('changes only playback oversampling, preserving patch identity, voices, envelopes and effects',()=>{
 const p=initialFM(),copy=structuredClone(p);p.global.quality=2;copy.global.quality=2;
 expect(sourcePerformance(p,'full')).toBe(p);expect(sourcePerformance(p,'economy')).toEqual({...p,global:{...p.global,quality:0}});expect(p).toEqual(copy);
 const core=initialPatch();expect(sourcePerformance(core,'economy')).toBe(core);
});
