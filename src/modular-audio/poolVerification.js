import {ReferenceGraph} from './runtime';
import {workerOptions,sourceViews,copyGraph} from './workerProtocol';
import {sixSourceDag} from './pitchedFixture';
import {planSourcePool} from './poolPlan';
import {AlignedSourcePool} from './poolProtocol';
const base=`${import.meta.env.BASE_URL}modular-audio/`;

export async function verifyPool(assets,rate,{makeWorker=()=>new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module'}),generation=1,seconds=assets.fixture.totalSeconds}={}){
  const o=workerOptions({generation}),patch=sixSourceDag(assets.fixture,rate),plan=planSourcePool(patch,assets.contracts),end=Math.round(seconds*rate),workers=plan.groups.map(()=>makeWorker()),channels=workers.map(()=>new MessageChannel());
  const master=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,plan.master,assets.contracts,rate,o.blockFrames),serial=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,o.blockFrames);
  const inputs=Array.from({length:7},(_,i)=>master.inputs.get(i+1)),reference=sourceViews(serial),actual=new Float32Array(o.bufferBytes/4),expected=new Float32Array(o.bufferBytes/4);
  const pool=new AlignedSourcePool(o,end,plan.groups,(group,b)=>channels[group].port2.postMessage({type:'recycle',generation,slot:b.slot,buffer:b.buffer},[b.buffer]));
  let frame=0,blocks=0,maxAbs=0,nonFinite=0,rejectedPast=false,acceptedFuture=false,controlSent=false,timeout;const controlFrame=o.blockFrames*32,snapshots=Array(workers.length).fill(null);
  try{return await new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Pool verification timed out')),180000);
    const consume=()=>{
      while(frame<end&&pool.queues.every(q=>q.slots.some(b=>b?.frame===frame))){
        const n=Math.min(o.blockFrames,end-frame);pool.fill(inputs,n);
        for(let bus=0;bus<7;bus++)for(let i=0;i<n*2;i++)actual[bus*n*2+i]=inputs[bus][i];
        master.render(n);for(let i=0;i<n;i++){actual[7*n*2+i*2]=master.left[i];actual[7*n*2+i*2+1]=master.right[i];}
        serial.render(n);copyGraph(serial,reference,expected,n);
        for(let i=0;i<n*16;i++){if(!Number.isFinite(actual[i]))nonFinite++;maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));}frame+=n;blocks++;
      }
      if(frame===end)workers.forEach(w=>w.postMessage({type:'stats',request:99,generation}));
    };
    workers.forEach((worker,group)=>{
      worker.onerror=e=>reject(Error(e.message||'Source worker failed'));
      worker.onmessage=({data:d})=>{
        if(d.type==='error')reject(Error(d.message));
        if(group===0&&d.request===1&&d.type==='rejected')rejectedPast=true;
        if(group===0&&d.request===2&&d.type==='accepted')acceptedFuture=true;
        if(d.request===99&&d.type==='stats'){
          snapshots[group]=d;
          if(snapshots.every(Boolean))resolve({pass:maxAbs===0&&nonFinite===0&&rejectedPast&&(end<=controlFrame||acceptedFuture)&&pool.counters.underrunFrames===0,rate,frames:frame,blocks,maxAbs,nonFinite,rejectedPast,acceptedFuture,groups:plan.groups,masterLevels:plan.levels,workers:snapshots,master:master.stats(),serial:serial.stats(),queue:pool.stats(),options:o});
        }
      };
      channels[group].port2.onmessage=({data:b})=>{try{
        if(b.type!=='block')return;
        if(group===0&&!controlSent){controlSent=true;worker.postMessage({type:'event',request:1,generation,event:{kind:'cancel',owner:1,target:1,frame:0}});if(end>controlFrame){const event={kind:'cancel',owner:1,target:1,frame:controlFrame};serial.enqueue(event);worker.postMessage({type:'event',request:2,generation,event});}}
        if(!pool.accept(group,b))throw Error('Rejected pool publication');consume();
      }catch(e){reject(e);}};
      worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch:plan.sources[group],sourceIds:plan.groups[group],rate,endFrame:end,options:o,port:channels[group].port1},[channels[group].port1]);
    });
  });}finally{clearTimeout(timeout);workers.forEach(w=>w.terminate());channels.forEach(c=>c.port2.close());master.dispose();serial.dispose();}
}
