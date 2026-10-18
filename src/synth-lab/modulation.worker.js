import {modulationFixture,modulationVariants} from './modulationFixtures';
import {renderSpectralKernel} from './spectralEngine';
import {qualityMeasure} from './qualityFixtures';
let modulePromise;
self.onmessage=async({data})=>{
 try{
  modulePromise??=fetch(`${import.meta.env.BASE_URL}synth-lab/core.wasm`).then(async r=>{if(!r.ok)throw Error('DSP kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modulePromise=null;throw e;});
  const module=await modulePromise,fixture=modulationFixture(data.config),rows=[];
  for(const variant of modulationVariants(fixture)){
   self.postMessage({type:'progress',message:'Rendering '+variant.name+'…'});
   const start=performance.now(),channels=renderSpectralKernel(module,{...fixture,patch:variant.patch},fixture.config.rate),metrics=qualityMeasure(channels);
   rows.push({id:variant.id,name:variant.name,channels,metrics,renderMs:performance.now()-start});
  }
  self.postMessage({type:'result',result:{fixture,rows,benchmark:false}},rows.flatMap(r=>r.channels.map(c=>c.buffer)));
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
