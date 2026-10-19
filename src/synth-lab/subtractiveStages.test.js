// @vitest-environment node
import fs from 'node:fs';
import {parameterTriples} from './patch';
import {DSP_CASES,dspFixture,prepareDsp,compareDsp} from './profileDsp';
for(const candidate of ['.tmp/dsp-stages/core.wasm','.tmp/subtractive-unused-sub/core.wasm']){
const available=fs.existsSync(candidate);
(available?describe:describe.skip)('isolated subtractive build '+candidate,()=>{
 const module=path=>new WebAssembly.Module(fs.readFileSync(path));
 const run=f=>[module('public/synth-lab/core.wasm'),module(candidate)].map(m=>prepareDsp(m,f).run({capture:true}));
 test.each([44100,48000,96000])('preserves source samples and state at %i Hz',rate=>{
  for(const spec of DSP_CASES.filter(s=>s.kernel==='core')){
   const f=dspFixture(spec,{rate,seconds:.251}),[a,b]=run(f);expect(compareDsp(a.pcm,b.pcm).nonFinite,spec.id).toBe(0);expect(compareDsp(a.pcm,b.pcm).maxDifference,spec.id).toBe(0);expect(b.stats,spec.id).toEqual(a.stats);
  }
 },30000);
 test('keeps sub-oscillator phase continuous across live zero/nonzero mix changes',()=>{
  const f=dspFixture(DSP_CASES.find(c=>c.id==='core-lanes8'),{seconds:1});
  const render=path=>{const e=new WebAssembly.Instance(module(path),{}).exports;e.engine_init(48000);parameterTriples(f.patch).forEach(v=>e.engine_param(...v));e.engine_event(0,1,0,48,.7);e.engine_event(0,2,0,67,.6);const pcm=[new Float32Array(48000),new Float32Array(48000)];for(let at=0;at<48000;at+=128){if([2048,8192,16384,24576,32768].includes(at))for(let scope=1;scope<=2;scope++)e.engine_param(scope,7,at===8192||at===24576?.35:0);const n=Math.min(128,48000-at);e.engine_render(n);for(let c=0;c<2;c++)pcm[c].set(new Float32Array(e.memory.buffer,c?e.engine_right():e.engine_left(),n),at);}return pcm;};
  expect(compareDsp(render('public/synth-lab/core.wasm'),render(candidate)).maxDifference).toBe(0);
 });
 test('retains acoustic release across outlined stage boundaries',()=>{
  const f=dspFixture(DSP_CASES.find(c=>c.id==='core-rosin'),{seconds:6});f.notes=f.notes.map(n=>({...n,duration:.3}));const [a,b]=run(f);expect(compareDsp(a.pcm,b.pcm).maxDifference).toBe(0);expect(b.stats).toEqual(a.stats);
 },30000);
});

}
