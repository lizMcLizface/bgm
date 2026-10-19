import {kernelAsset} from './kernelAssets';
import {WASM_SIMD_LINK} from '../audio/wasmPerformance';
import {optionalSpeedup} from '../audio/perfMode';
// SIMD is a per-visit experiment. Never rewrite a device preference or patch.
const selected=new Map();
const probe=new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,...Array(16).fill(0),11]);
export function supportsSimd(){try{return WebAssembly.validate(probe);}catch{return false;}}
async function compile(file,kind){
 const response=await fetch(kernelAsset(kind,file));if(!response.ok)throw Error('FM kernel unavailable. Run npm run synth:build.');
 return WebAssembly.compile(await response.arrayBuffer());
}
export function loadFMModule(){
 const requested=optionalSpeedup(WASM_SIMD_LINK);if(selected.has(requested))return selected.get(requested);
 const pending=(async()=>{
  if(requested&&supportsSimd()){
   try{return {module:await compile('fm-simd.wasm','fm-simd'),simd:true};}catch{/* A failed optional build must not prevent scalar playback. */}
  }
  return {module:await compile('fm.wasm','fm'),simd:false};
 })().catch(error=>{selected.delete(requested);throw error;});selected.set(requested,pending);return pending;
}
