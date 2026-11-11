// @vitest-environment node
import fs from 'node:fs';import {expect,it}from 'vitest';
import {OwnedNativeCompressor,ownedNativeCompressorSpec,saveOwnedNativeCompressorSpec,loadOwnedNativeCompressorSpec,validateOwnedNativeCompressorSpec}from './ownedNativeCompressor';
const module=new WebAssembly.Module(fs.readFileSync(process.env.OWNED_NATIVE_COMPRESSOR_WASM??'public/modular-audio/native-compressor.wasm'));
const make=(rate=48000,spec=ownedNativeCompressorSpec(),e=new WebAssembly.Instance(module,{}).exports)=>new OwnedNativeCompressor(e,spec,rate);
it('keeps editable builder configs separate from immutable installed snapshots and persisted DSP targets',()=>{
 const spec=ownedNativeCompressorSpec(),d=make(48000,spec);let b;
 try{spec.parameters[0][1]=-90;expect(d.value(0)).toBe(-24);const initial=d.spec;expect(()=>{d.spec.parameters[0][1]=-90;}).toThrow();expect(()=>d.spec.parameters.push([0,-90])).toThrow();d.patch([[2,4]]);expect(initial.parameters[2][1]).toBe(12);expect(()=>{d.spec.parameters[0][1]=-90;}).toThrow();expect(d.spec.parameters[0][1]).toBe(d.value(0));const restored=loadOwnedNativeCompressorSpec(saveOwnedNativeCompressorSpec(d.spec));expect(restored.parameters.map(([i,v])=>v)).toEqual(Array.from({length:5},(_,i)=>d.value(i)));b=make(48000,restored);expect(render(d,4001,[1,37,509])).toEqual(render(b,4001));}finally{d.dispose();b?.dispose();}
});
function render(d,total,parts=[128],automate=false){const pcm=[new Float32Array(total),new Float32Array(total)],events=automate?[[128,[[0,-18.123456789]]],[512,[[2,2.7123456789]]],[1024,[[1,6.123456789]]]]:[];let event=0;for(let frame=0,k=0;frame<total;k++){
 if(events[event]?.[0]===frame)d.patch(events[event++][1]);const n=Math.min(total-frame,parts[k%parts.length],(events[event]?.[0]??total)-frame);for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++)d.input[ch][i]=Math.fround((frame+i<1000?.05:.6)*Math.sin((frame+i)*(.071+ch*.019))+.04*Math.cos((frame+i)*.313+ch));d.render(n);for(let ch=0;ch<2;ch++)pcm[ch].set(d.output[ch].subarray(0,n),frame);frame+=n;
 }return pcm;}
it.each([8000,24000,44100,48000,96000,192000])('owns callback-independent32/128 clocks and persisted independent state at %i Hz',rate=>{
 const spec=ownedNativeCompressorSpec({threshold:-28.123456789,knee:12.123456789,ratio:4.123456789,attack:.005123456789,release:.1123456789}),e=new WebAssembly.Instance(module,{}).exports,a=make(rate,spec,e),b=make(rate,loadOwnedNativeCompressorSpec(saveOwnedNativeCompressorSpec(spec)),e);a.refresh();b.refresh();try{const pcm=render(a,12001,[1,13,37,509],true);expect(render(b,12001,[128],true)).toEqual(pcm);const before=b.stats();a.reset();expect(b.stats()).toEqual(before);b.reset();expect(render(a,3001,[509])).toEqual(render(b,3001,[1,37]));expect(a.value(0)).toBe(-18.123456789);expect(a.stats().latencyFrames).toBe(Math.min(Math.trunc(Math.fround(Math.fround(.006)*rate)),1023));}finally{a.dispose();b.dispose();}
});
it('keeps actual native lookahead, mono mapping and silent stereo state explicit',()=>{
 const d=make();try{d.input[0].fill(0);d.input[1].fill(0);d.input[0][0]=1;d.render(512);expect(d.left.findIndex(v=>v!==0)).toBe(288);expect(d.right.every(v=>v===0)).toBe(true);d.reset();d.input[0][0]=1;d.render(512,1);expect(d.left).toEqual(d.right);expect(d.stats().tailSeconds).toBe(1.625);}finally{d.dispose();}
});
it('uses stereo-linked detection while preserving independent channel delay buffers',()=>{
 const a=make(),b=make();try{for(let i=0;i<2048;i++){a.input[0][i]=b.input[0][i]=.05;a.input[1][i]=0;b.input[1][i]=.8;}a.render(2048);b.render(2048);expect(Math.abs(b.left[1800])).toBeLessThan(Math.abs(a.left[1800]));expect(a.right.every(v=>v===0)).toBe(true);}finally{a.dispose();b.dispose();}
});
it('rejects partial/raw configurations and edits outside the native control clock',()=>{
 const spec=ownedNativeCompressorSpec();expect(()=>validateOwnedNativeCompressorSpec({...spec,parameters:spec.parameters.slice(1)})).toThrow();const e=new WebAssembly.Instance(module,{}).exports,h=e.native_comp_new(48000);try{expect(e.native_comp_initial(h,0,-24)).toBe(1);expect(e.native_comp_initial(h,0,-24)).toBe(0);expect(e.native_comp_prepare(h)).toBe(0);}finally{e.native_comp_free(h);}const d=make();try{render(d,13);expect(()=>d.patch([[0,-12]])).toThrow('128-frame');expect(d.value(0)).toBe(-24);expect(()=>d.render(2049)).toThrow();expect(()=>d.render(1,0)).toThrow();expect(()=>new OwnedNativeCompressor(d.e,spec,47999.5)).toThrow();}finally{d.dispose();}expect(()=>d.render(1)).toThrow('Disposed');
});
it('preserves zero attack/release parameter bounds with finite audio and fresh-node reset semantics',()=>{
 const d=make(192000,ownedNativeCompressorSpec({threshold:-100,knee:40,ratio:20,attack:0,release:0}));try{const first=render(d,6001);expect(first.every(a=>a.every(Number.isFinite))).toBe(true);d.reset();expect(render(d,6001,[1,509])).toEqual(first);expect(d.stats().latencyFrames).toBe(1023);}finally{d.dispose();}
});
