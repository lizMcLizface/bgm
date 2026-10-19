import {simdFromSearch} from './simdChoice';
export const WASM_PERFORMANCE_KEY='bgm-wasm-performance';
export const WASM_PERFORMANCE_EVENT='bgm-wasm-performance-change';
export function readWasmPerformance(){
 try{return localStorage.getItem(WASM_PERFORMANCE_KEY)==='economy'?'economy':'full';}catch{return 'full';}
}
export function writeWasmPerformance(value){
 if(!['full','economy'].includes(value))return false;
 try{localStorage.setItem(WASM_PERFORMANCE_KEY,value);window.dispatchEvent(new Event(WASM_PERFORMANCE_EVENT));return true;}catch{return false;}
}
// A playback policy, separate from sound design/exported patch JSON. Full
// preserves even custom 1x/4x patches. Economy explicitly caps FM at 1x.
export function sourcePerformance(patch,mode=readWasmPerformance()){
 if(patch.kind!=='fm'||mode!=='economy')return patch;
 return {...patch,global:{...patch.global,quality:0}};
}
// Capture before the app updates the address bar; this is never persisted.
export const WASM_SIMD_LINK=typeof location!=='undefined'&&simdFromSearch(location.search)===true;
