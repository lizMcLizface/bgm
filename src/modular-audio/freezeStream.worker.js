import {FreezeStreamWorker} from './freezeStreamWorker.js';
const core=new FreezeStreamWorker(self);
self.onmessage=({data})=>{try{if(data?.type==='init')core.init(data);else if(data?.type==='dispose')core.dispose(data.request);else if(data?.type==='stats')self.postMessage({type:'stats',request:data.request,stats:core.stats()});else throw Error('Invalid Freeze Worker host message');}catch(error){core.fail(error);}};
