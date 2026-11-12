import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {ambienceSpatialTopologyFixture} from './ambienceSpatialTopology.fixture.js';
/** Executes the actual generated live worker, actual generated topology worklet
 * and actual Wasm. Only cross-thread delivery and Native edges are simulated. */
export function ambienceCompleteHostFixture(){
 const f=ambienceSpatialTopologyFixture();
 class Worker {
    constructor(){this.closed=false;const self={postMessage:data=>queueMicrotask(()=>{if(!this.closed)this.onmessage?.({data});})},scope={self,WebAssembly,crypto:webcrypto,Uint8Array,ArrayBuffer,Float32Array,Float64Array,Number,Map,Error};vm.createContext(scope);vm.runInContext(fs.readFileSync('public/ambience-complete/worker.js','utf8'),scope);this.self=self;}
    postMessage(data){queueMicrotask(()=>{if(!this.closed)this.self.onmessage({data});});}
    terminate(){this.closed=true;}
 }
 f.options={...f.options,WorkerClass:Worker};return f;
}
