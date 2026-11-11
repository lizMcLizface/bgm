// @vitest-environment node
import fs from 'node:fs';import {it,expect}from 'vitest';
import {OwnedTape,ownedTapeSpec,saveOwnedTapeSpec,loadOwnedTapeSpec,validateOwnedTapeSpec}from './ownedTape';
const module=new WebAssembly.Module(fs.readFileSync(process.env.OWNED_TAPE_WASM??'public/modular-audio/tape-fx.wasm'));
const make=(spec=ownedTapeSpec({wow:.7,wowRate:1.23,flutter:.6,drive:.3,tone:6100},[0,.3,1]),rate=48000,e=new WebAssembly.Instance(module,{}).exports)=>new OwnedTape(e,spec,rate);
function render(d,total,cadence=[128],channels=2){const out=[new Float32Array(total),new Float32Array(total)];for(let frame=0,k=0;frame<total;k++){const n=Math.min(total-frame,cadence[k%cadence.length]);for(let ch=0;ch<channels;ch++)for(let i=0;i<n;i++)d.input[ch][i]=Math.fround(.2*Math.sin((frame+i)*(.013+ch*.006))+.04*Math.cos((frame+i)*.047+ch));d.render(n,channels);out[0].set(d.left.subarray(0,n),frame);out[1].set(d.right.subarray(0,n),frame);frame+=n;}return out;}
it.each([44100,48000,96000])('owns exact callback-independent cold start, save/reload, reset and separate Tape handles at %i Hz',rate=>{
 const spec=ownedTapeSpec({wow:.7123456789,wowRate:1.23456789,flutter:.6123456789,drive:.3123456789,tone:6100.123456789},[.3123456789,1]),e=new WebAssembly.Instance(module,{}).exports,a=make(spec,rate,e),b=make(loadOwnedTapeSpec(saveOwnedTapeSpec(spec)),rate,e);a.refresh();b.refresh();try{const pcm=render(a,24001,[1,37,509,113]);expect(render(b,24001)).toEqual(pcm);expect(pcm[0].some(v=>v!==0)).toBe(true);const before=b.stats();a.reset();expect(b.stats()).toEqual(before);expect(render(a,24001,[509])).toEqual(pcm);expect(a.value(1)).toBe(1.23456789);expect(a.value(4)).toBe(6100.123456789);}finally{a.dispose();b.dispose();}
});
it('preserves native constructor tone transition and explicit mono mapping',()=>{
 const d=make(ownedTapeSpec(),48000);try{d.input[0][0]=.5;d.render(1,1);expect(d.stats().lastToneHz).toBe(350);expect(d.stats().resamplerGroupDelayFrames).toBe(128);expect(d.stats().baseDelayFrames).toBe(Math.fround(.006)*48000);expect(d.left[0]).toBe(d.right[0]);const pcm=render(d,10001,[113,509],1);expect(pcm[0]).toEqual(pcm[1]);}finally{d.dispose();}
});
it.each([8000,24000])('carries only the clipped boundary tone at %i Hz and preserves raw within-quantum targets',rate=>{
 const aligned=make(ownedTapeSpec({tone:20000}),rate),inside=make(ownedTapeSpec({tone:20000}),rate);try{
  render(aligned,8192);aligned.target(4,500);aligned.render(1);expect(aligned.stats().toneTargetHz).toBe(rate*.5);
  render(inside,8193);inside.target(4,500);inside.render(1);expect(inside.stats().toneTargetHz).toBe(20000);expect(inside.stats().lastToneHz).toBe(rate*.5);
 }finally{aligned.dispose();inside.dispose();}
});
it.each([8000,24000])('retains the native converged segment scalar for captured prebooked tone events at %i Hz',rate=>{
 const c=Math.fround(1-Math.exp(-1/(Math.fround(.03)*rate))),base=rate*.5,expected=Math.fround(base+Math.fround((20000-base)*c));
 for(const frame of [8192,8193]){const d=make(ownedTapeSpec({tone:20000}),rate);try{render(d,frame);d.target(4,500,frame/rate);d.render(1);expect(d.stats().toneTargetHz).toBe(expected);}finally{d.dispose();}}
});
it('separates exact integer control frames from native target seconds without losing fractional offset',()=>{
 const d=make(ownedTapeSpec(),44100);try{render(d,13);expect(()=>d.target(0,.7123456789123,13/44100)).toThrow('rejected');expect(d.value(0)).toBe(0);d.target(0,.5123456789123);expect(d.value(0)).toBe(.5123456789123);d.input[0][0]=d.input[1][0]=0;d.render(1);d.target(0,.7123456789123,13/44100);expect(d.value(0)).toBe(.7123456789123);d.render(1);expect(d.stats().wowDepthSeconds).toBeGreaterThan(0);}finally{d.dispose();}
});
it('selects only prepared drive curves at native quantum boundaries while preserving phase/history',()=>{
 const d=make();try{render(d,1);expect(()=>d.target(3,1)).toThrow('128-frame');expect(()=>d.target(3,.8)).toThrow('not prepared');render(d,127);const phase=d.stats().wowPhase;d.target(3,1);expect(d.value(3)).toBe(1);expect(d.stats().wowPhase).toBe(phase);d.reset();expect(d.value(3)).toBe(1);expect(d.stats().wowPhase).toBe(0);expect(d.stats().toneTargetHz).toBe(350);}finally{d.dispose();}
});
it('validates complete targets and bounded immutable preparation on host and raw ABI',()=>{
 const spec=ownedTapeSpec();expect(()=>validateOwnedTapeSpec({...spec,parameters:spec.parameters.slice(1)})).toThrow();expect(()=>ownedTapeSpec({drive:.3},[0,1])).toThrow('not prepared');expect(()=>ownedTapeSpec({},Array.from({length:33},(_,i)=>i/32))).toThrow();expect(()=>ownedTapeSpec({},[0,0])).toThrow();const e=new WebAssembly.Instance(module,{}).exports,h=e.tape_owned_new(48000);try{expect(e.tape_owned_prepare_drive(h,0)).toBe(1);expect(e.tape_owned_initial(h,0,.5)).toBe(1);expect(e.tape_owned_initial(h,0,.5)).toBe(0);expect(e.tape_owned_prepare(h)).toBe(0);}finally{e.tape_owned_free(h);}
});
it('rejects invalid memory/rate/channel use and retains latest controls after explicit reset',()=>{
 const d=make();try{expect(()=>d.render(2049)).toThrow();expect(()=>d.render(1,0)).toThrow();expect(()=>d.target(4,Infinity)).toThrow();expect(()=>new OwnedTape(d.e,ownedTapeSpec(),47999.5)).toThrow();d.target(0,.34567891234567);d.reset();expect(d.value(0)).toBe(.34567891234567);}finally{d.dispose();}d.dispose();expect(()=>d.render(1)).toThrow('Disposed');
});
