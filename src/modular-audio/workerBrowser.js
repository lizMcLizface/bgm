import {workerOptions,sourceSelection} from './workerProtocol';
const base=`${import.meta.env.BASE_URL}modular-audio/`;
let generation=0;
const registered=new WeakMap();
function register(context,version){if(!registered.has(context))registered.set(context,context.audioWorklet.addModule(base+`worker-output-processor.js?v=${version}`));return registered.get(context);}

// Startup fallback only. A worker failing after playback starts must fail closed;
// reconstructing its ahead-of-audio state inside process() would block the clock.
export async function createWorkerRoute(context,assets,patch,{mode='worker',options={},forceFallback=false,onFinished=()=>{},sourceIds=null,endFrame,startPaused=false}={}) {
  sourceIds=sourceSelection(sourceIds);if(typeof startPaused!=='boolean')throw Error('Invalid manual start');
  const o=workerOptions({...options,generation:++generation}),end=endFrame??Math.round(assets.fixture.totalSeconds*context.sampleRate);
  if(!Number.isSafeInteger(end+o.delayFrames)||end<1)throw Error('Invalid source end frame');
  await register(context,assets.manifest.version);
  let worker,node,channel,timer,disposed=false,nextRequest=0,lastOutput,lastWorker,error=null;
  const pending=new Map();
  const rejectAll=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  const fail=e=>{error=String(e);rejectAll(Error(error));node?.port.postMessage({type:'failure'});};
  const request=(target,message)=>new Promise((resolve,reject)=>{if(pending.size>=64){reject(Error('Worker control capacity exceeded'));return;}const request=++nextRequest,timer=setTimeout(()=>{pending.delete(request);reject(Error('Worker control timeout'));},3000);pending.set(request,{resolve,reject,timer});target.postMessage({...message,request,generation:o.generation});});
  function reply(d){if(d.type==='error')fail(d.message);if(d.type==='stats')lastWorker=d;const p=pending.get(d.request);if(p){clearTimeout(p.timer);pending.delete(d.request);if(d.type==='rejected')p.reject(Error(d.message));else p.resolve(d);}}
  function makeNode(actual){
    let readyResolve,readyReject,primeResolve,primeReject;
    const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),primed=new Promise((r,j)=>{primeResolve=r;primeReject=j;});
    // Mark the second promise handled even if ready fails first.
    primed.catch(()=>{});
    node=new AudioWorkletNode(context,'calmbgm-worker-output',{numberOfInputs:0,numberOfOutputs:8,outputChannelCount:Array(8).fill(2),processorOptions:{mode:actual,options:o,endFrame:end,sourceIds,startPaused,...(actual==='serial'?{module:assets.modules.graph,contracts:assets.contracts,patch}:{})}});
    node.port.onmessage=({data:d})=>{
      if(d.type==='ready')readyResolve(d);
      if(d.type==='primed')primeResolve(d);
      if(d.type==='stats'){lastOutput=d;const p=pending.get('output');if(p){clearTimeout(p.timer);pending.delete('output');p.resolve(d);}}
      if(d.type==='finished')onFinished();
      if(d.type==='error'){const e=Error(d.message);readyReject(e);primeReject(e);fail(e);}
    };
    node.onprocessorerror=()=>{const e=Error('Worker output processor failed');readyReject(e);primeReject(e);fail(e);};
    return {ready,primed};
  }
  let actual=mode,fallbackReason=null,started=!startPaused;
  const withTimeout=p=>Promise.race([p,new Promise((_,j)=>timer=setTimeout(()=>j(Error('Worker initialization timeout')),10000))]).finally(()=>clearTimeout(timer));
  const discard=()=>{node?.port.postMessage({type:'dispose'});node?.disconnect();node?.port.close();worker?.terminate();channel?.port1.close();channel?.port2.close();};
  try{
    if(mode==='worker'){
      try{
        if(forceFallback||typeof Worker==='undefined'||typeof MessageChannel==='undefined')throw Error(forceFallback?'Serial fallback explicitly selected':'Worker/MessageChannel unavailable');
        const output=makeNode('worker');await withTimeout(output.ready);
        channel=new MessageChannel();
        worker=new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module',name:`modular-audio-${o.generation}`});
        const ready=new Promise((resolve,reject)=>{worker.onmessage=({data:d})=>{if(d.type==='ready')resolve(d);else if(d.type==='error'){reject(Error(d.message));reply(d);}else reply(d);};worker.onerror=e=>{reject(Error(e.message||'Worker startup failed'));fail(e.message||'Worker failed');};});
        node.port.postMessage({type:'connect',port:channel.port2},[channel.port2]);
        worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch,rate:context.sampleRate,endFrame:end,sourceIds,options:o,port:channel.port1},[channel.port1]);
        await withTimeout(ready);await withTimeout(output.primed);
      }catch(e){fallbackReason=String(e);discard();worker=null;channel=null;error=null;actual='serial';await withTimeout(makeNode('serial').ready);}
    }else if(mode==='serial')await withTimeout(makeNode('serial').ready);
    else throw Error('Invalid executor mode');
    return {node,end,options:o,executor:{requested:mode,actual,fallbackReason,sourceIds,manualStart:startPaused,scheduling:actual==='worker'?o.scheduling:null,blockFrames:o.blockFrames,poolBlocks:o.poolBlocks,renderAheadCapacityFrames:o.delayFrames,bufferingLatencyFrames:o.delayFrames,bufferingLatencyMs:o.delayFrames/context.sampleRate*1000,pcmPoolBytes:actual==='worker'?o.bufferBytes*o.poolBlocks:0,transport:actual==='worker'?'transferable MessagePort; no shared Wasm memory':'in-worklet serial Rust; no PCM transport'},
      start(){if(disposed||started)throw Error('Route already started or disposed');started=true;node.port.postMessage({type:'start'});},
      check(){if(error)throw Error(error);},
      async stats(){
        if(pending.has('output')||pending.size>=63)throw Error('Worker stats request already pending or control capacity exceeded');
        const output=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete('output');reject(Error('Output stats timeout'));},3000);pending.set('output',{resolve,reject,timer});node.port.postMessage({type:'stats'});});
        const [out,engine]=await Promise.all([output,worker&&!error?request(worker,{type:'stats'}):Promise.resolve(lastWorker??null)]);return {output:out,worker:engine,error};
      },
      stall(ms){if(!worker)throw Error('Stall requires the worker executor');return request(worker,{type:'stall',ms});},
      enqueue(event){if(!worker)throw Error('This prototype exposes live events through the worker control port only');return request(worker,{type:'event',event});},
      dispose(){if(disposed)return;disposed=true;rejectAll(Error('Route disposed'));node.port.postMessage({type:'dispose'});node.disconnect();worker?.postMessage({type:'dispose'});setTimeout(()=>{worker?.terminate();node.port.close();},100);},
      get lastStats(){return {output:lastOutput,worker:lastWorker};}
    };
  }catch(e){discard();throw e;}
}
