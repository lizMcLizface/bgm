// @vitest-environment node
import {serveRack,RACK_CHANNEL} from './connection';

test('an unavailable separate-tab connection leaves the in-page rack operational',()=>{
 const args={id:'a',snapshot:()=>({}),edit:vi.fn(),clear:vi.fn()};
 for(const Channel of [null,class{constructor(){throw Error('Unavailable');}}]){
  const relay=serveRack({...args,Channel});expect(()=>{relay.publish();relay.close();}).not.toThrow();
 }
});

test('a separate rack tab discovers sources and edits only the selected session, even for the same synth',()=>{
 vi.useFakeTimers();
 const clients=new Set();
 class Channel {
  constructor(name){expect(name).toBe(RACK_CHANNEL);clients.add(this);}
  postMessage(data){for(const peer of clients)if(peer!==this)peer.onmessage?.({data});}
  close(){clients.delete(this);}
 }
 const editA=vi.fn(),editB=vi.fn(),clearA=vi.fn(),clearB=vi.fn(),snapshot=()=>({synth:'poly',name:'DIY Poly',values:{}});
 const a=serveRack({id:'a',snapshot,edit:editA,clear:clearA,Channel}),b=serveRack({id:'b',snapshot,edit:editB,clear:clearB,Channel});
 const controller=new Channel(RACK_CHANNEL),messages=[];controller.onmessage=({data})=>messages.push(data);
 try{
  controller.postMessage({type:'discover'});expect(messages.map(m=>m.id)).toEqual(['a','b']);
  controller.postMessage({type:'edit',target:'b',values:{'inserts.phaser':.4}});expect(editA).not.toHaveBeenCalled();expect(editB).toHaveBeenCalledWith({'inserts.phaser':.4});
  controller.postMessage({type:'clear',target:'a'});expect(clearA).toHaveBeenCalledOnce();expect(clearB).not.toHaveBeenCalled();
  controller.postMessage({type:'edit',target:'a',values:[]});expect(editA).not.toHaveBeenCalled();
  a.close();a.close();messages.length=0;vi.advanceTimersByTime(2000);expect(messages.map(m=>m.id)).toEqual(['b']);
 }finally{a.close();b.close();controller.close();vi.useRealTimers();}
});
