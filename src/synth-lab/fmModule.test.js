// @vitest-environment node
import {vi} from 'vitest';
const state=vi.hoisted(()=>({enabled:false,perf:null,supported:true,fetchFail:false,compileFail:false,scalarFail:false}));
vi.mock('../audio/perfMode',()=>({optionalSpeedup:flag=>state.perf===false?false:state.perf===true||flag}));
vi.mock('../audio/wasmPerformance',()=>({get WASM_SIMD_LINK(){return state.enabled;}}));
const native=globalThis.WebAssembly;
beforeEach(()=>{vi.resetModules();Object.assign(state,{enabled:false,perf:null,supported:true,fetchFail:false,compileFail:false,scalarFail:false});
 vi.stubGlobal('fetch',vi.fn(async url=>({ok:!(url.includes('fm-simd')?state.fetchFail:state.scalarFail),arrayBuffer:async()=>new Uint8Array([url.includes('fm-simd')?1:0]).buffer})));
 vi.stubGlobal('WebAssembly',{validate:vi.fn(()=>state.supported),compile:vi.fn(async bytes=>{if(new Uint8Array(bytes)[0]===1&&state.compileFail)throw Error('unsupported candidate');return {id:new Uint8Array(bytes)[0]};})});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('loads one shared scalar module by default, without requesting the prototype',async()=>{
 const {loadFMModule}=await import('./fmModule');const a=loadFMModule(),b=loadFMModule();expect(a).toBe(b);expect(await a).toEqual({module:{id:0},simd:false});expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('/fm.wasm?');
});
it('uses the explicit SIMD link only when the browser supports it',async()=>{
 state.enabled=true;const {loadFMModule}=await import('./fmModule');expect(await loadFMModule()).toEqual({module:{id:1},simd:true});expect(fetch).toHaveBeenCalledTimes(1);
});
it('keeps an unsupported browser on scalar without fetching SIMD',async()=>{
 Object.assign(state,{enabled:true,supported:false});const {loadFMModule}=await import('./fmModule');expect((await loadFMModule()).simd).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('/fm.wasm?');
});
it.each(['fetchFail','compileFail'])('retains scalar playback after an optional %s',async key=>{
 state.enabled=true;state[key]=true;const {loadFMModule}=await import('./fmModule');const a=await loadFMModule();expect(a.simd).toBe(false);expect(await loadFMModule()).toBe(a);expect(fetch).toHaveBeenCalledTimes(2);
});
it('retries a failed scalar load and uses a valid SIMD capability probe',async()=>{
 const {loadFMModule,supportsSimd}=await import('./fmModule');state.scalarFail=true;await expect(loadFMModule()).rejects.toThrow('FM kernel unavailable');state.scalarFail=false;expect((await loadFMModule()).simd).toBe(false);vi.stubGlobal('WebAssembly',native);expect(supportsSimd()).toBe(true);
});

it('caches both variants and honors explicit Perf off over the older SIMD link',async()=>{
 state.enabled=true;state.perf=false;const {loadFMModule}=await import('./fmModule');const scalar=await loadFMModule();expect(scalar.simd).toBe(false);state.perf=true;expect((await loadFMModule()).simd).toBe(true);state.perf=false;expect(await loadFMModule()).toBe(scalar);expect(fetch).toHaveBeenCalledTimes(2);
});
