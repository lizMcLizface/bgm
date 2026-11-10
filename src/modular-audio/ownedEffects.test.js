// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {OwnedInserts,ownedInsertsSpec,saveOwnedInsertsSpec,loadOwnedInsertsSpec,validateOwnedInsertsSpec} from './ownedInserts';
import {OwnedEffects,ownedEffectsSpec,saveOwnedEffectsSpec,loadOwnedEffectsSpec,validateOwnedEffectsSpec} from './ownedEffects';
const variants=[['inserts',OwnedInserts,ownedInsertsSpec,saveOwnedInsertsSpec,loadOwnedInsertsSpec,validateOwnedInsertsSpec,2],['effects',OwnedEffects,ownedEffectsSpec,saveOwnedEffectsSpec,loadOwnedEffectsSpec,validateOwnedEffectsSpec,6]];
const moduleFor=name=>new WebAssembly.Module(fs.readFileSync(`${process.env.OWNED_EFFECTS_AUDIT_WASM_DIR??'public/synth-lab'}/${name}.wasm`));
const input=(d,frame,n)=>{for(let c=0;c<d.input.length;c++)for(let i=0;i<n;i++)d.input[c][i]=Math.fround(.12*Math.sin((frame+i)*(.011+c*.004)));};
const render=(d,total)=>{const out=[new Float32Array(total),new Float32Array(total)];for(let at=0;at<total;at+=128){const n=Math.min(128,total-at);input(d,at,n);d.render(n);out[0].set(d.left.subarray(0,n),at);out[1].set(d.right.subarray(0,n),at);}return out;};
it.each(variants)('owns independent %s buffers and replays actual saved parameters and PCM after reset',(_name,Class,spec,save,load)=>{
 const name=_name,module=moduleFor(name),e=new WebAssembly.Instance(module,{}).exports,settings=name==='inserts'?{phaser:.6,chorus:.4,flanger:.35,saturation:.3,lowGain:3,gain:-2}:{reverb:.4,delay:.3,delayMs:73,decay:1.3,reverbType:2},s=spec(settings),a=new Class(e,s,48000),b=new Class(e,load(save(s)),48000);a.refresh();b.refresh();
 try{expect(a.input[0].byteOffset).not.toBe(b.input[0].byteOffset);const first=render(a,16001);expect(render(b,16001)).toEqual(first);a.reset();expect(a.stats().frame).toBe(0);expect(b.stats().frame).toBe(16001);expect(render(a,16001)).toEqual(first);a.patch([[0,name==='inserts'?1:0]]);const bFrame=b.stats().frame;a.clear();expect(b.stats().frame).toBe(bFrame);}finally{a.dispose();b.dispose();}expect(()=>a.render(1)).toThrow('Disposed');a.dispose();
});
it.each(variants)('validates complete %s specs and atomic edits without modifying the live target on rejection',(name,Class,spec,_save,_load,validate,channels)=>{
 const good=spec({}),e=new WebAssembly.Instance(moduleFor(name),{}).exports,d=new Class(e,good,48000);try{for(const change of [c=>c.version=2,c=>c.parameters.pop(),c=>c.parameters[0][1]=Infinity,c=>c.parameters[0][0]=999,c=>c.parameters[1]=c.parameters[0]]){const bad=structuredClone(good);change(bad);expect(()=>validate(bad)).toThrow();}for(const edit of [[[0,.5],[999,0]],[[0,.5],[0,.6]],[[0,NaN]]]){expect(()=>d.patch(edit)).toThrow();expect(d.spec).toEqual(good);}expect(()=>d.render(2049)).toThrow('bounds');expect(()=>d.render(-1)).toThrow('bounds');expect(d.stats().frame).toBe(0);expect(d.input).toHaveLength(channels);d.render(0);expect(d.stats().frame).toBe(0);}finally{d.dispose();}
});
it('restores the requested reverb type when reset interrupts its native wet-return fade',()=>{
 const e=new WebAssembly.Instance(moduleFor('effects'),{}).exports,a=new OwnedEffects(e,ownedEffectsSpec({dry:0,reverb:.6,delay:0,reverbType:0}),48000);try{render(a,5000);expect(a.stats().reverbActive).toBe(true);a.patch([[20,3]]);a.render(1);a.reset();const b=new OwnedEffects(e,a.spec,48000);a.refresh();try{expect(render(a,9000)).toEqual(render(b,9000));}finally{b.dispose();}}finally{a.dispose();}
});
it('keeps dry, room and echo input identities separate and clears one tank without touching another',()=>{
 const e=new WebAssembly.Instance(moduleFor('effects'),{}).exports,s=ownedEffectsSpec({dry:0,reverb:.5,delay:0,predelay:0,decay:1.5}),a=new OwnedEffects(e,s,48000),b=new OwnedEffects(e,s,48000);a.refresh();b.refresh();try{
  // A signal in the dry bus cannot leak into the room send or its output.
  a.input[0].fill(.2);a.render(128);expect(a.left.every(v=>v===0)).toBe(true);a.reset();
  for(let at=0;at<4096;at+=128){for(const d of [a,b]){d.input.forEach(x=>x.fill(0));d.input[2][0]=at===0?.5:0;d.render(128);}}
  expect(a.stats().reverbFrames).toBeGreaterThan(0);const bFrames=b.stats().frame;a.clear();for(const d of [a,b]){d.input.forEach(x=>x.fill(0));d.render(128);}expect(a.left.every(x=>x===0)).toBe(true);expect(b.left.some(x=>x!==0)||b.right.some(x=>x!==0)).toBe(true);expect(b.stats().frame).toBe(bFrames+128);
 }finally{a.dispose();b.dispose();}
});
