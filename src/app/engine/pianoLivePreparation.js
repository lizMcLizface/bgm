// Strict owned note preparation. Each controller owns its workers and queue;
// mutable preparation state cannot be invalidated by another instrument.
export function createPianoLivePreparation(){
 if(typeof Worker==='undefined')throw Error('Owned live piano requires its preparation worker');
 let disposed=false,next=1;const slots=Array.from({length:Math.max(1,Math.min(2,(globalThis.navigator?.hardwareConcurrency??4)-2))},()=>({worker:new Worker(new URL('./piano.worker.js',import.meta.url),{type:'module'}),job:null})),queue=[];
 function start(slot){if(disposed||slot.job||!queue.length)return;slot.job=queue.shift();slot.worker.postMessage({...slot.job.message,id:slot.job.id,renderer:'rust'});}
 for(const slot of slots){slot.worker.onmessage=({data})=>{const job=slot.job;slot.job=null;if(job){if(data.id!==job.id||data.error||data.renderer!=='rust')job.reject(Error(data.error??'Owned piano worker returned an unexpected renderer'));else job.resolve(data);}start(slot);};slot.worker.onerror=event=>{const job=slot.job;slot.job=null;job?.reject(Error(event.message??'Owned piano preparation failed'));start(slot);};}
 return{prepare(message){if(disposed)return Promise.reject(Error('Disposed owned piano preparation'));if(queue.length>=2000)return Promise.reject(Error('Owned piano preparation queue capacity exceeded'));return new Promise((resolve,reject)=>{queue.push({id:next++,message,resolve,reject});slots.forEach(start);});},dispose(){if(disposed)return;disposed=true;for(const slot of slots){slot.worker.terminate();slot.job?.reject(Error('Owned piano preparation disposed'));slot.job=null;}for(const job of queue)job.reject(Error('Owned piano preparation disposed'));queue.length=0;}};
}
