// Audio scheduling still happens on the main thread; a Worker only wakes it.
// This avoids the ordinary timer throttle, without pretending to prevent page
// freezing or an operating system suspending the AudioContext.
export const TICKER_WORKER_SOURCE='let id=null,pending=false;onmessage=(e)=>{if(e.data==="ack"){pending=false;return;}clearInterval(id);id=null;pending=false;if(e.data>0)id=setInterval(()=>{if(!pending){pending=true;postMessage(0);}},e.data)};';
export function startTicker(callback,interval){
 try{
  const url=URL.createObjectURL(new Blob([TICKER_WORKER_SOURCE],{type:'text/javascript'}));
  let worker;try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
  const ticker={worker,stopped:false};worker.onmessage=e=>{if(ticker.stopped)return;try{callback(e);}finally{if(!ticker.stopped)worker.postMessage('ack');}};worker.postMessage(interval);return ticker;
 }catch{return {id:setInterval(callback,interval)};}
}
export function stopTicker(ticker){
 ticker.stopped=true;
 if(ticker.worker){ticker.worker.onmessage=null;ticker.worker.postMessage(0);ticker.worker.terminate();}
 else clearInterval(ticker.id);
}
