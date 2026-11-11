import {ReferenceGraph} from './runtime';
import {workerOptions,sourceViews,copyGraph} from './workerProtocol';
import {sixSourceDag} from './pitchedFixture';
import {planSourcePool,preparePoolMaster} from './poolPlan';
import {AlignedSourcePool} from './poolProtocol';
import {subnormalPair,CROSS_CADENCE_POLICY} from './pcmComparison';
const base=`${import.meta.env.BASE_URL}modular-audio/`;

export async function verifyPool(assets,rate,{makeWorker=()=>new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module'}),generation=1,seconds=assets.fixture.totalSeconds,options:requestedOptions={},patch:requestedPatch=null}={}){
  const o=workerOptions({...requestedOptions,generation}),patch=requestedPatch??sixSourceDag(assets.fixture,rate),plan=planSourcePool(patch,assets.contracts),end=Math.round(seconds*rate),workers=[],channels=[];
  let serial=null,master=null,sameCadence=null,timeout;
  try{
  const referenceBlockFrames=Math.max(1024,o.blockFrames);serial=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,referenceBlockFrames);
  master=plan.latencyCompensation?null:new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,plan.master,assets.contracts,rate,o.blockFrames);let inputs=master?Array.from({length:7},(_,i)=>master.inputs.get(i+1)):null,sourceLatencies=null;
  sameCadence=o.blockFrames===referenceBlockFrames?serial:new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,o.blockFrames);
  // Validate/prepare reference graphs before starting native threads. Failed
  // compensation preparation must not strand workers or partial graph handles.
  for(const _group of plan.groups){workers.push(makeWorker());channels.push(new MessageChannel());}
  const readyMessages=Array(workers.length).fill(null),reference=sourceViews(serial),actual=new Float32Array(o.bufferBytes/4),expected=new Float32Array(referenceBlockFrames*16);
  const sameViews=sourceViews(sameCadence),sameExpected=sameCadence===serial?expected:new Float32Array(o.bufferBytes/4);
  const pool=new AlignedSourcePool(o,end,plan.groups,(group,b)=>channels[group].port2.postMessage({type:'recycle',generation,slot:b.slot,buffer:b.buffer},[b.buffer]));
  let frame=0,blocks=0,maxAbs=0,sameCadenceMaxAbs=0,normalRangeMaxAbs=0,sourceNormalRangeMaxAbs=0,subnormalDifferences=0,nonFinite=0,rejectedPast=false,acceptedFuture=false,controlSent=false,referenceFrames=0,firstDifference=null;const maxByBus=Array(8).fill(0),peaksByBus=Array(8).fill(0),controlFrame=32768,snapshots=Array(workers.length).fill(null);
  return await new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Pool verification timed out')),180000);
    const consume=()=>{
      if(!master)return;
      while(frame<end&&pool.queues.every(q=>q.slots.some(b=>b?.frame===frame))){
        const n=Math.min(o.blockFrames,end-frame);pool.fill(inputs,n);
        for(let bus=0;bus<7;bus++)for(let i=0;i<n*2;i++)actual[bus*n*2+i]=inputs[bus][i];
        master.render(n);for(let i=0;i<n;i++){actual[7*n*2+i*2]=master.left[i];actual[7*n*2+i*2+1]=master.right[i];}
        if(frame%referenceBlockFrames===0){referenceFrames=Math.min(referenceBlockFrames,end-frame);serial.render(referenceFrames);copyGraph(serial,reference,expected,referenceFrames);}
        if(sameCadence!==serial){sameCadence.render(n);copyGraph(sameCadence,sameViews,sameExpected,n);}
        for(let bus=0;bus<8;bus++)for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){const v=actual[(bus*n+i)*2+ch],local=sameExpected[(bus*n+i)*2+ch],r=expected[(bus*referenceFrames+frame%referenceBlockFrames+i)*2+ch],diff=Math.abs(v-r);if(!Number.isFinite(v)||!Number.isFinite(r)||!Number.isFinite(local))nonFinite++;peaksByBus[bus]=Math.max(peaksByBus[bus],Math.abs(v));sameCadenceMaxAbs=Math.max(sameCadenceMaxAbs,Math.abs(v-local));if(diff){if(!firstDifference)firstDifference={frame:frame+i,bus,channel:ch,actual:v,expected:r};if(subnormalPair(v,r))subnormalDifferences++;else{normalRangeMaxAbs=Math.max(normalRangeMaxAbs,diff);if(bus<7)sourceNormalRangeMaxAbs=Math.max(sourceNormalRangeMaxAbs,diff);}}maxByBus[bus]=Math.max(maxByBus[bus],diff);maxAbs=Math.max(maxAbs,diff);}frame+=n;blocks++;
      }
      if(frame===end)workers.forEach(w=>w.postMessage({type:'stats',request:99,generation}));
    };
    workers.forEach((worker,group)=>{
      worker.onerror=e=>reject(Error(e.message||'Source worker failed'));
      worker.onmessage=({data:d})=>{try{
        if(d.type==='error')reject(Error(d.message));
        if(d.type==='ready'&&plan.latencyCompensation){
          readyMessages[group]=d;
          if(!master&&readyMessages.every(Boolean)){const prepared=preparePoolMaster(plan,readyMessages,assets.contracts);sourceLatencies=prepared.sourceLatencies;master=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,prepared.patch,assets.contracts,rate,o.blockFrames);inputs=Array.from({length:7},(_,i)=>master.inputs.get(i+1));consume();}
        }
        if(group===0&&d.request===1&&d.type==='rejected')rejectedPast=true;
        if(group===0&&d.request===2&&d.type==='accepted')acceptedFuture=true;
        if(d.request===99&&d.type==='stats'){
          snapshots[group]=d;
          if(snapshots.every(Boolean))resolve({pass:sameCadenceMaxAbs===0&&nonFinite===0&&rejectedPast&&(end<=controlFrame||acceptedFuture)&&pool.counters.underrunFrames===0,rate,frames:frame,blocks,sameCadenceMaxAbs,sameCadenceRawExact:sameCadenceMaxAbs===0,referenceBlockFrames,comparisonPolicy:CROSS_CADENCE_POLICY,rawExact:maxAbs===0,maxAbs,maxByBus,peaksByBus,normalRangeMaxAbs,sourceNormalRangeMaxAbs,subnormalDifferences,firstDifference,nonFinite,rejectedPast,acceptedFuture,groups:plan.groups,masterLevels:plan.levels,...(sourceLatencies?{latencyCompensation:true,sourceLatencies}:{}),workers:snapshots,master:master.stats(),serial:serial.stats(),queue:pool.stats(),options:o});
        }
      }catch(e){reject(e);}};
      channels[group].port2.onmessage=({data:b})=>{try{
        if(b.type!=='block')return;
        if(group===0&&!controlSent){controlSent=true;worker.postMessage({type:'event',request:1,generation,event:{kind:'cancel',owner:1,target:1,frame:0}});if(end>controlFrame){const event={kind:'cancel',owner:1,target:1,frame:controlFrame};serial.enqueue(event);if(sameCadence!==serial)sameCadence.enqueue(event);worker.postMessage({type:'event',request:2,generation,event});}}
        if(!pool.accept(group,b))throw Error('Rejected pool publication');consume();
      }catch(e){reject(e);}};
      worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch:plan.sources[group],sourceIds:plan.groups[group],rate,endFrame:end,options:o,port:channels[group].port1},[channels[group].port1]);
    });
  });}finally{clearTimeout(timeout);workers.forEach(w=>w.terminate());channels.forEach(c=>{c.port1.close();c.port2.close();});master?.dispose();if(sameCadence!==serial)sameCadence?.dispose();serial?.dispose();}
}
