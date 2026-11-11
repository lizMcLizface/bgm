// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MessageChannel} from 'node:worker_threads';
import {createWorkerRoute} from './workerBrowser';
import {workerOnlyModules} from './executionPolicy';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('explicit worker startup fallback',()=>{
 it('matches execution policy to descriptor version while retaining the explicit Freeze guard',()=>{
  const patch={modules:[{id:1,type:'future.heavy',version:1},{id:2,type:'future.heavy',version:2},{id:3,type:'voice.freeze',version:1}]},contracts={modules:[{type:'future.heavy',version:2,execution:'worker-only'}]};expect(workerOnlyModules(patch,contracts).map(n=>n.id)).toEqual([2,3]);
 });
 it('permits a worker-required patch on the successful worker route',async()=>{
  vi.useFakeTimers();vi.stubGlobal('MessageChannel',MessageChannel);vi.stubGlobal('Worker',class{postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}terminate(){}});
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,_n,options){this.options=options;this.port={postMessage:d=>{if(d.type==='connect')queueMicrotask(()=>this.port.onmessage({data:{type:'primed'}}));},close(){}};this.disconnect=()=>{};queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={modules:{},contracts:{modules:[]},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{modules:[{id:9,type:'voice.freeze',version:1}]},{mode:'worker',sourceIds:[1],endFrame:128});try{expect(route.executor.actual).toBe('worker');expect(route.executor.fallbackReason).toBeNull();expect(route.node.options.processorOptions.mode).toBe('worker');}finally{route.dispose();vi.runAllTimers();}
 });
 it.each([
  [{modules:[{id:9,type:'future.heavy',version:2}]},{modules:[{type:'future.heavy',version:2,execution:'worker-only'}]}],
  [{modules:[{id:5,type:'voice.freeze',version:1}]},{modules:[]}],
 ])('rejects worker-required serial realtime routes before registering or constructing a worklet',async(patch,contracts)=>{
  const Node=vi.fn();vi.stubGlobal('AudioWorkletNode',Node);const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={modules:{},contracts,manifest:{version:'test'}};
  await expect(createWorkerRoute(context,assets,patch,{mode:'serial',endFrame:128})).rejects.toThrow('Worker executor required');expect(context.audioWorklet.addModule).not.toHaveBeenCalled();expect(Node).not.toHaveBeenCalled();
 });
 it.each(['forced','unavailable','constructor','worker-error'])('fails closed instead of serial fallback for a worker-only patch after %s failure',async scenario=>{
  vi.useFakeTimers();vi.stubGlobal('MessageChannel',MessageChannel);const nodes=[],workers=[];
  vi.stubGlobal('Worker',scenario==='unavailable'?undefined:class{constructor(){if(scenario==='constructor')throw Error('Worker constructor blocked');workers.push(this);this.terminate=vi.fn();}postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'error',message:'Worker init refused'}}));}});
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,_n,options){this.options=options;this.port={postMessage:vi.fn(),close:vi.fn()};this.disconnect=vi.fn();nodes.push(this);queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={modules:{},contracts:{modules:[]},manifest:{version:'test'}},patch={modules:[{id:5,type:'voice.freeze',version:1}]};
  await expect(createWorkerRoute(context,assets,patch,{mode:'worker',forceFallback:scenario==='forced',endFrame:128})).rejects.toThrow(/Worker executor required.*Worker startup failed/);expect(nodes.every(n=>n.options.processorOptions.mode==='worker')).toBe(true);expect(nodes).toHaveLength(['forced','unavailable'].includes(scenario)?0:1);for(const node of nodes){expect(node.disconnect).toHaveBeenCalledOnce();expect(node.port.close).toHaveBeenCalledOnce();}for(const worker of workers)expect(worker.terminate).toHaveBeenCalledOnce();vi.runAllTimers();
 });
 it('retains explicit partial-source, finite end and manual arm through serial startup fallback',async()=>{
  vi.useFakeTimers();vi.stubGlobal('AudioWorkletNode',class{constructor(_c,_n,options){this.options=options;this.port={postMessage:vi.fn(),close:vi.fn()};this.disconnect=vi.fn();queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const onFinished=vi.fn(),context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={modules:{},contracts:{},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{}, {forceFallback:true,sourceIds:[1],endFrame:131,startPaused:true,stopOnUnderrun:true,onFinished,options:{blockFrames:512,poolBlocks:6,scheduling:'message'}});
  expect(route.executor).toMatchObject({actual:'serial',sourceIds:[1],manualStart:true,stopOnUnderrun:true,bufferingLatencyFrames:3072});expect(route.node.options.processorOptions).toMatchObject({sourceIds:[1],startPaused:true,stopOnUnderrun:true,endFrame:131});route.start();expect(route.node.port.postMessage).toHaveBeenCalledWith({type:'start'});expect(()=>route.start()).toThrow();route.node.port.onmessage({data:{type:'finished',reason:'delivery-gap'}});expect(onFinished).toHaveBeenCalledWith({type:'finished',reason:'delivery-gap'});route.dispose();vi.runAllTimers();
 });
 it.each([false,true])('bounds controls and passes opt-in diagnostics to both peers (enabled=%s)',async deliveryDiagnostics=>{
  vi.useFakeTimers();vi.stubGlobal('MessageChannel',MessageChannel);
  let init,nodeOptions;
  vi.stubGlobal('Worker',class{postMessage(d){if(d.type==='init'){init=d;queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}}terminate(){}});
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,_n,options){nodeOptions=options;this.port={postMessage:d=>{if(d.type==='connect')queueMicrotask(()=>this.port.onmessage({data:{type:'primed'}}));},close(){}};this.disconnect=()=>{};queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={fixture:{totalSeconds:17.5},modules:{},contracts:{},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{},deliveryDiagnostics?{deliveryDiagnostics}:{});
  expect(init.deliveryDiagnostics).toBe(deliveryDiagnostics);expect(nodeOptions.processorOptions.deliveryDiagnostics).toBe(deliveryDiagnostics);expect(route.executor.deliveryDiagnostics).toBe(deliveryDiagnostics);
  const pending=Array.from({length:64},()=>route.enqueue({}).catch(e=>e.message));await expect(route.enqueue({})).rejects.toThrow('capacity');route.dispose();expect((await Promise.all(pending)).every(s=>s==='Route disposed')).toBe(true);vi.runAllTimers();
 });
 it.each(['serial','forced','unavailable','startup-error'])('keeps the same declared buffering for %s',async scenario=>{
  vi.useFakeTimers();const nodes=[];vi.stubGlobal('MessageChannel',MessageChannel);
  vi.stubGlobal('Worker',scenario==='unavailable'?undefined:class{constructor(){throw Error('Blocked worker startup');}});
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,name,options){this.name=name;this.options=options;this.port={postMessage:vi.fn(),close:vi.fn()};this.disconnect=vi.fn();nodes.push(this);queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={fixture:{totalSeconds:17.5},modules:{},contracts:{},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{}, {mode:scenario==='serial'?'serial':'worker',forceFallback:scenario==='forced'});
  try{expect(route.executor.actual).toBe('serial');expect(route.executor.bufferingLatencyFrames).toBe(4096);expect(route.executor.pcmPoolBytes).toBe(0);expect(route.node.options.processorOptions.mode).toBe('serial');expect(route.executor.fallbackReason===null).toBe(scenario==='serial');expect(nodes).toHaveLength(scenario==='startup-error'?2:1);expect(()=>route.check()).not.toThrow();}finally{route.dispose();vi.runAllTimers();}
 });
});
