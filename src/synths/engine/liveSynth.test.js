import {it,expect,vi} from 'vitest';
const rackHost=vi.hoisted(()=>({made:[]}));
vi.mock('../effects/graph',()=>({createRack:async(context,values,options)=>{const rack={input:{},connect:vi.fn(),patch:vi.fn(),clear:vi.fn(),dispose:vi.fn(),armRuntime:vi.fn(async()=>{})};rackHost.made.push({context,options,rack});return rack;}}));
vi.mock('../effects/outputMonitor',()=>({createOutputMonitor:async()=>({node:{connect:vi.fn()},requestScope:vi.fn(),dispose:vi.fn()})}));
import {startLiveSynth} from './liveSynth';

it('prepares a restored instrument while its host context is suspended without waiting for a user gesture',async()=>{
 const gains=[],resume=vi.fn(()=>new Promise(()=>{})),context={state:'suspended',audioWorklet:{addModule:vi.fn(async()=>{})},resume,close:vi.fn(),createGain:()=>{const node={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(node);return node;}},destination={};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([0,97,115,109,1,0,0,0]).buffer})));
 vi.stubGlobal('AudioWorkletNode',class{
  constructor(){this.port={close:vi.fn(),postMessage:vi.fn(d=>{if(d.type==='dispose')queueMicrotask(()=>this.port.onmessage?.({data:{type:'disposed',version:1,released:true,clean:true}}));})};this.connect=vi.fn();this.disconnect=vi.fn();queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}
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
it('uses an optional owned source factory without loading legacy assets and retains source lease/rack routing',async()=>{
 const gains=[],context={state:'suspended',audioWorklet:{addModule:vi.fn()},createGain:()=>{const n={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(n);return n;}},forward=vi.fn(),disposed=vi.fn(async()=>{}),node={ready:Promise.resolve(),handleOwnedMessage:forward,disposeOwned:disposed,port:{postMessage:vi.fn()},connect:vi.fn(),disconnect:vi.fn()},factory=vi.fn(async()=>node),params=[[0,3]],waves=new Float32Array([.2,.4]);vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Legacy fetch forbidden');}));
 try{const preparing=startLiveSynth({context,sourceNodeFactory:factory,model:7,params,waves});params[0][1]=9;waves[0]=9;const live=await preparing;expect(factory.mock.calls[0][1]).toMatchObject({params:[[0,3]]});expect(factory.mock.calls[0][1].waves[0]).toBeCloseTo(.2);expect(context.audioWorklet.addModule).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();node.port.onmessage({data:{type:'stats',active:2}});expect(forward).toHaveBeenCalledWith({type:'stats',active:2});node.onprocessorerror();expect(forward).toHaveBeenLastCalledWith({type:'error',message:'Synth worklet failed. Reload the page.'});const release=live.holdSourceInput();expect(gains[0].gain.value).toBe(0);release();expect(gains[0].gain.value).toBe(1);await live.close();expect(disposed).toHaveBeenCalledOnce();}finally{vi.unstubAllGlobals();}
});
it('cleans up a prepared owned node if its startup fails without touching the shared context',async()=>{const context={audioWorklet:{},close:vi.fn()},node={ready:Promise.reject(Error('owned startup')),disposeOwned:vi.fn(async()=>{}),port:{postMessage:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};await expect(startLiveSynth({context,sourceNodeFactory:async()=>node})).rejects.toThrow('owned startup');expect(node.disposeOwned).toHaveBeenCalledOnce();expect(node.disconnect).toHaveBeenCalled();expect(context.close).not.toHaveBeenCalled();});

it('forwards a prepared dynamics factory, waits for rack arming and awaits owned rack disposal',async()=>{
 // This host test exercises the real lifecycle while the separately tested rack owns DSP.
 const context={state:'running',audioWorklet:{},createGain:()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()})},node={ready:Promise.resolve(),port:{postMessage:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),disposeOwned:vi.fn(async()=>{}),armRuntime:vi.fn(async()=>{})},factory=vi.fn();
 const l=await startLiveSynth({context,sourceNodeFactory:async()=>node,rackDynamicsFactory:factory}),r=rackHost.made.at(-1);expect(r.options.dynamicsFactory).toBe(factory);let finish;const pending=new Promise(resolve=>finish=resolve);r.rack.dispose.mockReturnValue(pending);await l.armRuntime();expect(node.armRuntime).toHaveBeenCalledOnce();expect(r.rack.armRuntime).toHaveBeenCalledOnce();let done=false;const closed=l.close().then(()=>done=true);await Promise.resolve();expect(done).toBe(false);finish();await closed;
});
