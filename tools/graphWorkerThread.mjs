// Test adapter only: run the unchanged browser worker entry on a real Node
// worker thread, retaining actual structured cloning and buffer transfers.
import {parentPort} from 'node:worker_threads';
globalThis.postMessage=(data,transfer=[])=>parentPort.postMessage(data,transfer);
globalThis.close=()=>parentPort.close();
await import('../src/modular-audio/graphWorker.js');
parentPort.on('message',data=>globalThis.onmessage({data}));
