import {behaviorFixture} from './behaviorFixtures';
import {makeWasmNode} from './backend';
import {makeFMNode} from './fmBackend';
import {measure} from './bench';
export async function renderBehavior(raw,{signal,onProgress=()=>{}}={}){
 const f=behaviorFixture(raw),rows=[];
 for(const r of f.rows){
  if(signal?.aborted)throw Error('Render cancelled.');onProgress('Rendering '+r.name+'…');const start=performance.now(),context=new OfflineAudioContext(2,Math.ceil(f.seconds*f.config.rate),f.config.rate);let node,error;
  const abort=()=>{node?.port.postMessage({type:'dispose'});};signal?.addEventListener('abort',abort,{once:true});
  try{node=await(f.kind==='fm'?makeFMNode:makeWasmNode)(context,r.patch,{offline:true,events:r.events,patches:r.patches,onError:e=>{error=e;}});if(signal?.aborted)throw Error('Render cancelled.');node.connect(context.destination);const prepared=performance.now(),buffer=await context.startRendering(),done=performance.now();if(signal?.aborted)throw Error('Render cancelled.');if(error)throw error;const metrics=measure(buffer);if(metrics.nonFinite||metrics.rms<1e-8)throw Error('Invalid behavior render.');rows.push({id:r.id,name:r.name,patch:r.patch,patches:r.patches,channels:[buffer.getChannelData(0).slice(),buffer.getChannelData(1).slice()],metrics,prepareMs:prepared-start,renderMs:done-prepared});}
  finally{signal?.removeEventListener('abort',abort);node?.disconnect();node?.port.close();}
 }
 const {rows:variants,...fixture}=f;return {fixture,rows,benchmark:false};
}
