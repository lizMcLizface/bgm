// @vitest-environment node
import {it,expect} from 'vitest';
import {moduleAssetUrl} from './moduleAssetUrls.mjs';
it('binds emitted JS assets to the importing module while leaving HTML, CSS and public audio URLs on their existing base',()=>{
 for(const filename of ['assets/AllPage-test.css','assets/AllPage-test.js','assets/source.worker-test.js'])expect(moduleAssetUrl(filename,{hostType:'js',type:'asset'})).toEqual({relative:true});
 for(const [filename,hostType,type]of [['assets/AllPage-test.css','html','asset'],['assets/font-test.woff2','css','asset'],['modular-audio/graph.wasm','js','public'],['synth-lab/core.wasm','js','public']])expect(moduleAssetUrl(filename,{hostType,type})).toBeUndefined();
});
