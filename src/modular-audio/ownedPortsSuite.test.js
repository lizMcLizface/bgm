// @vitest-environment node
import fs from 'node:fs';
import {expect,it} from 'vitest';
import {ownedPortsFixture,directOwnedPorts,pcmMetrics,comparePcm} from './ownedPortsSuite.js';
const assets={modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))},contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'))};
it.each([44100,48000,96000])('runs the fixed portable fixture at %i Hz, including exact event/PDC timing, reset and independent saved instances',rate=>{
 const f=ownedPortsFixture(rate),{result,pcm,saved}=directOwnedPorts(assets,f);
 expect(result).toMatchObject({checksPassed:true,latencyFrames:256+Math.ceil(rate*.003),rawMixDelayFrames:128,rawSendDelayFrames:128,metrics:{firstFrame:37+256+Math.ceil(rate*.003),nonFinite:0},stats:{applied:4,late:0,overflow:0},pauseReset:true,independentInstances:true,savedPatchRestart:true});
 expect(pcmMetrics(pcm).peak).toBeGreaterThan(.01);expect(JSON.parse(saved).modules.some(n=>n.type==='desk.limiter')).toBe(true);expect(f.total%128).toBe(0);
});
it('reports PCM mismatches without hiding silent channels or nonfinite samples',()=>{
 const a=[new Float32Array([0,.5]),new Float32Array([0,-.5])];expect(pcmMetrics(a)).toMatchObject({firstFrame:1,lastFrame:1,peak:.5,stereoDifference:1,nonFinite:0});expect(comparePcm(a,a)).toEqual({exact:true,maxError:0,mismatchedSamples:0});expect(comparePcm(a,[new Float32Array([0,.4]),a[1]]).exact).toBe(false);expect(pcmMetrics([new Float32Array([NaN])]).nonFinite).toBe(1);
});
