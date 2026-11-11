import {it,expect,vi} from 'vitest';
vi.mock('../effects/graph',()=>({createRack:async()=>({input:{},connect:vi.fn(),patch:vi.fn(),clear:vi.fn(),dispose:vi.fn()})}));
vi.mock('../effects/outputMonitor',()=>({createOutputMonitor:async()=>({node:{connect:vi.fn()},requestScope:vi.fn(),dispose:vi.fn()})}));
import {startLiveSynth} from './liveSynth';

it('prepares a restored instrument while its host context is suspended without waiting for a user gesture',async()=>{
 const gains=[],resume=vi.fn(()=>new Promise(()=>{})),context={state:'suspended',audioWorklet:{addModule:vi.fn(async()=>{})},resume,close:vi.fn(),createGain:()=>{const node={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(node);return node;}},destination={};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([0,97,115,109,1,0,0,0]).buffer})));
 vi.stubGlobal('AudioWorkletNode',class{
  constructor(){this.port={postMessage:vi.fn()};this.connect=vi.fn();this.disconnect=vi.fn();queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}
 });
 try{
  const waves=new Float32Array([.25,.5]),params=[[0,3]],live=await startLiveSynth({context,destination,model:7,params,waves,polyphony:8});
  expect(resume).not.toHaveBeenCalled();expect(context.state).toBe('suspended');
  expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
  expect(live.node.connect).toHaveBeenCalledWith(gains[0]);expect(live.sourceInput).toBe(gains[1]);
  waves[0]=9;params[0][1]=8;expect(live.captureSource()).toMatchObject({model:7,polyphony:8,parameters:[[0,3]],waves:[.25,.5]});
  const a=live.holdSourceInput(),b=live.holdSourceInput();expect(gains[0].gain.value).toBe(0);a();a();expect(gains[0].gain.value).toBe(0);b();expect(gains[0].gain.value).toBe(1);
  const snapshot=live.captureSource();snapshot.waves[0]=12;snapshot.parameters[0][1]=12;expect(live.captureSource().waves[0]).toBe(.25);expect(live.captureSource().parameters[0][1]).toBe(3);
  live.setParam(0,4);live.setWaves(new Float32Array([.1,.2]));live.control(0,.3);expect(live.captureSource()).toMatchObject({revision:3,parameters:[[0,4]],controls:[[0,.3]]});
  await Promise.resolve();
  live.noteOn(1,60,.8,0);await Promise.resolve();
  expect(live.node.port.postMessage).toHaveBeenCalledWith({type:'events',values:[[0,1,60,.8,0]]});
  const release=live.holdSourceInput();await live.close();release();await live.close();expect(context.close).not.toHaveBeenCalled();expect(gains.every(g=>g.disconnect.mock.calls.length===1)).toBe(true);expect(()=>live.captureSource()).toThrow('closed');
 }finally{vi.unstubAllGlobals();}
});
