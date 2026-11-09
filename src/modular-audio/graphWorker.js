import {ReferenceGraph} from './runtime.js';
import {workerOptions,sourceViews,copyGraph,graphSnapshot} from './workerProtocol.js';

// A single dedicated worker exclusively owns one Wasm instance/graph. Only PCM
// buffers cross threads. Control messages are serviced between bounded blocks.
let g, views, o, port, sourceIds=null, end=0, frame=0, free=[], inFlight, timer=null, stopped=false, stallUntil=0;
let blocks=0, renderMs=0, maxRenderMs=0, rejectedEvents=0, badRecycles=0;
const histogram=new Uint32Array(32);
function snapshot(){return {generation:o.generation,sourceIds,frame,blocks,renderMs,maxRenderMs,blockMsHistogramLog2Us:Array.from(histogram),rejectedEvents,badRecycles,freeBuffers:free.length,inFlightBuffers:inFlight.filter(Boolean).length,...graphSnapshot(g,sourceIds)};}
function fail(e){stopped=true;clearTimeout(timer);postMessage({type:'error',message:String(e)});}
function schedule(){if(!stopped&&timer===null&&free.length&&frame<end)timer=setTimeout(pump,Math.max(0,stallUntil-performance.now()));}
function pump(){timer=null;if(stopped||!free.length||frame>=end)return;if(performance.now()<stallUntil){schedule();return;}
  try{
    const slot=free.pop(),n=Math.min(o.blockFrames,end-frame),pcm=new Float32Array(slot.buffer),start=performance.now();
    g.render(n);copyGraph(g,views,pcm,n,!!sourceIds);
    const elapsed=performance.now()-start;renderMs+=elapsed;maxRenderMs=Math.max(maxRenderMs,elapsed);histogram[Math.min(31,Math.max(0,Math.ceil(Math.log2(Math.max(1,elapsed*1000)))))]++;blocks++;
    inFlight[slot.slot]=true;port.postMessage({type:'block',generation:o.generation,slot:slot.slot,frame,n,buffer:slot.buffer},[slot.buffer]);frame+=n;schedule();
  }catch(e){fail(e);}
}
globalThis.onmessage=({data:d})=>{
  try{
    if(d.type==='init'){
      if(g||stopped)throw Error('Worker is single-generation; replace it to reset');
      o=workerOptions(d.options);if(!Number.isSafeInteger(d.endFrame)||d.endFrame<1)throw Error('Invalid score end');end=d.endFrame;port=d.port;
      sourceIds=d.sourceIds??null;if(sourceIds&&(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>6||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>!Number.isInteger(id)||id<1||id>6)))throw Error('Invalid source group');
      g=new ReferenceGraph(new WebAssembly.Instance(d.module,{}).exports,d.patch,d.contracts,d.rate,o.blockFrames);views=sourceViews(g,sourceIds);
      inFlight=Array(o.poolBlocks).fill(false);free=Array.from({length:o.poolBlocks},(_,slot)=>({slot,buffer:new ArrayBuffer(o.bufferBytes)}));
      port.onmessage=({data:b})=>{if(stopped)return;if(b.type!=='recycle'||b.generation!==o.generation||!Number.isInteger(b.slot)||!inFlight[b.slot]||b.buffer?.byteLength!==o.bufferBytes){badRecycles++;return;}inFlight[b.slot]=false;free.push({slot:b.slot,buffer:b.buffer});schedule();};
      postMessage({type:'ready',options:o,memoryBytes:g.engine.memory.buffer.byteLength});schedule();return;
    }
    if(d.type==='dispose'){stopped=true;clearTimeout(timer);g?.dispose();port?.close();postMessage({type:'disposed'});close();return;}
    if(!g||stopped)throw Error('Worker is not running');
    if(d.generation!==o.generation){postMessage({type:'rejected',request:d.request,message:'Stale generation'});return;}
    if(d.type==='stats'){postMessage({type:'stats',request:d.request,...snapshot()});return;}
    if(d.type==='stall'){
      if(!Number.isFinite(d.ms)||d.ms<0||d.ms>1000)throw Error('Invalid stall');stallUntil=performance.now()+d.ms;postMessage({type:'stalled',request:d.request,ms:d.ms,frame});return;
    }
    if(d.type==='event'){
      try{if(!Number.isSafeInteger(d.event?.frame)||d.event.frame<frame)throw Error('Event is inside already-rendered lookahead');g.enqueue(d.event);postMessage({type:'accepted',request:d.request,frame,eventFrame:d.event.frame});}
      catch(e){rejectedEvents++;postMessage({type:'rejected',request:d.request,frame,message:String(e)});}return;
    }
    throw Error('Unknown worker command');
  }catch(e){fail(e);}
};
