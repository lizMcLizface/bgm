import {vi} from 'vitest';
import {initialFM as defaultFM} from './fmPatch';
const state=vi.hoisted(()=>({nodes:[],supported:true,perf:false}));
vi.mock('../audio/perfMode',()=>({perfEnabled:()=>state.perf}));
vi.mock('./fmModule',()=>({supportsSimd:()=>state.supported}));
class Node {
 constructor(c,name,options){this.context=c;this.name=name;this.options=options;this.connect=vi.fn();this.disconnect=vi.fn();this.port={postMessage:vi.fn(),close:vi.fn(),onmessage:null};state.nodes.push(this);}
}
const ctx=()=>({length:Infinity,createGain:()=>({disconnect:vi.fn()}),audioWorklet:{addModule:vi.fn(async()=>{})}});
beforeEach(()=>{vi.resetModules();state.nodes=[];state.supported=true;state.perf=false;vi.stubGlobal('AudioWorkletNode',Node);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})));vi.spyOn(WebAssembly,'compile').mockResolvedValue({});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const options=()=>({onStats:vi.fn(),onError:vi.fn()});
test('concurrent instruments share one bank with independent stereo outputs and ports',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx(),a=options(),b=options(),[x,y]=await Promise.all([makeFMBankNode(c,defaultFM(),a),makeFMBankNode(c,defaultFM(),b)]),n=state.nodes[0];
 expect(state.nodes).toHaveLength(1);expect(n.options.outputChannelCount).toEqual([2,2,2,2]);expect(c.audioWorklet.addModule).toHaveBeenCalledTimes(1);expect(n.connect.mock.calls).toEqual([[x,0,0],[y,1,0]]);
 const first=n.port.postMessage.mock.calls[0][0],second=n.port.postMessage.mock.calls[1][0];x.port.postMessage({type:'events',values:[[0,1,0,60,.5]]});expect(n.port.postMessage.mock.lastCall[0]).toMatchObject({slot:0,token:first.token});
 n.port.onmessage({data:{type:'stats',slot:1,token:second.token,active:1}});expect(b.onStats).toHaveBeenCalledOnce();expect(a.onStats).not.toHaveBeenCalled();
 x.port.postMessage({type:'dispose'});expect(n.port.close).not.toHaveBeenCalled();y.port.postMessage({type:'panic'});expect(n.port.postMessage.mock.lastCall[0]).toMatchObject({type:'panic',slot:1});y.port.postMessage({type:'dispose'});expect(n.port.close).toHaveBeenCalledOnce();
});
test('reused slots reject stale input/stats, and closed banks are replaced',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx(),a=options(),b=options(),x=await makeFMBankNode(c,defaultFM(),a),y=await makeFMBankNode(c,defaultFM(),b),n=state.nodes[0],old=n.port.postMessage.mock.calls[0][0];x.port.postMessage({type:'dispose'});const z=await makeFMBankNode(c,defaultFM(),a),fresh=n.port.postMessage.mock.lastCall[0];expect(fresh.slot).toBe(0);expect(fresh.token).not.toBe(old.token);
 const before=n.port.postMessage.mock.calls.length;x.port.postMessage({type:'panic'});expect(n.port.postMessage).toHaveBeenCalledTimes(before);n.port.onmessage({data:{type:'stats',slot:0,token:old.token}});expect(a.onStats).not.toHaveBeenCalled();
 z.port.postMessage({type:'dispose'});y.port.postMessage({type:'dispose'});await makeFMBankNode(c,defaultFM());expect(state.nodes).toHaveLength(2);
});
test('capacity and context boundaries allocate separate banks',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx();await Promise.all(Array.from({length:5},()=>makeFMBankNode(c,defaultFM())));expect(state.nodes).toHaveLength(2);await makeFMBankNode(ctx(),defaultFM());expect(state.nodes).toHaveLength(3);
});
test('different offline lifetime requests cannot stop another instrument early',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx();c.length=2048;await makeFMBankNode(c,defaultFM(),{offline:true,stopFrame:512});await makeFMBankNode(c,defaultFM(),{offline:true,stopFrame:1024});expect(state.nodes).toHaveLength(2);expect(state.nodes.map(n=>n.options.processorOptions.stopFrame)).toEqual([512,1024]);
});
test('processor failure reports to all members and permits clean replacement',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx(),a=options(),b=options(),x=await makeFMBankNode(c,defaultFM(),a);await makeFMBankNode(c,defaultFM(),b);state.nodes[0].onprocessorerror();expect(a.onError).toHaveBeenCalledOnce();expect(b.onError).toHaveBeenCalledOnce();expect(()=>x.port.postMessage({type:'dispose'})).not.toThrow();await makeFMBankNode(c,defaultFM());expect(state.nodes).toHaveLength(2);
});
test('unsupported or missing optional kernels reject before allocating a graph',async()=>{
 const {makeFMBankNode}=await import('./fmBank');state.supported=false;await expect(makeFMBankNode(ctx(),defaultFM())).rejects.toThrow('SIMD unavailable');expect(state.nodes).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();state.supported=true;fetch.mockResolvedValue({ok:false});await expect(makeFMBankNode(ctx(),defaultFM())).rejects.toThrow('Optional FM bank unavailable');expect(state.nodes).toHaveLength(0);
});

test('live Perf changes never lease slots from a bank with a different kernel',async()=>{
 const {makeFMBankNode}=await import('./fmBank'),c=ctx();await makeFMBankNode(c,defaultFM());state.perf=true;await makeFMBankNode(c,defaultFM());expect(state.nodes).toHaveLength(2);expect(state.nodes.map(n=>n.options.processorOptions.fast)).toEqual([false,true]);state.perf=false;await makeFMBankNode(c,defaultFM());expect(state.nodes).toHaveLength(2);expect(fetch).toHaveBeenCalledTimes(2);expect(c.audioWorklet.addModule).toHaveBeenCalledOnce();
});
