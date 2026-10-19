import {startLoadMeter} from './loadMeter';
let node,AC,source;
beforeEach(()=>{node={port:{postMessage:vi.fn(),onmessage:null}};vi.stubGlobal('AudioWorkletNode',vi.fn(()=>node));AC={state:'running',audioWorklet:{addModule:vi.fn(async()=>{})},addEventListener:vi.fn(),removeEventListener:vi.fn()};source={connect:vi.fn(),disconnect:vi.fn()};});
afterEach(()=>vi.unstubAllGlobals());
it('routes idle separately from silence and clears stale load on context suspension',async()=>{const update=vi.fn(),silence=vi.fn(),idle=vi.fn();const stop=startLoadMeter(AC,source,update,silence,idle);await Promise.resolve();node.port.onmessage({data:{load:null,loadReason:'unavailable-pacing',idle:true}});expect(idle).toHaveBeenCalledOnce();node.port.onmessage({data:{silence:2}});expect(silence).toHaveBeenCalledWith(2);AC.state='suspended';AC.addEventListener.mock.calls[0][1]();expect(update.mock.lastCall[0]).toMatchObject({load:null,state:'suspended'});stop();expect(AC.removeEventListener).toHaveBeenCalled();expect(node.port.postMessage).toHaveBeenCalledWith({type:'dispose'});});
it('ignores queued callbacks after cleanup and never creates a node after late module loading',async()=>{let ready;AC.audioWorklet.addModule.mockImplementation(()=>new Promise(r=>ready=r));const stop=startLoadMeter(AC,source,vi.fn());stop();ready();await Promise.resolve();expect(AudioWorkletNode).not.toHaveBeenCalled();});

it('keeps at most 32 output windows and retains them when the context suspends',async()=>{
 const update=vi.fn(),stop=startLoadMeter(AC,source,update);await Promise.resolve();
 for(let i=0;i<50;i++)node.port.onmessage({data:{load:null,output:{audioTime:i,peak:.1,rms:.04,nonFinite:0}}});
 expect(update.mock.lastCall[0].outputHistory).toHaveLength(32);expect(update.mock.lastCall[0].outputHistory[0].audioTime).toBe(18);
 AC.state='suspended';AC.addEventListener.mock.calls[0][1]();expect(update.mock.lastCall[0].output).toBeNull();expect(update.mock.lastCall[0].outputHistory).toHaveLength(32);stop();
});

it('retains platform counters per output window and bounded callback/visibility history',async()=>{
 let underruns=1;AC.currentTime=1;AC.playbackStats={toJSON:()=>({underrunEvents:underruns,totalDuration:5})};
 const update=vi.fn(),stop=startLoadMeter(AC,source,update);await Promise.resolve();
 node.port.onmessage({data:{output:{audioTime:1,wallTime:1000}}});
 underruns=0;AC.currentTime=2;
 for(let i=0;i<40;i++)node.port.onmessage({data:{callbackGap:{wallTime:2000+i,audioTime:2,ms:300}}});
 document.dispatchEvent(new Event('visibilitychange'));
 node.port.onmessage({data:{output:{audioTime:2,wallTime:2000}}});
 const s=update.mock.lastCall[0];
 expect(s.outputHistory[0].platform.playbackStats.underrunEvents).toBe(1);
 expect(s.output.platform.playbackStats.underrunEvents).toBe(0);
 expect(s.output.observedAtAudioTime).toBe(2);
 expect(s.outputEvents).toHaveLength(32);
 expect(s.outputEvents[0].type).toBe('callback-gap');
 expect(s.outputEvents.at(-1).type).toBe('visibility');
 stop();const count=update.mock.calls.length;document.dispatchEvent(new Event('visibilitychange'));
 expect(update.mock.calls).toHaveLength(count);
});

it('keeps diagnostics working when platform getters throw',async()=>{
 Object.defineProperty(AC,'playbackStats',{get:()=>{throw Error('unsupported');}});
 // Platform support is independently guarded from ordinary level reporting.
 const {readOutputPlatform}=await import('./loadMeter');
 expect(()=>readOutputPlatform(AC)).not.toThrow();
 expect(readOutputPlatform(AC)).toEqual({timestamp:undefined});
 const update=vi.fn(),stop=startLoadMeter(AC,source,update);await Promise.resolve();
 expect(()=>node.port.onmessage({data:{output:{audioTime:1}}})).not.toThrow();
 expect(update.mock.lastCall[0].dropouts).toBeNull();stop();
});
