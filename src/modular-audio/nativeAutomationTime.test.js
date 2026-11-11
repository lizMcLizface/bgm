import {it,expect} from 'vitest';
import {nativeTimeToFrame,compileNativeStepTimeline,NATIVE_STEP_TIME_PROFILE} from './nativeAutomationTime';
it('imports original seconds without rounding away native ceil boundary behavior',()=>{
 const time=13/44100;expect(time*44100).toBeGreaterThan(13);expect(nativeTimeToFrame(time,44100)).toBe(14);for(const rate of [48000,96000]){expect(nativeTimeToFrame(13/rate,rate)).toBe(13);expect(nativeTimeToFrame(4001/rate,rate)).toBe(4001);}expect(nativeTimeToFrame(0,44100)).toBe(0);
});
it('preserves original seconds, f64 targets, requested frames and stable native time order',()=>{
 const seconds=13/44100,events=[{timeSeconds:seconds,index:0,value:.512345678912345,requestedFrame:13},{timeSeconds:0,index:1,value:4},{timeSeconds:seconds,index:0,value:.612345678912345,requestedFrame:13}],copy=structuredClone(events),timeline=compileNativeStepTimeline(events,44100);expect(timeline.profile).toBe(NATIVE_STEP_TIME_PROFILE);expect(events).toEqual(copy);expect(timeline.events.map(e=>e.sequence)).toEqual([1,0,2]);expect(timeline.events[1]).toMatchObject({timeSeconds:seconds,requestedFrame:13,frame:14,value:.512345678912345});expect(timeline.events[2].value).toBe(.612345678912345);
});
it.each([-1,NaN,Infinity,'0',Number.MAX_SAFE_INTEGER])('rejects invalid or unbounded native times %s',time=>{expect(()=>nativeTimeToFrame(time,48000)).toThrow();});
it('rejects malformed step events and invalid context rates before compiling',()=>{
 for(const rate of [0,-1,48000.5,Infinity])expect(()=>compileNativeStepTimeline([],rate)).toThrow();for(const event of [{timeSeconds:0,index:-1,value:1},{timeSeconds:0,index:0,value:Infinity},{timeSeconds:0,index:0,value:1,requestedFrame:.5},null])expect(()=>compileNativeStepTimeline([event],48000)).toThrow();
});
