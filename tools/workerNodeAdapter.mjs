import {Worker,MessageChannel} from 'node:worker_threads';
export {MessageChannel};
export class BrowserThreadWorker {
  constructor(){this.thread=new Worker(new URL('./graphWorkerThread.mjs',import.meta.url));this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));}
  postMessage(data,transfer=[]){this.thread.postMessage(data,transfer);}
  terminate(){return this.thread.terminate();}
}
