import{parentPort}from'node:worker_threads';
import{PrivateRoomProducer}from'../src/modular-audio/privateRoomProducer.js';
const producer=new PrivateRoomProducer(data=>parentPort.postMessage(data));
parentPort.on('message',data=>producer.receive(data));
