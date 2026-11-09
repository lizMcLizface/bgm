import {ReferenceGraph} from './runtime';
import {workerOptions,sourceViews,copyGraph} from './workerProtocol';
import {sixSourceDag} from './pitchedFixture';
const base=`${import.meta.env.BASE_URL}modular-audio/`;

// Consumer-paced exact check in a real Worker. It is not an OfflineAudioContext
// deadline benchmark (an offline context can outrun an asynchronous producer).
export async function verifyWorker(assets,rate,{makeWorker=()=>new Worker(base+`graph-worker.js?v=${assets.manifest.version}`,{type:'module'}),generation=1,seconds=assets.fixture.totalSeconds}={}) {
  const options=workerOptions({generation}),endFrame=Math.round(seconds*rate),patch=sixSourceDag(assets.fixture,rate),worker=makeWorker(),channel=new MessageChannel();
  const serial=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,options.blockFrames),views=sourceViews(serial),expected=new Float32Array(options.bufferBytes/4);
  let frame=0,blocks=0,maxAbs=0,nonFinite=0,rejectedPast=false,acceptedFuture=false,controlFrame=options.blockFrames*32,appliedControl=false,timeout;
  try{return await new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Worker verification timed out')),120000);
    const finish=()=>worker.postMessage({type:'stats',request:99,generation});
    worker.onerror=e=>reject(Error(e.message||'Worker failed'));
    worker.onmessage=({data:d})=>{
      if(d.type==='error')reject(Error(d.message));
      if(d.request===1&&d.type==='rejected')rejectedPast=true;
      if(d.request===2&&d.type==='accepted')acceptedFuture=true;
      if(d.request===99&&d.type==='stats')resolve({pass:maxAbs===0&&nonFinite===0&&rejectedPast&&(endFrame<=controlFrame||acceptedFuture),rate,frames:frame,blocks,maxAbs,nonFinite,rejectedPast,acceptedFuture,worker:d,options});
    };
    channel.port2.onmessage=({data:b})=>{
      try{
        if(b.type!=='block')return;
        if(b.frame!==frame||b.generation!==generation||b.buffer.byteLength!==options.bufferBytes)throw Error('Invalid worker publication');
        if(frame===0){
          worker.postMessage({type:'event',request:1,generation,event:{kind:'cancel',owner:1,target:1,frame:0}});
          if(endFrame>controlFrame)worker.postMessage({type:'event',request:2,generation,event:{kind:'cancel',owner:1,target:1,frame:controlFrame}});
        }
        if(!appliedControl&&frame===controlFrame){serial.enqueue({kind:'cancel',owner:1,target:1,frame:controlFrame});appliedControl=true;}
        serial.render(b.n);copyGraph(serial,views,expected,b.n);const actual=new Float32Array(b.buffer);
        for(let i=0;i<b.n*16;i++){if(!Number.isFinite(actual[i]))nonFinite++;maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));}
        frame+=b.n;blocks++;
        channel.port2.postMessage({type:'recycle',generation,slot:b.slot,buffer:b.buffer},[b.buffer]);
        if(frame===endFrame)finish();
      }catch(e){reject(e);}
    };
    worker.postMessage({type:'init',module:assets.modules.graph,contracts:assets.contracts,patch,rate,endFrame,options,port:channel.port1},[channel.port1]);
  });}finally{clearTimeout(timeout);worker.terminate();channel.port2.close();serial.dispose();}
}
