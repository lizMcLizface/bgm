import {vi,expect,it,beforeEach,afterEach} from 'vitest';
vi.mock('./kernelAssets',()=>({kernelAsset:(_kind,file)=>file}));
let nodes;
beforeEach(()=>{
 vi.resetModules();nodes=[];
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([0,97,115,109,1,0,0,0]).buffer})));
 vi.stubGlobal('AudioWorkletNode',class{constructor(){this.port={postMessage:vi.fn(),close:vi.fn()};this.connect=vi.fn();this.disconnect=vi.fn();nodes.push(this);}});
});
afterEach(()=>vi.unstubAllGlobals());
it.each(['effects','inserts'])('%s retains read-only output stats and processor errors while forwarding callbacks',async kind=>{
 const context={currentTime:7,sampleRate:48000,audioWorklet:{addModule:vi.fn(async()=>{})},createGain:()=>({connect:vi.fn(),disconnect:vi.fn()})},onStats=vi.fn(),onError=vi.fn();
 const host=kind==='effects'?await (await import('./effects')).createEffectsBus(context,{}, {onStats,onError}):await (await import('./inserts')).createInstrumentInserts(context,{}, {onStats,onError});
 const node=nodes[0];expect(host.stats).toBeNull();const stats={type:'stats',peak:.2,sleeping:false};node.port.onmessage({data:stats});
 expect(host.stats).toEqual({...stats,reportedAt:7});expect(onStats).toHaveBeenCalledWith(stats);expect(node.port.postMessage).not.toHaveBeenCalled();
 node.port.onmessage({data:{type:'error',message:'failed'}});expect(host.error.message).toBe('failed');expect(onError).toHaveBeenCalledOnce();node.onprocessorerror();expect(onError).toHaveBeenCalledTimes(2);
});
