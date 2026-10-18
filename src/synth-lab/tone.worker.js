import {toneFixture,toneVariants} from './toneFixtures';
import {renderSpectralKernel} from './spectralEngine';
import {stereoMeasure,impulseResponse,responseCurve,filterSummary,chorusProbe,deterministicNoise} from './toneAnalysis';
let modulePromise;
self.onmessage=async({data})=>{
 try{
  modulePromise??=fetch(`${import.meta.env.BASE_URL}synth-lab/core.wasm`).then(async r=>{if(!r.ok)throw Error('DSP kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modulePromise=null;throw e;});
  const module=await modulePromise,fixture=toneFixture(data.config),variants=toneVariants(fixture.config.target),rows=[];
  const count=data.benchmark?4:1;
  for(let run=0;run<count;run++)for(const variant of run%2?[...variants].reverse():variants){
   self.postMessage({type:'progress',message:`${data.benchmark&&run===0?'Warm-up':'Render'} ${run+1}/${count} · ${variant.name}…`});
   const f=variant.chorusOff?{...fixture,patch:{...fixture.patch,global:{...fixture.patch.global,chorus:0}}}:fixture;
   const start=performance.now(),channels=renderSpectralKernel(module,f,fixture.config.rate,0,variant),ms=performance.now()-start,metrics=stereoMeasure(channels);
   if(metrics.peak>=1||metrics.rms<1e-8)throw Error('Clipped or silent musical passage.');
   let row=rows.find(r=>r.id===variant.id);if(!row){row={id:variant.id,name:variant.name,runs:[]};rows.push(row);}row.runs.push(ms);if(run===count-1){row.channels=channels;row.metrics=metrics;}
  }
  rows.sort((a,b)=>variants.findIndex(v=>v.id===a.id)-variants.findIndex(v=>v.id===b.id));for(const row of rows){const sorted=[...(data.benchmark?row.runs.slice(1):row.runs)].sort((a,b)=>a-b);row.renderMs=sorted[Math.floor(sorted.length/2)];}
  self.postMessage({type:'progress',message:'Measuring the isolated filter/chorus component…'});
  const curves=[],config=fixture.config;
  for(const modern of [false,true]){
   const id=modern?'refined':'previous';
   if(config.target==='filter'){
    const response=responseCurve(impulseResponse(module,{...config,response:fixture.response,family:fixture.family},{modern}),config.rate);
    curves.push({id,name:modern?'Calibrated filter':'Previous filter',...response,summary:filterSummary(response,config.cutoff)});
   }else{
    const noise=deterministicNoise(config.rate),output=chorusProbe(module,noise,config,{modern}),skip=Math.round(.05*config.rate),dry=stereoMeasure(noise.map(ch=>ch.slice(skip))),wet=stereoMeasure(output.map(ch=>ch.slice(skip)));
    const impulse=new Float32Array(65536);impulse[0]=.001;const frozen=chorusProbe(module,[impulse,impulse],{...config,amount:.8,speed:0},{modern,wetOnly:true,phase:.125});
    curves.push({id,name:modern?'Refined chorus':'Previous chorus',plotName:modern?'Refined wet interpolation':'Previous wet interpolation',...responseCurve(frozen[0],config.rate),summary:{...wet,levelDb:20*Math.log10(wet.rms/dry.rms)}});
   }
  }
  const result={fixture,rows,curves,benchmark:!!data.benchmark};self.postMessage({type:'result',result},[...rows.flatMap(r=>r.channels.map(c=>c.buffer)),...curves.map(c=>c.db.buffer)]);
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
