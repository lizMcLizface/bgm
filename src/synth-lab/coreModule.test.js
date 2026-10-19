import {vi} from 'vitest';
const state=vi.hoisted(()=>({perf:false,supported:true,fail:false}));
vi.mock('../audio/perfMode',()=>({perfEnabled:()=>state.perf}));
vi.mock('./fmModule',()=>({supportsSimd:()=>state.supported}));
beforeEach(()=>{vi.resetModules();Object.assign(state,{perf:false,supported:true,fail:false});vi.stubGlobal('fetch',vi.fn(async url=>({ok:!(state.fail&&!url.includes('/core.wasm')),arrayBuffer:async()=>new Uint8Array([url.includes('core-acoustic')?2:url.includes('core-fast')?1:0]).buffer})));vi.spyOn(WebAssembly,'compile').mockImplementation(async b=>({id:new Uint8Array(b)[0]}));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const patch=(model,first={},second={})=>({global:{model},layers:[first,second]});
it('selects active acoustic modes rather than an unused layer',async()=>{
 const {coreVariant}=await import('./coreModule');expect(coreVariant(patch(0,{body:.4}),true)).toBe('core-acoustic');expect(coreVariant(patch(1,{formant:.2}),true)).toBe('core-acoustic');expect(coreVariant(patch(3,{}, {body:.8}),true)).toBe('core');expect(coreVariant(patch(2,{}, {body:.8}),true)).toBe('core-acoustic');expect(coreVariant(patch(0,{body:.4}),false)).toBe('core');
});
it('keeps scalar/accelerated modules separate across live toggles',async()=>{
 const {synthModule}=await import('./coreModule');expect((await synthModule(patch(0))).id).toBe(0);state.perf=true;expect((await synthModule(patch(0))).id).toBe(0);expect((await synthModule(patch(0,{body:.5}))).id).toBe(2);state.perf=false;expect((await synthModule(patch(0))).id).toBe(0);expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(['unsupported','unavailable'])('falls back to scalar when acceleration is %s',async mode=>{
 state.perf=true;state.supported=mode!=='unsupported';state.fail=mode==='unavailable';const {synthModule}=await import('./coreModule');expect((await synthModule(patch(0,{body:.4}))).id).toBe(0);expect(await synthModule(patch(0,{body:.4}))).toEqual({id:0});expect(fetch).toHaveBeenCalledTimes(mode==='unsupported'?1:2);
});
