import{PrivateRoomProducer}from'./privateRoomProducer.js';
const producer=new PrivateRoomProducer(data=>self.postMessage(data));
self.onmessage=({data})=>producer.receive(data);
