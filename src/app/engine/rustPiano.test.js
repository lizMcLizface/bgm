// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {renderPiano,renderPianoBody} from './piano';
import {createRustPiano,supportsRustPiano} from './rustPiano';
const module=new WebAssembly.Module(fs.readFileSync('public/piano-preparation/piano.wasm'));
it('matches the existing modal note and body across controls, registers and rates',()=>{
 const r=createRustPiano(module);let max=0,bodyMax=0,comparisons=0;
 try{for(const type of ['felt','electric'])for(const sr of [8000,44100,48000,96000])for(const freq of [55,261.63,1760])for(const settings of [{},{decay:.3,brightness:1,hammer:1,unison:0,velocity:1,resonance:1,softness:0,seed:4294967295},{decay:.7,brightness:.2,hammer:.8,unison:.6,velocity:.3,resonance:.55,softness:.65,seed:19}]){
  const options={...settings,type,sustain:.28},a=renderPiano(sr,freq,options),b=r.renderNote(sr,freq,options);expect(b.length).toBe(a.length);for(let i=0;i<a.length;i++){if(!Number.isFinite(b[i]))throw Error('Non-finite Rust piano sample');max=Math.max(max,Math.abs(a[i]-b[i]));}const ba=renderPianoBody(sr,freq,options),bb=r.renderBody(sr,freq,options);for(let i=0;i<ba.length;i++)bodyMax=Math.max(bodyMax,Math.abs(ba[i]-bb[i]));comparisons++;
 }expect(max).toBeLessThan(1e-6);expect(bodyMax).toBeLessThan(1e-7);expect(comparisons).toBe(72);expect(r.activeHandles).toBe(0);}finally{r.dispose();}
},60000);
it('owns independent handles and instances across allocations, release and reload',()=>{
 const a=createRustPiano(module),b=createRustPiano(module),settings={type:'electric',decay:.4,seed:113};const first=a.createNote(48000,220,settings),expected=first.samples(),second=a.createNote(96000,55,{decay:5});expect(first.samples()).toEqual(expected);second.dispose();expect(first.samples()).toEqual(expected);expect(b.renderNote(48000,220,JSON.parse(JSON.stringify(settings)))).toEqual(expected);a.dispose();expect(()=>first.samples()).toThrow('disposed');expect(b.renderNote(48000,220,settings)).toEqual(expected);b.dispose();
});
it('rejects other families without substituting their sound and clamps modal strike controls like legacy',()=>{
 const r=createRustPiano(module);for(const type of ['measured','unknown']){expect(supportsRustPiano({type})).toBe(false);expect(()=>r.renderNote(48000,220,{type})).toThrow('original renderer');}const options={decay:-1,brightness:3,velocity:NaN,softness:-3,unison:5,resonance:Infinity};const a=renderPiano(5000,Infinity,options),b=r.renderNote(5000,Infinity,options);expect(b.length).toBe(a.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));expect(max).toBeLessThan(1e-6);r.dispose();expect(()=>r.renderNote(48000,220)).toThrow('disposed');
});

it('matches grand, felted and upright acoustic synthesis including wear, body modes and action noise',()=>{
 const r=createRustPiano(module);try{let max=0;for(const type of ['grand','felted','upright'])for(const sr of [8000,48000,96000])for(const freq of [55,261.63,1760])for(const controls of [{},{decay:.5,brightness:.2,hammer:.75,unison:.65,velocity:.35,seed:109,resonance:.55,wear:.8}]){const options={...controls,type};const a=renderPiano(sr,freq,options),b=r.renderNote(sr,freq,options);expect(b.length).toBe(a.length);for(let i=0;i<a.length;i++){if(!Number.isFinite(b[i]))throw Error('Non-finite acoustic sample');max=Math.max(max,Math.abs(a[i]-b[i]));}}expect(max).toBeLessThan(1e-6);expect(()=>r.renderBody(48000,220,{type:'felted'})).toThrow('original renderer');}finally{r.dispose();}
},60000);
it.each(['ambient','glass','drama','soft','subdued','concert'])('matches fitted %s bass shaping, stiffness, ripple and soundboard without shared random state',type=>{
 const a=createRustPiano(module),b=createRustPiano(module);try{let max=0;for(const sr of [8000,48000,96000])for(const frequency of [27.5,55,164.81,523.25,1760])for(const settings of [{decay:.4},{decay:.5,brightness:.2,hammer:.75,unison:.65,velocity:.35,seed:4294967295,resonance:.55,wear:.8}]){const options={...settings,type},js=renderPiano(sr,frequency,options),rust=a.renderNote(sr,frequency,options);expect(rust.length).toBe(js.length);for(let i=0;i<js.length;i++){if(!Number.isFinite(rust[i]))throw Error('Non-finite fitted acoustic sample');max=Math.max(max,Math.abs(js[i]-rust[i]));}}expect(max).toBeLessThan(1e-6);const options={type,seed:109,decay:.4},handle=a.createNote(48000,55,options),pcm=handle.samples();a.renderNote(48000,220,{type,seed:12});expect(handle.samples()).toEqual(pcm);handle.dispose();expect(b.renderNote(48000,55,JSON.parse(JSON.stringify(options)))).toEqual(pcm);expect(()=>a.renderBody(48000,220,{type})).toThrow('original renderer');expect(a.activeHandles).toBe(0);}finally{a.dispose();b.dispose();}
},60000);
