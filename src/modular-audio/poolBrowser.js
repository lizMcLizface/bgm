import {workerOptions} from './workerProtocol';
import {planSourcePool} from './poolPlan';
import {createWorkerRoute} from './workerBrowser';
const base=`${import.meta.env.BASE_URL}modular-audio/`;
let generation=0;
const registered=new WeakMap();

export async function createPoolRoute(context,assets,patch,{options={},groups,forceFallback=false,onFinished=()=>{}}={}){
  const o=workerOptions({...options,generation:++generation}),end=Math.round(assets.fixture.totalSeconds*context.sampleRate),workers=[],channels=[],pending=new Map(),last=[];
  let node,plan,error=null,disposed=false,next=0,outputStats=null;
  const rejectAll=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  const fail=e=>{error=String(e);rejectAll(Error(error));node?.port.postMessage({type:'failure'});};
  const request=(group,message)=>new Promise((resolve,reject)=>{
    if(disposed||error||pending.size>=64){reject(Error(error||'Pool disposed or control capacity exceeded'));return;}
    const request=++next,timer=setTimeout(()=>{pending.delete(request);reject(Error('Pool control timeout'));},3000);pending.set(request,{resolve,reject,timer});workers[group].postMessage({...message,request,generation:o.generation});
  });
  const deadline=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Pool initialization timeout')),10000))]);}finally{clearTimeout(timer);}};
  const discard=()=>{node?.port.postMessage({type:'dispose'});node?.disconnect();node?.port.close();workers.forEach(w=>w.terminate());channels.forEach(c=>{c.port1.close();c.port2.close();});};
  try{
    if(forceFallback||typeof Worker==='undefined'||typeof MessageChannel==='undefined')throw Error(forceFallback?'Pool serial fallback explicitly selected':'Worker/MessageChannel unavailable');
    plan=planSourcePool(patch,assets.contracts,groups);
    if(!registered.has(context))registered.set(context,context.audioWorklet.addModule(base+`pool-output-processor.js?v=${assets.manifest.version}`));await registered.get(context);
    let readyResolve,readyReject,primeResolve,primeReject;
    const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),primed=new Promise((r,j)=>{primeResolve=r;primeReject=j;});primed.catch(()=>{});
    node=new AudioWorkletNode(context,'calmbgm-pool-output',{numberOfInputs:0,numberOfOutputs:8,outputChannelCount:Array(8).fill(2),processorOptions:{module:assets.modules.graph,contracts:assets.contracts,patch:plan.master,groups:plan.groups,options:o,endFrame:end}});
    node.port.onmessage=({data:d})=>{
      if(d.type==='ready')readyResolve(d);if(d.type==='primed')primeResolve(d);
      if(d.type==='error'){readyReject(Error(d.message));primeReject(Error(d.message));fail(d.message);}
      if(d.type==='finished')onFinished();
      if(d.type==='stats'){outputStats=d;const p=pending.get('output');if(p){clearTimeout(p.timer);pending.delete('output');p.resolve(d);}}
    };
    node.onprocessorerror=()=>{const e=Error('Pool output processor failed');readyReject(e);primeReject(e);fail(e);};await deadline(ready);
    await deadline(Promise.all(plan.groups.map((sourceIds,group)=>new Promise((resolve,reject)=>{
      const worker=new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module',name:`source-pool-${o.generation}-${group}`}),channel=new MessageChannel();workers.push(worker);channels.push(channel);
      worker.onmessage=({data:d})=>{
        if(d.type==='ready')resolve(d);
        if(d.type==='error'){reject(Error(d.message));fail(d.message);}
        if(d.type==='stats')last[group]=d;
        const p=pending.get(d.request);if(p){clearTimeout(p.timer);pending.delete(d.request);if(d.type==='rejected')p.reject(Error(d.message));else p.resolve(d);}
      };
      worker.onerror=e=>{reject(Error(e.message||'Pool worker failed'));fail(e.message||'Pool worker failed');};
      node.port.postMessage({type:'connect',group,port:channel.port2},[channel.port2]);
      worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch:plan.sources[group],sourceIds,rate:context.sampleRate,endFrame:end,options:o,port:channel.port1},[channel.port1]);
    }))));await deadline(primed);
    return {node,end,options:o,executor:{requested:'pool',actual:'pool',workers:workers.length,groups:plan.groups,masterLevels:plan.levels,bufferingLatencyFrames:o.delayFrames,bufferingLatencyMs:o.delayFrames/context.sampleRate*1000,pcmPoolBytes:o.bufferBytes*o.poolBlocks*workers.length,transport:`${workers.length} independent worker PCM pools; Rust master in worklet`,fallbackReason:null},
      check(){if(error)throw Error(error);},
      async stats(){
        if(pending.has('output')||pending.size+workers.length+1>64)throw Error('Pool stats already pending or control capacity exceeded');
        const out=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete('output');reject(Error('Pool output stats timeout'));},3000);pending.set('output',{resolve,reject,timer});node.port.postMessage({type:'stats'});});
        const [output,engine]=await Promise.all([out,error?Promise.resolve(last):Promise.all(workers.map((_,group)=>request(group,{type:'stats'})))]);return {output,workers:engine,error};
      },
      stall(ms,group=0){if(!workers[group])throw Error('Invalid worker group');return request(group,{type:'stall',ms});},
      enqueue(event){
        const group=plan.sourceGroup.get(event.target);if(group===undefined||!Number.isInteger(event.owner)||event.owner<1||event.owner>0xffffffff)throw Error('Pool live event must target an owned source');
        if(plan.owners.has(event.owner)&&plan.owners.get(event.owner)!==group)throw Error('Cross-worker event owner is unsupported');
        if(!plan.owners.has(event.owner)&&plan.owners.size>=4096)throw Error('Pool owner capacity exceeded');plan.owners.set(event.owner,group);
        return request(group,{type:'event',event});
      },
      dispose(){if(disposed)return;disposed=true;rejectAll(Error('Pool disposed'));node.port.postMessage({type:'dispose'});node.disconnect();workers.forEach(w=>w.postMessage({type:'dispose'}));setTimeout(()=>{workers.forEach(w=>w.terminate());node.port.close();},100);},
      get lastStats(){return {output:outputStats,workers:last};}
    };
  }catch(e){
    discard();rejectAll(Error('Pool preparation discarded'));
    const fallback=await createWorkerRoute(context,assets,patch,{mode:'serial',options,onFinished});
    fallback.executor={...fallback.executor,requested:'pool',fallbackReason:String(e),workers:0};return fallback;
  }
}
