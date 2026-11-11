// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {OwnedMotion,ownedMotionSpec,saveOwnedMotionSpec,loadOwnedMotionSpec,validateOwnedMotionSpec} from './ownedMotion';
const module=new WebAssembly.Module(fs.readFileSync(process.env.OWNED_MOTION_WASM??'public/modular-audio/motion-fx.wasm'));
const make=(settings={},rate=48000,e=new WebAssembly.Instance(module,{}).exports)=>new OwnedMotion(e,ownedMotionSpec(settings),rate);
function render(d,total,cadence=[128],channels=2){const out=[new Float32Array(total),new Float32Array(total)];for(let frame=0,k=0;frame<total;k++){const n=Math.min(cadence[k%cadence.length],total-frame);for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++)d.input[ch][i]=Math.fround(.2*Math.sin((frame+i)*(.013+ch*.006))+.03*Math.cos((frame+i)*.041+ch));d.render(n,channels);out[0].set(d.left.subarray(0,n),frame);out[1].set(d.right.subarray(0,n),frame);frame+=n;}return out;}
it('passes stereo exactly at zero depth and explicitly upmixes mono',()=>{
 const d=make();try{d.input[0].fill(.2);d.input[1].fill(-.3);d.render(128);expect(d.left.subarray(0,128).every(x=>x===Math.fround(.2))).toBe(true);expect(d.right.subarray(0,128).every(x=>x===Math.fround(-.3))).toBe(true);d.render(128,1);expect(d.left.subarray(0,128)).toEqual(d.right.subarray(0,128));expect(d.stats().latencyFrames).toBe(0);}finally{d.dispose();}
});
it('retains original tremolo range and equal-power stereo balance extrema',()=>{
 const trem=make({tremoloDepth:1,tremoloRate:20},8000),pan=make({autoPanDepth:1,autoPanRate:20},8000);try{for(const d of [trem,pan]){d.input[0].fill(.25);d.input[1].fill(.25);d.render(401);}expect(trem.left[0]).toBe(.125);expect(trem.left[100]).toBe(.25);expect(trem.left[300]).toBe(0);expect(pan.left[100]).toBeLessThan(1e-10);expect(pan.right[100]).toBe(Math.fround(.25*Math.fround(Math.SQRT2)));expect(pan.left[300]).toBe(Math.fround(.25*Math.fround(Math.SQRT2)));expect(pan.right[300]).toBe(0);}finally{trem.dispose();pan.dispose();}
});
it.each([44100,48000,96000])('owns continuous phases and exact save/reload replay across callback partitions at %i Hz',rate=>{
 const s=ownedMotionSpec({tremoloDepth:.7123456789,tremoloRate:4.123456789,autoPanDepth:.6123456789,autoPanRate:.9123456789}),e=new WebAssembly.Instance(module,{}).exports,a=new OwnedMotion(e,s,rate),b=new OwnedMotion(e,loadOwnedMotionSpec(saveOwnedMotionSpec(s)),rate);a.refresh();b.refresh();try{const pcm=render(a,12001,[1,37,509,113]);expect(render(b,12001,[128])).toEqual(pcm);expect(a.value(1)).toBe(4.123456789);const before=b.stats();a.reset();expect(b.stats()).toEqual(before);expect(render(a,12001,[509])).toEqual(pcm);a.patch([[0,.34567891234567],[1,7.123456789]]);expect(a.value(0)).toBe(.34567891234567);expect(b.value(0)).toBe(s.parameters[0][1]);a.reset();expect(a.value(0)).toBe(.34567891234567);}finally{a.dispose();b.dispose();}
});
it('advances both oscillators through silent/zero-depth spans and keeps phase when rates change',()=>{
 const a=make({tremoloRate:20,autoPanRate:10},8000);try{a.input[0].fill(0);a.input[1].fill(0);a.render(100);expect(a.stats().tremoloPhase).toBeCloseTo(.25,12);expect(a.stats().panPhase).toBeCloseTo(.125,12);a.patch([[0,1],[2,1],[1,10]]);a.input[0][0]=a.input[1][0]=.25;a.render(1);expect(a.left[0]).toBeLessThan(.25);expect(a.right[0]).toBeGreaterThan(.25);expect(a.stats().tremoloPhase).toBeCloseTo(.25125,12);}finally{a.dispose();}
});
it('validates complete portable profiles and rejects invalid edits atomically',()=>{
 const d=make(),s=ownedMotionSpec();try{expect(()=>d.patch([[0,.5],[1,Infinity]])).toThrow();expect(d.value(0)).toBe(0);expect(()=>d.patch([[0,.5],[0,.7]])).toThrow();expect(()=>d.render(2049)).toThrow();expect(()=>d.render(1,0)).toThrow();expect(()=>new OwnedMotion(d.e,s,47999.5)).toThrow();expect(()=>validateOwnedMotionSpec({...s,parameters:s.parameters.slice(1)})).toThrow();expect(()=>loadOwnedMotionSpec(JSON.stringify({...s,profile:'other'}))).toThrow();}finally{d.dispose();}d.dispose();expect(()=>d.render(1)).toThrow('Disposed');
});
it('meters each rendered span and clears its peak for the next span without altering controls or phase',()=>{
 const d=make();try{d.input[0].fill(.2);d.input[1].fill(-.3);d.render(128);expect(d.stats().peak).toBe(Math.fround(.3));const phase=d.stats().tremoloPhase;d.input[0][0]=d.input[1][0]=0;d.render(1);expect(d.stats().peak).toBe(0);expect(d.stats().tremoloPhase).toBeGreaterThan(phase);expect(d.value(0)).toBe(0);}finally{d.dispose();}
});
