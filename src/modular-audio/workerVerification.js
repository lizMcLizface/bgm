import {ReferenceGraph} from './runtime';
import {workerOptions,sourceViews,copyGraph} from './workerProtocol';
import {sixSourceDag} from './pitchedFixture';
import {subnormalPair,CROSS_CADENCE_POLICY} from './pcmComparison';
const base=`${import.meta.env.BASE_URL}modular-audio/`;

// Consumer-paced exact check in a real Worker. It is not an OfflineAudioContext
// deadline benchmark (an offline context can outrun an asynchronous producer).
export async function verifyWorker(assets,rate,{makeWorker=()=>new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module'}),generation=1,seconds=assets.fixture.totalSeconds,options:requestedOptions={},patch:requestedPatch=null}={}) {
  const options=workerOptions({...requestedOptions,generation}),endFrame=Math.round(seconds*rate),patch=requestedPatch??sixSourceDag(assets.fixture,rate);
  let worker=null,channel=null,serial=null,sameCadence=null,timeout;
  try{
  const referenceBlockFrames=Math.max(1024,options.blockFrames);serial=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,referenceBlockFrames);const views=sourceViews(serial),expected=new Float32Array(referenceBlockFrames*16);
  sameCadence=options.blockFrames===referenceBlockFrames?serial:new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,options.blockFrames);const sameViews=sourceViews(sameCadence),sameExpected=sameCadence===serial?expected:new Float32Array(options.bufferBytes/4);
  // A failed reference preparation must not start a thread or leak a graph.
  worker=makeWorker();channel=new MessageChannel();
  let frame=0,blocks=0,maxAbs=0,sameCadenceMaxAbs=0,normalRangeMaxAbs=0,subnormalDifferences=0,nonFinite=0,rejectedPast=false,acceptedFuture=false,controlFrame=32768,appliedControl=false,referenceFrames=0;
  return await new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Worker verification timed out')),120000);
    const finish=()=>worker.postMessage({type:'stats',request:99,generation});
    worker.onerror=e=>reject(Error(e.message||'Worker failed'));
    worker.onmessage=({data:d})=>{
      if(d.type==='error')reject(Error(d.message));
      if(d.request===1&&d.type==='rejected')rejectedPast=true;
      if(d.request===2&&d.type==='accepted')acceptedFuture=true;
      if(d.request===99&&d.type==='stats')resolve({pass:sameCadenceMaxAbs===0&&nonFinite===0&&rejectedPast&&(endFrame<=controlFrame||acceptedFuture),rate,frames:frame,blocks,sameCadenceMaxAbs,sameCadenceRawExact:sameCadenceMaxAbs===0,referenceBlockFrames,comparisonPolicy:CROSS_CADENCE_POLICY,rawExact:maxAbs===0,maxAbs,normalRangeMaxAbs,subnormalDifferences,nonFinite,rejectedPast,acceptedFuture,worker:d,options});
    };
    channel.port2.onmessage=({data:b})=>{
      try{
        if(b.type!=='block')return;
        if(b.frame!==frame||b.generation!==generation||b.buffer.byteLength!==options.bufferBytes)throw Error('Invalid worker publication');
        if(frame===0){
          worker.postMessage({type:'event',request:1,generation,event:{kind:'cancel',owner:1,target:1,frame:0}});
          if(endFrame>controlFrame)worker.postMessage({type:'event',request:2,generation,event:{kind:'cancel',owner:1,target:1,frame:controlFrame}});
        }
        if(!appliedControl&&frame===controlFrame){const event={kind:'cancel',owner:1,target:1,frame:controlFrame};serial.enqueue(event);if(sameCadence!==serial)sameCadence.enqueue(event);appliedControl=true;}
        if(frame%referenceBlockFrames===0){referenceFrames=Math.min(referenceBlockFrames,endFrame-frame);serial.render(referenceFrames);copyGraph(serial,views,expected,referenceFrames);}const actual=new Float32Array(b.buffer);
        if(sameCadence!==serial){sameCadence.render(b.n);copyGraph(sameCadence,sameViews,sameExpected,b.n);}
        for(let bus=0;bus<8;bus++)for(let i=0;i<b.n;i++)for(let ch=0;ch<2;ch++){const v=actual[(bus*b.n+i)*2+ch],local=sameExpected[(bus*b.n+i)*2+ch],r=expected[(bus*referenceFrames+frame%referenceBlockFrames+i)*2+ch],diff=Math.abs(v-r);if(!Number.isFinite(v)||!Number.isFinite(r)||!Number.isFinite(local))nonFinite++;sameCadenceMaxAbs=Math.max(sameCadenceMaxAbs,Math.abs(v-local));if(diff){if(subnormalPair(v,r))subnormalDifferences++;else normalRangeMaxAbs=Math.max(normalRangeMaxAbs,diff);}maxAbs=Math.max(maxAbs,diff);}
        frame+=b.n;blocks++;
        channel.port2.postMessage({type:'recycle',generation,slot:b.slot,buffer:b.buffer},[b.buffer]);
        if(frame===endFrame)finish();
      }catch(e){reject(e);}
    };
    worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch,rate,endFrame,options,port:channel.port1},[channel.port1]);
  });}finally{clearTimeout(timeout);worker?.terminate();channel?.port1.close();channel?.port2.close();if(sameCadence!==serial)sameCadence?.dispose();serial?.dispose();}
}
