import {qualityFixture,qualityMeasure} from './qualityFixtures';
import {renderSpectralKernel} from './spectralEngine';
const modules=new Map();
self.onmessage=async({data})=>{
 try{
  const fixture=qualityFixture(data.config),kind=fixture.kind;
  if(!modules.has(kind))modules.set(kind,fetch(`${import.meta.env.BASE_URL}synth-lab/${kind==='fm'?'fm':'core'}.wasm`).then(async r=>{if(!r.ok)throw Error('DSP kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modules.delete(kind);throw e;}));
  const module=await modules.get(kind),variants=kind==='fm'?[['q1','2× FM',1,false],['q2','4× FM',2,false],['q0','1× FM',0,false]]:[['previous','Previous edge handling',0,true],['refined','Refined edge handling',0,false]],rows=[];
  // Exclude one warm-up per path, then alternate order for three measured runs.
  const count=data.benchmark?4:1;
  for(let run=0;run<count;run++)for(const [id,name,quality,legacyEdges]of run%2?[...variants].reverse():variants){
   self.postMessage({type:'progress',message:`${data.benchmark&&run===0?'Warm-up':'Render'} ${run+1}/${count} · ${name}…`});
   const start=performance.now(),channels=renderSpectralKernel(module,fixture,fixture.config.rate,quality,{legacyEdges}),ms=performance.now()-start,metrics=qualityMeasure(channels);
   let row=rows.find(r=>r.id===id);if(!row){row={id,name,metrics,runs:[]};rows.push(row);}row.runs.push(ms);if(run===count-1){row.channels=channels;row.metrics=metrics;}
  }
  rows.sort((a,b)=>variants.findIndex(v=>v[0]===a.id)-variants.findIndex(v=>v[0]===b.id));
  for(const row of rows){const values=[...(data.benchmark?row.runs.slice(1):row.runs)].sort((a,b)=>a-b);row.renderMs=values[Math.floor(values.length/2)];}
  const result={fixture,rows,benchmark:!!data.benchmark};self.postMessage({type:'result',result},rows.flatMap(r=>r.channels.map(c=>c.buffer)));
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
