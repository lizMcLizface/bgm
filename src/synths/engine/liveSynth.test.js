import {it,expect,vi} from 'vitest';
vi.mock('../effects/graph',()=>({createRack:async()=>({input:{},connect:vi.fn(),patch:vi.fn(),clear:vi.fn(),dispose:vi.fn()})}));
vi.mock('../effects/outputMonitor',()=>({createOutputMonitor:async()=>({node:{connect:vi.fn()},requestScope:vi.fn(),dispose:vi.fn()})}));
import {startLiveSynth} from './liveSynth';

it('prepares a restored instrument while its host context is suspended without waiting for a user gesture',async()=>{
 const resume=vi.fn(()=>new Promise(()=>{})),context={state:'suspended',audioWorklet:{addModule:vi.fn(async()=>{})},resume,close:vi.fn()},destination={};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([0,97,115,109,1,0,0,0]).buffer})));
 vi.stubGlobal('AudioWorkletNode',class{
  constructor(){this.port={postMessage:vi.fn()};this.connect=vi.fn();this.disconnect=vi.fn();queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}
 });
 try{
  const live=await startLiveSynth({context,destination});
  expect(resume).not.toHaveBeenCalled();expect(context.state).toBe('suspended');
  expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
  live.noteOn(1,60,.8,0);await Promise.resolve();
  expect(live.node.port.postMessage).toHaveBeenCalledWith({type:'events',values:[[0,1,60,.8,0]]});
  await live.close();expect(context.close).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
