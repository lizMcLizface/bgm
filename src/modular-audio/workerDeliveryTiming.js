// Worker-local wall-time observations. No cross-thread clock subtraction and
// no change to when/what the producer schedules. Only explicit diagnostics use it.
export class WorkerDeliveryTiming {
 constructor(poolBlocks,clock=globalThis.performance){
  this.clock=clock;this.available=true;this.origin=this.now();this.ready=null;this.empty=null;
  this.sent=new Float64Array(poolBlocks);this.sent.fill(NaN);
  this.taskWaits=0;this.taskWaitMs=null;this.taskWaitMaxMs=0;
  this.poolWaits=0;this.poolWaitMs=null;this.poolWaitMaxMs=0;
  this.recycleRttMs=null;this.recycleRttMaxMs=0;this.lastRecycleConsumerFrame=null;
 }
 now(){try{const n=this.clock.now();if(!Number.isFinite(n))throw Error('clock');return n;}catch{this.available=false;return null;}}
 requestTask(delay){if(delay===0&&this.ready===null)this.ready=this.now();}
 beginTask(stalled=false){const now=this.now();if(!stalled&&now!==null&&this.ready!==null){this.taskWaitMs=Math.max(0,now-this.ready);this.taskWaitMaxMs=Math.max(this.taskWaitMaxMs,this.taskWaitMs);this.taskWaits++;}this.ready=null;}
 published(slot,hasMore,free){const now=this.now();this.sent[slot]=now??NaN;if(hasMore&&!free&&this.empty===null)this.empty=now;}
 recycled(slot,consumerFrame){
  const now=this.now();if(now!==null&&Number.isFinite(this.sent[slot])){this.recycleRttMs=Math.max(0,now-this.sent[slot]);this.recycleRttMaxMs=Math.max(this.recycleRttMaxMs,this.recycleRttMs);}this.sent[slot]=NaN;
  if(now!==null&&this.empty!==null){this.poolWaitMs=Math.max(0,now-this.empty);this.poolWaitMaxMs=Math.max(this.poolWaitMaxMs,this.poolWaitMs);this.poolWaits++;}this.empty=null;
  this.lastRecycleConsumerFrame=Number.isSafeInteger(consumerFrame)&&consumerFrame>=0?consumerFrame:null;
 }
 snapshot(){const now=this.now(),valid=this.available&&now!==null;return {available:valid,elapsedMs:valid?now-this.origin:null,taskWaits:this.taskWaits,taskWaitMs:valid?this.taskWaitMs:null,taskWaitMaxMs:valid?this.taskWaitMaxMs:null,poolWaits:this.poolWaits,poolWaitMs:valid?this.poolWaitMs:null,poolWaitMaxMs:valid?this.poolWaitMaxMs:null,recycleRttMs:valid?this.recycleRttMs:null,recycleRttMaxMs:valid?this.recycleRttMaxMs:null,lastRecycleConsumerFrame:this.lastRecycleConsumerFrame,readyTaskAgeMs:valid&&this.ready!==null?now-this.ready:null,poolEmptyAgeMs:valid&&this.empty!==null?now-this.empty:null};}
}

// Optional metadata cannot reject PCM or smuggle growing objects into reports.
export function packetProducerSnapshot(value){
 if(!value||value.version!==1)return null;
 const result={version:1,available:value.available===true};
 for(const key of ['frame','blocks','freeBuffers','inFlightBuffers','elapsedMs','taskWaits','taskWaitMs','taskWaitMaxMs','poolWaits','poolWaitMs','poolWaitMaxMs','recycleRttMs','recycleRttMaxMs','lastRecycleConsumerFrame','renderMs','maxRenderMs']){
  const n=value[key];result[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER?n:null;
 }
 return result;
}
