// @vitest-environment node
import fs from 'node:fs';
import {it,expect,vi,afterEach} from 'vitest';
import {MessageChannel} from 'node:worker_threads';
import {createPoolRoute} from './poolBrowser';
import {sixSourceDag} from './pitchedFixture';
import {profileOptions,profileDetails} from './bufferProfiles';
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{},manifest:{version:'test'}};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function setup(failAt=0){
  vi.useFakeTimers();vi.stubGlobal('MessageChannel',MessageChannel);const nodes=[],workers=[];let attempts=0;
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,name,options){this.name=name;this.options=options;this.port={postMessage:d=>{if(d.type==='connect'&&d.group===2)queueMicrotask(()=>this.port.onmessage({data:{type:'primed'}}));},close:vi.fn()};this.disconnect=vi.fn();nodes.push(this);queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  vi.stubGlobal('Worker',class{constructor(){if(++attempts===failAt)throw Error('Source worker unavailable');this.terminate=vi.fn();workers.push(this);}postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));if(d.type==='event')queueMicrotask(()=>this.onmessage({data:{type:'accepted',request:d.request,frame:4096}}));}});
  return {context:{sampleRate:48000,audioWorklet:{addModule:vi.fn()}},nodes,workers};
}
it('constructs exactly three source workers and a dependent Rust master with local event ownership',async()=>{
  const s=setup(),route=await createPoolRoute(s.context,assets,sixSourceDag(assets.fixture,48000));try{
    expect(s.workers).toHaveLength(3);expect(s.nodes[0].name).toBe('calmbgm-pool-output');expect(route.executor).toMatchObject({actual:'pool',workers:3,pcmPoolBytes:786432,bufferingLatencyFrames:4096});expect(route.executor.masterLevels[0]).toEqual([1,2,3,4,5,6,7]);
    await expect(route.enqueue({kind:'cancel',owner:1,target:1,frame:65536})).resolves.toMatchObject({type:'accepted'});expect(()=>route.enqueue({kind:'cancel',owner:1,target:2,frame:65536})).toThrow('Cross-worker');expect(()=>route.enqueue({kind:'parameter',owner:1,target:17,frame:65536})).toThrow('owned source');
  }finally{route.dispose();vi.runAllTimers();}expect(s.workers.every(w=>w.terminate.mock.calls.length===1)).toBe(true);
});
it.each(['forced','partial-startup'])('disposes partial resources and exposes serial fallback for %s',async scenario=>{
  const s=setup(scenario==='partial-startup'?2:0),route=await createPoolRoute(s.context,assets,sixSourceDag(assets.fixture,48000),{forceFallback:scenario==='forced'});try{expect(route.executor).toMatchObject({requested:'pool',actual:'serial',workers:0,bufferingLatencyFrames:4096});expect(route.executor.fallbackReason).toMatch(scenario==='forced'?/explicitly/:/unavailable/);expect(route.node.name).toBe('calmbgm-worker-output');expect(s.workers.every(w=>w.terminate.mock.calls.length===1)).toBe(true);}finally{route.dispose();vi.runAllTimers();}
});
it.each(['medium','short'])('preserves the selected %s delay through pool startup fallback',async profile=>{const s=setup(),options=profileOptions(profile),route=await createPoolRoute(s.context,assets,sixSourceDag(assets.fixture,48000),{forceFallback:true,options});try{expect(route.executor.actual).toBe('serial');expect(route.executor.bufferingLatencyFrames).toBe(profileDetails(profile,48000).delayFrames);expect(route.node.options.processorOptions.options.blockFrames).toBe(options.blockFrames);}finally{route.dispose();vi.runAllTimers();}});
