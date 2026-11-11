import {expect,it} from 'vitest';
import {nativeTimeToFrame} from './nativeAutomationTime.js';
import {nativeTargetTimeToFrame} from './nativeTargetAutomationTime.js';
it('keeps continuous target origins separate from native step ceil behavior',()=>{expect(nativeTimeToFrame(13/44100,44100)).toBe(14);expect(nativeTargetTimeToFrame(13/44100,44100)).toBe(13);for(const rate of [44100,48000,96000])for(const at of [0,13,1001,11008,22016,33024,41856])expect(nativeTargetTimeToFrame(at/rate,rate)).toBe(at);});
it.each([.1,13.25,13.5,13.99])('rejects genuinely fractional target sample phases (%s)',phase=>{expect(()=>nativeTargetTimeToFrame(phase/44100,44100)).toThrow('Fractional');});
it.each([-1,NaN,Infinity,'0',Number.MAX_SAFE_INTEGER])('rejects invalid target origins %s',value=>{expect(()=>nativeTargetTimeToFrame(value,48000)).toThrow();});
