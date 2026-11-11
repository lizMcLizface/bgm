// @vitest-environment node
import fs from'node:fs';import{it,expect,vi,afterEach}from'vitest';
import{createRustCompressorFactory}from'../nodes/compressorRust.js';
const bytes=fs.readFileSync('public/native-compressor-live/engine.wasm'),manifest=JSON.parse(fs.readFileSync('public/native-compressor-live/build.json'));
async function fixture(){
 const listeners=new Set(),context={sampleRate:48000,currentTime:0,state:'running',audioWorklet:{addModule:async()=>{}},addEventListener:(_kind,listener)=>listeners.add(listener),removeEventListener:(_kind,listener)=>listeners.delete(listener)},nodes=[];
 vi.stubGlobal('fetch',vi.fn(async url=>String(url).includes('build.json')?{ok:true,json:async()=>manifest}:{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));
 vi.stubGlobal('AudioWorkletNode',class{
  constructor(_ac,_name,options){this.options=options;this.autoReply=true;this.replyDispose=true;this.connect=vi.fn();this.disconnectSpy=vi.fn();this.disconnect=this.disconnectSpy;this.parameters=new Map([['hostDemand',{setValueAtTime:vi.fn()}]]);this.sent=[];this.port={close:vi.fn(),postMessage:data=>{this.sent.push(data);if(data.request&&(data.kind==='dispose'?this.replyDispose:this.autoReply))queueMicrotask(()=>this.port.onmessage?.({data:{kind:data.kind==='dispose'?'disposed':'stats',request:data.request,stats:data.kind==='dispose'?undefined:{pulled:1}}}));}};nodes.push(this);}
 });
 const factory=await createRustCompressorFactory(context),stage=factory(context);return{context,nodes,node:nodes[0],stage,factory,listeners};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('fails closed on an unrequested controller rejection and disposes the actual node once',async()=>{
 const{stage,node}=await fixture();node.autoReply=false;const pending=stage.requestStats(),rejected=expect(pending).rejects.toThrow('controller rejected');
 stage.receive({kind:'rejected',error:'controller rejected'});await rejected;await stage.dispose();
 expect(stage.error).toBe('controller rejected');expect(stage.node).toBeNull();expect(stage.pending.size).toBe(0);expect(node.disconnectSpy).toHaveBeenCalledOnce();expect(node.port.close).toHaveBeenCalledOnce();expect(node.sent.filter(d=>d.kind==='dispose')).toHaveLength(1);
 await expect(stage.arm()).rejects.toThrow('controller rejected');
});
it('keeps a requested command rejection local to that request',async()=>{
 const{stage,node}=await fixture();node.autoReply=false;const pending=stage.reset(),rejected=expect(pending).rejects.toThrow('reset rejected');stage.receive({kind:'rejected',request:stage.request,error:'reset rejected'});await rejected;expect(stage.error).toBeNull();expect(stage.disposed).toBe(false);await stage.dispose();
});
it('bounds disposal acknowledgements and releases listeners, timers and references on timeout',async()=>{
 const{stage,node,listeners}=await fixture();vi.useFakeTimers();node.replyDispose=false;const disposal=stage.dispose(),rejected=expect(disposal).rejects.toThrow('dispose acknowledgement timed out');await vi.advanceTimersByTimeAsync(5000);await rejected;
 expect(stage.node).toBeNull();expect(stage.pending.size).toBe(0);expect(listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);expect(node.disconnectSpy).toHaveBeenCalledOnce();expect(node.port.close).toHaveBeenCalledOnce();expect(stage.dispose()).toBe(disposal);
});
it('settles a pending disposal when the context closes',async()=>{
 const{stage,node,context,listeners}=await fixture();node.replyDispose=false;const disposal=stage.dispose();context.state='closed';for(const listener of listeners)listener();await disposal;expect(stage.node).toBeNull();expect(stage.pending.size).toBe(0);expect(listeners.size).toBe(0);
});
it('clears failed postMessage requests and still performs final node cleanup',async()=>{
 const{stage,node}=await fixture();node.port.postMessage=()=>{throw Error('port send failed');};await expect(stage.flush()).rejects.toThrow('port send failed');expect(stage.pending.size).toBe(0);await expect(stage.dispose()).rejects.toThrow('port send failed');expect(stage.node).toBeNull();expect(node.port.close).toHaveBeenCalledOnce();
});
it('rejects malformed or unknown saved settings before allocating a node',async()=>{
 const{factory,context,nodes,stage}=await fixture();for(const settings of[null,[],{threshold:null},{ratio:NaN},{ratio:1e100},{unknown:1}])expect(()=>factory(context,{settings})).toThrow();expect(nodes).toHaveLength(1);await stage.dispose();
});

it('preserves raw finite UI settings while replaying native Float32 nominal clamps',async()=>{const{factory,context,stage,nodes}=await fixture(),raw={threshold:-120,knee:60,ratio:25,attack:1.5,release:3},other=factory(context,{settings:raw}),saved=other.snapshot();expect(saved.settings).toEqual(raw);expect(saved.effectiveSettings).toEqual({threshold:-100,knee:40,ratio:20,attack:1,release:1});expect(nodes[1].options.processorOptions.initialControls).toEqual([-100,40,20,1,1].map((value,i)=>[i,value]));other.setRelease(3);other.setRelease(3);expect(nodes[1].sent.filter(d=>d.kind==='control').map(d=>d.entries)).toEqual([[[4,1]],[[4,1]]]);const reloaded=factory(context,{settings:JSON.parse(JSON.stringify(saved)).settings});expect(reloaded.snapshot()).toEqual(saved);await Promise.all([stage.dispose(),other.dispose(),reloaded.dispose()]);});

it('accepts an exact partial offline initial trace and rejects ambiguous or unbounded traces',async()=>{const{factory,context,stage}=await fixture();expect(()=>factory(context,{initialControls:[[0,-6]]})).toThrow('Offline');context.startRendering=()=>{};const other=factory(context,{initialControls:[[0,-6],[1,0],[2,20]],hostAwake:false});expect(other.snapshot().settings).toEqual({threshold:-6,knee:0,ratio:20,attack:.005,release:.05});expect(()=>factory(context,{settings:{},initialControls:[]})).toThrow('mutually exclusive');expect(()=>factory(context,{initialControls:Array.from({length:65},()=>[0,-6])})).toThrow('bounded');expect(()=>factory(context,{initialControls:[[9,0]]})).toThrow();await Promise.all([stage.dispose(),other.dispose()]);});
