// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MessageChannel} from 'node:worker_threads';
import {createWorkerRoute} from './workerBrowser';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('explicit worker startup fallback',()=>{
 it('retains explicit partial-source, finite end and manual arm through serial startup fallback',async()=>{
  vi.useFakeTimers();vi.stubGlobal('AudioWorkletNode',class{constructor(_c,_n,options){this.options=options;this.port={postMessage:vi.fn(),close:vi.fn()};this.disconnect=vi.fn();queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const onFinished=vi.fn(),context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={modules:{},contracts:{},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{}, {forceFallback:true,sourceIds:[1],endFrame:131,startPaused:true,stopOnUnderrun:true,onFinished,options:{blockFrames:512,poolBlocks:6,scheduling:'message'}});
  expect(route.executor).toMatchObject({actual:'serial',sourceIds:[1],manualStart:true,stopOnUnderrun:true,bufferingLatencyFrames:3072});expect(route.node.options.processorOptions).toMatchObject({sourceIds:[1],startPaused:true,stopOnUnderrun:true,endFrame:131});route.start();expect(route.node.port.postMessage).toHaveBeenCalledWith({type:'start'});expect(()=>route.start()).toThrow();route.node.port.onmessage({data:{type:'finished',reason:'delivery-gap'}});expect(onFinished).toHaveBeenCalledWith({type:'finished',reason:'delivery-gap'});route.dispose();vi.runAllTimers();
 });
 it('bounds outstanding controls and rejects them when disposed',async()=>{
  vi.useFakeTimers();vi.stubGlobal('MessageChannel',MessageChannel);
  vi.stubGlobal('Worker',class{postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}terminate(){}});
  vi.stubGlobal('AudioWorkletNode',class{constructor(){this.port={postMessage:d=>{if(d.type==='connect')queueMicrotask(()=>this.port.onmessage({data:{type:'primed'}}));},close(){}};this.disconnect=()=>{};queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,audioWorklet:{addModule:vi.fn()}},assets={fixture:{totalSeconds:17.5},modules:{},contracts:{},manifest:{version:'test'}},route=await createWorkerRoute(context,assets,{});
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
