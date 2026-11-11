// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {OwnedMixerUnit} from './mixerOwned';
import {saveMixerConfig,loadMixerConfig,validateMixerConfig} from './mixerConfig';
import {limiterMaterial,limiterConfig,renderNativeLimiter} from '../../tools/mixer-owned-limiter-cases.mjs';
const path=process.env.MIXER_OWNED_WASM??'public/modular-audio/mixer.wasm',wasm=new WebAssembly.Module(fs.readFileSync(path));
const make=(c,e=new WebAssembly.Instance(wasm,{}).exports)=>new OwnedMixerUnit(e,c,512);
function render(g,input,cadence=[509]){const frames=input[0].length,out=[new Float32Array(frames),new Float32Array(frames)];for(let at=0,k=0;at<frames;k++){const n=Math.min(cadence[k%cadence.length],frames-at);for(let c=0;c<2;c++)g.input[c].set(input[c].subarray(at,at+n));g.render(n);for(let c=0;c<2;c++)out[c].set(g.output[c].subarray(0,n),at);at+=n;}return out;}
it.each([8000,24000,44100,48000,96000,192000])('preserves actual legacy desk limiter PCM and latency at %i Hz',rate=>{
 for(const enabled of [true,false]){const c=limiterConfig(rate,enabled),input=limiterMaterial(10000),expected=renderNativeLimiter(rate,c,input),g=make(c);try{const out=render(g,input);let max=0;for(let channel=0;channel<2;channel++)for(let i=0;i<input[0].length;i++){expect(Number.isFinite(out[channel][i])).toBe(true);max=Math.max(max,Math.abs(out[channel][i]-expected.out[channel][i]));}expect(max).toBeLessThan(1e-7);expect(g.stats()).toMatchObject({frame:10000,applied:4,late:0,overflow:0,latencyFrames:Math.ceil(rate*.003)});expect(g.stats().reductionGain).toBeCloseTo(expected.gain,13);}finally{g.dispose();}}
});
it('keeps the 3ms delay during bypass and includes the delayed sample in peak detection',()=>{
 const c=limiterConfig(48000);c.events=[];const g=make(c),input=[new Float32Array(1000),new Float32Array(1000)];input[0][37]=4;input[1][37]=-2;try{const out=render(g,input);expect(out[0].slice(0,181).every(v=>v===0)).toBe(true);expect(out[0][181]).toBe(.5);expect(out[1][181]).toBe(-.25);g.reset();g.set(0,0);const bypass=render(g,input);expect(bypass[0][181]).toBe(4);expect(bypass[1][181]).toBe(-2);}finally{g.dispose();}
});
it('replays saved limiter state exactly across partitions, reset, pause, owner cancellation and shared-memory instances',()=>{
 const c=limiterConfig(48000),e=new WebAssembly.Instance(wasm,{}).exports,a=make(c,e),b=make(loadMixerConfig(saveMixerConfig(c)),e);a.refresh();b.refresh();const input=limiterMaterial(12000);try{const x=render(a,input),y=render(b,input,[1,37,203,127,11]);expect(y).toEqual(x);a.reset();expect(render(a,input,[113])).toEqual(x);a.reset();a.pause(true);a.render(37);expect(a.stats().frame).toBe(0);expect(a.output[0].slice(0,37).every(v=>v===0)).toBe(true);a.pause(false);a.cancel(1);expect(a.stats().queued).toBe(3);expect(b.stats().frame).toBe(12000);a.dispose();expect(b.stats().frame).toBe(12000);}finally{a.dispose();b.dispose();}
});
it('validates discrete enabled state and ceiling independently at host and Rust boundaries',()=>{
 for(const params of [[.5,.5],[1,0],[1,1.1],[1,NaN]])expect(()=>validateMixerConfig({...limiterConfig(48000),parameters:params})).toThrow();const g=make(limiterConfig(48000));try{expect(g.engine.mixer_param(g.handle,0,.5,0)).not.toBe(0);expect(g.engine.mixer_param(g.handle,1,.01,0)).not.toBe(0);expect(g.engine.mixer_event(g.handle,0,1,0,.5)).not.toBe(0);}finally{g.dispose();}
});
