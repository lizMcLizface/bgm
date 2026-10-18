import {acousticFixture,acousticVariants} from './acousticFixtures';
import {renderSpectralKernel} from './spectralEngine';
import {qualityMeasure} from './qualityFixtures';
const modules=new Map();
async function module(name){if(!modules.has(name))modules.set(name,fetch(`${import.meta.env.BASE_URL}synth-lab/${name}.wasm`).then(async r=>{if(!r.ok)throw Error(name+' kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modules.delete(name);throw e;}));return modules.get(name);}
self.onmessage=async({data})=>{try{
 const fixture=acousticFixture(data.config),source=await module(fixture.kind==='fm'?'fm':'core'),rows=[];
 for(const v of acousticVariants(fixture)){self.postMessage({type:'progress',message:'Rendering '+v.name+'…'});const start=performance.now(),channels=renderSpectralKernel(source,{...fixture,patch:v.patch},fixture.config.rate,fixture.kind==='fm'?1:0);rows.push({...v,channels,renderMs:performance.now()-start,metrics:qualityMeasure(channels)});}
 self.postMessage({type:'result',result:{fixture,rows,benchmark:false}},rows.flatMap(r=>r.channels.map(c=>c.buffer)));
}catch(e){self.postMessage({type:'error',message:e.message});}};
