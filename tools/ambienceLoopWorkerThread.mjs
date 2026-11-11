// Node oracle adapter executes the exact public worker source in a real thread.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(data,transfer=[])=>parentPort.postMessage(data,transfer)};
await import('../public/ambience-loops/prepare-worker.js');
parentPort.on('message',data=>self.onmessage({data}));
