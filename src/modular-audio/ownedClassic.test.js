// @vitest-environment node
import fs from 'node:fs';import {it,expect}from 'vitest';import {OwnedClassic,OWNED_CLASSIC_MODELS,saveClassicConfig,loadClassicConfig}from './ownedClassic';
const wasm=new WebAssembly.Module(fs.readFileSync(process.env.OWNED_CLASSIC_WASM??'public/synths/classics.wasm'));
const e=()=>new WebAssembly.Instance(wasm,{}).exports,config=model=>({version:1,model,parameters:[]});
const run=(g,frames,step=127)=>{const l=new Float32Array(frames),r=new Float32Array(frames);for(let at=0;at<frames;){const n=Math.min(step,frames-at);g.render(n);l.set(g.left.subarray(0,n),at);r.set(g.right.subarray(0,n),at);at+=n;}return [l,r];};
it.each(OWNED_CLASSIC_MODELS)('owns model %i state independently in one memory and exactly replays saved configuration',model=>{
 const ex=e(),a=new OwnedClassic(ex,config(model)),b=new OwnedClassic(ex,loadClassicConfig(saveClassicConfig(config(model))));a.refresh();b.refresh();try{a.note(0,1,60,.7);b.note(0,1,60,.7);expect(run(a,8192)).toEqual(run(b,8192));a.panic();expect(a.stats().active).toBe(0);expect(b.stats().frame).toBe(8192);a.reset();a.note(0,1,60,.7);b.reset();b.note(0,1,60,.7);expect(run(a,8192,113)).toEqual(run(b,8192,113));const frame=b.stats().frame;a.dispose();expect(b.stats().frame).toBe(frame);}finally{a.dispose();b.dispose();}
});
it('preserves sustain/soft controls, rejects unsupported table engines and bounds events/blocks',()=>{
 const ex=e();for(const model of [7,12,14,-1])expect(()=>new OwnedClassic(ex,config(model))).toThrow();expect(ex.classic_owned_new(NaN,0)).toBe(0);const g=new OwnedClassic(ex,config(1));try{g.note(2,5,1);g.note(2,6,.5);g.note(0,1,60,.7);g.note(1,1);g.render(1024);expect(g.stats().active).toBeGreaterThan(0);g.note(2,5,0);expect(()=>g.note(2,7,0)).toThrow();expect(()=>g.note(0,0,60,.7)).toThrow();expect(()=>g.render(2049)).toThrow();expect(()=>g.param(199,0)).toThrow();expect(()=>g.seq(0)).toThrow();}finally{g.dispose();}expect(()=>g.render(1)).toThrow('Disposed');
});
