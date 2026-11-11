// @vitest-environment node
import fs from 'node:fs';import {it,expect}from 'vitest';
import {OwnedTapeShaper,tapeShaperSpec,validateTapeShaperSpec}from './ownedTapeShaper';
const module=new WebAssembly.Module(fs.readFileSync(process.env.OWNED_TAPE_WASM??'public/modular-audio/tape-fx.wasm'));
const make=(spec=tapeShaperSpec(),e=new WebAssembly.Instance(module,{}).exports)=>new OwnedTapeShaper(e,spec,48000);
function render(d,total,cadence=[128],channels=2){const out=[new Float32Array(total),new Float32Array(total)];for(let frame=0,k=0;frame<total;k++){const n=Math.min(total-frame,cadence[k%cadence.length]);for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++)d.input[ch][i]=Math.fround(.3*Math.sin((frame+i)*(.013+ch*.009))+.1*Math.cos((frame+i)*.21+ch));d.render(n,channels);out[0].set(d.left.subarray(0,n),frame);out[1].set(d.right.subarray(0,n),frame);frame+=n;}return out;}
it('retains the pinned2x impulse group delay and isolates stereo channel state',()=>{
 const d=make(tapeShaperSpec(0,'linear'));try{d.input[0].fill(0);d.input[1].fill(0);d.input[0][0]=1;d.render(1024);let peak=0,at=0;for(let i=0;i<1024;i++)if(Math.abs(d.left[i])>peak){peak=Math.abs(d.left[i]);at=i;}expect(at).toBe(128);expect(d.right.subarray(0,1024).every(v=>v===0)).toBe(true);expect(d.stats()).toMatchObject({frame:1024,groupDelayFrames:128});}finally{d.dispose();}
});
it.each([0,.3,1])('owns exact callback-independent state and reset replay at drive%s',drive=>{
 const e=new WebAssembly.Instance(module,{}).exports,a=make(tapeShaperSpec(drive),e),b=make(JSON.parse(JSON.stringify(tapeShaperSpec(drive))),e);a.refresh();b.refresh();try{const actual=render(a,8193,[1,37,509,113]);expect(render(b,8193)).toEqual(actual);const before=b.stats();a.reset();expect(b.stats()).toEqual(before);expect(render(a,8193,[509])).toEqual(actual);}finally{a.dispose();b.dispose();}
});
it('upmixes mono explicitly without cross-channel dependence',()=>{
 const d=make(tapeShaperSpec(.7));try{const pcm=render(d,10001,[113,509],1);expect(pcm[0]).toEqual(pcm[1]);}finally{d.dispose();}
});
it('requires an explicit immutable primitive profile and valid drive/rate/channel bounds',()=>{
 expect(()=>validateTapeShaperSpec({...tapeShaperSpec(),profile:'generic-oversampler'})).toThrow();expect(()=>make(tapeShaperSpec(Infinity))).toThrow();const d=make();try{expect(()=>new OwnedTapeShaper(d.e,tapeShaperSpec(),47999.5)).toThrow();expect(()=>d.render(2049)).toThrow();expect(()=>d.render(1,0)).toThrow();}finally{d.dispose();}d.dispose();expect(()=>d.render(1)).toThrow('Disposed');
});
