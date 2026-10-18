import {textureFixture,textureVariants} from './textureFixtures';
import {renderSpectralKernel} from './spectralEngine';
import {renderInserts} from './inserts';
import {qualityMeasure} from './qualityFixtures';
const modules=new Map();
async function module(name){if(!modules.has(name))modules.set(name,fetch(`${import.meta.env.BASE_URL}synth-lab/${name}.wasm`).then(async r=>{if(!r.ok)throw Error(name+' kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modules.delete(name);throw e;}));return modules.get(name);}
self.onmessage=async({data})=>{
 try{const fixture=textureFixture(data.config),source=await module(fixture.kind==='fm'?'fm':'core'),inserts=await module('inserts'),rows=[];let previousPatch,previousChannels;
  for(const variant of textureVariants(fixture)){
   self.postMessage({type:'progress',message:'Rendering '+variant.name+'…'});const start=performance.now(),key=JSON.stringify(variant.patch);let channels;const sourceReused=key===previousPatch;
   if(key===previousPatch)channels=previousChannels;else{channels=renderSpectralKernel(source,{...fixture,patch:variant.patch},fixture.config.rate,fixture.kind==='fm'?1:0);previousPatch=key;previousChannels=channels;}
   const sourceMs=performance.now()-start,fxStart=performance.now(),output=renderInserts(inserts,channels,fixture.config.rate,variant.inserts),metrics=qualityMeasure(output);
   rows.push({id:variant.id,name:variant.name,channels:output,metrics,renderMs:sourceMs+performance.now()-fxStart,sourceMs,sourceReused,insertMs:performance.now()-fxStart,patch:variant.patch,inserts:variant.inserts});
  }
  self.postMessage({type:'result',result:{fixture,rows,benchmark:false}},rows.flatMap(r=>r.channels.map(c=>c.buffer)));
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
