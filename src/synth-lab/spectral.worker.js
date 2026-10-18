import {spectralFixture} from './spectralFixtures';
import {renderSpectralKernel,referenceChannels,analyseSpectralChannels} from './spectralEngine';
const modules=new Map();
async function kernel(kind){
 if(!modules.has(kind))modules.set(kind,fetch(`${import.meta.env.BASE_URL}synth-lab/${kind==='fm'?'fm':'core'}.wasm`).then(async r=>{if(!r.ok)throw Error('DSP kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modules.delete(kind);throw e;}));
 return modules.get(kind);
}
self.onmessage=async({data})=>{
 try{
  const fixture=spectralFixture(data.config),module=await kernel(fixture.kind),rows=[],started=performance.now();
  self.postMessage({type:'progress',message:`Rendering ${fixture.referenceFactor}× host-rate reference…`});
  const before=performance.now(),channels=referenceChannels(module,fixture),referenceMs=performance.now()-before,reference=analyseSpectralChannels(channels,fixture),refRow={id:'reference',name:`${fixture.referenceFactor}× host rate · filtered reference`,renderMs:referenceMs,channels,...reference};
  const variants=fixture.kind==='fm'?[['q0','1× FM',0,false],['q1','2× FM',1,false],['q2','4× FM',2,false]]:[['previous','Previous edge handling',0,true],['native','Refined edge handling',0,false]];
  for(const [id,name,quality,legacyEdges]of variants){
   self.postMessage({type:'progress',message:`Rendering ${name}…`});
   const start=performance.now(),pcm=renderSpectralKernel(module,fixture,fixture.config.rate,quality,{legacyEdges}),renderMs=performance.now()-start;
   rows.push({id,name,quality,renderMs,channels:pcm,...analyseSpectralChannels(pcm,fixture,reference.spectrum)});
  }
  rows.push(refRow);const result={fixture,rows,totalMs:performance.now()-started};
  self.postMessage({type:'result',result},rows.flatMap(r=>[...r.channels.map(c=>c.buffer),r.spectrum.power.buffer]));
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
