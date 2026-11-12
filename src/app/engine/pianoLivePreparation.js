// Each controller owns at most two workers; partial setup is its own lifetime.
export function createPianoLivePreparation(){
 if(typeof Worker==='undefined')throw Error('Owned live piano requires its preparation worker');
 let disposed=false,next=1,disposalError=null;const slots=[],queue=[];
 function dispose(){
  if(disposed){if(disposalError)throw disposalError;return;}disposed=true;const errors=[];
  for(const slot of slots){try{slot.worker.terminate();slot.terminated=true;}catch(error){errors.push(error);}slot.job?.reject(Error('Owned piano preparation disposed'));slot.job=null;}
  for(const job of queue)job.reject(Error('Owned piano preparation disposed'));queue.length=0;
  if(errors.length)throw disposalError=new AggregateError(errors,'Owned piano preparation worker cleanup failed');
 }
 function constructionFailure(error){
  try{dispose();}catch(cleanupError){error.cleanupError=cleanupError;}
  error.cleanupReady=error.cleanupError?Promise.reject(error.cleanupError):Promise.resolve({clean:true,workers:slots.length,terminated:slots.filter(slot=>slot.terminated).length});
  error.cleanupReady.catch(()=>{});return error;
 }
 function start(slot){if(disposed||slot.job||!queue.length)return;slot.job=queue.shift();try{slot.worker.postMessage({...slot.job.message,id:slot.job.id,renderer:'rust'});}catch(error){const job=slot.job;slot.job=null;job.reject(constructionFailure(error));}}
 try{
  const count=Math.max(1,Math.min(2,(globalThis.navigator?.hardwareConcurrency??4)-2));
  for(let i=0;i<count;i++){const slot={worker:new Worker(new URL('./piano.worker.js',import.meta.url),{type:'module'}),job:null,terminated:false};slots.push(slot);
   slot.worker.onmessage=({data})=>{if(disposed)return;const job=slot.job;slot.job=null;if(job){if(data.id!==job.id||data.error||data.renderer!=='rust')job.reject(Error(data.error??'Owned piano worker returned an unexpected renderer'));else job.resolve(data);}start(slot);};
   slot.worker.onerror=event=>{if(disposed)return;const job=slot.job;slot.job=null;job?.reject(Error(event.message??'Owned piano preparation failed'));start(slot);};
  }
 }catch(error){throw constructionFailure(error);}
 return{prepare(message){if(disposed)return Promise.reject(Error('Disposed owned piano preparation'));if(queue.length>=2000)return Promise.reject(Error('Owned piano preparation queue capacity exceeded'));return new Promise((resolve,reject)=>{queue.push({id:next++,message,resolve,reject});slots.forEach(start);});},dispose};
}
