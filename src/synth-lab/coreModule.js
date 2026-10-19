import {perfEnabled} from '../audio/perfMode';
import {supportsSimd} from './fmModule';
import {kernelAsset} from './kernelAssets';
const modules=new Map();
export function coreVariant(patch,enabled=perfEnabled()){
 if(!enabled)return 'core';
 const layers=patch?.layers?.slice(0,patch.global.model===2?2:1)??[];
 return layers.some(l=>l.body>0||l.formant>0)?'core-acoustic':'core';
}
export function synthModule(patch){
 const kind=coreVariant(patch);if(!modules.has(kind))modules.set(kind,(async()=>{
  const compile=async name=>{const r=await fetch(kernelAsset(name,name==='core'?'core.wasm':name+'.wasm'));if(!r.ok)throw Error('Wasm kernel unavailable. Run npm run synth:build.');return WebAssembly.compile(await r.arrayBuffer());};
  if(kind!=='core'&&supportsSimd())try{return await compile(kind);}catch{/* Optional acceleration retains the scalar fallback. */}
  return compile('core');
 })().catch(e=>{modules.delete(kind);throw e;}));return modules.get(kind);
}
