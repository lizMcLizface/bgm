// @vitest-environment node
import fs from 'node:fs';
import {DSP_CASES,dspFixture,prepareDsp,compareDsp} from './profileDsp';
import {bankFixture} from './fmBankBench';
import {FM_RECIPES,cloneFM} from './fmPatch';
import {parameterTriples} from './patch';
import {fmPacket} from './fmPatch';
const module=(file)=>new WebAssembly.Module(fs.readFileSync(file));
const available=fs.existsSync('public/synth-lab/core-acoustic.wasm')&&fs.existsSync('public/synth-lab/fm-fast.wasm'),matrix=available?describe:describe.skip;
matrix('SIMD acoustic mode filters',()=>{
 test.each(['core','fm'])('%s retains live colour changes, threshold crossings and quality changes',kernel=>{
  const spec=DSP_CASES.find(c=>c.id===(kernel==='core'?'core-colour':'fm-colour')),f=dspFixture(spec),files=['public/synth-lab/'+kernel+'.wasm','public/synth-lab/'+(kernel==='core'?'core-acoustic':'fm-fast')+'.wasm'];
  const run=file=>{const e=new WebAssembly.Instance(module(file),{}).exports,fm=kernel==='fm';(fm?e.fm_init:e.engine_init)(48000);
   const configure=p=>{if(fm){const q=fmPacket(p);q.globals.forEach(v=>e.fm_param(...v));q.operators.forEach(v=>e.fm_op(...v));q.routes.forEach(v=>e.fm_route(...v));q.carriers.forEach(v=>e.fm_carrier(...v));}else parameterTriples(p).forEach(v=>e.engine_param(...v));};
   const p=structuredClone(f.patch);configure(p);const event=fm?e.fm_event:e.engine_event;event(0,1,0,55,.6);event(1,1,28000,0,0);const out=new Float32Array(48000*2);
   for(let at=0;at<48000;at+=128){if([4096,8192,12288,16384,20480,24576].includes(at)){const lanes=fm?[p.global]:p.layers;for(const l of lanes){l.body=at===4096||at===16384?0:at===8192?.000009:.65;l.formant=at===4096?0:at===12288?.000011:.4;l.vowel=at===20480?2:0;l.bodyType=at===24576?4:1;l.bodyDecay=at===20480?2:1;}if(fm)p.global.quality=at===12288?2:at===20480?0:1;configure(p);}const n=Math.min(128,48000-at);(fm?e.fm_render:e.engine_render)(n);for(let c=0;c<2;c++)out.set(new Float32Array(e.memory.buffer,(fm?e.fm_output(c):c===0?e.engine_left():e.engine_right()),n),c*48000+at);}
   return out;};
  const reference=run(files[0]);for(const file of files.slice(1)){const output=run(file);for(let i=0;i<output.length;i++)if(output[i]!==reference[i])throw Error(kernel+' automation mismatch at '+i);}
 });
 test.each([44100,48000,96000])('retain exact source PCM at %i Hz',rate=>{
  for(const kernel of ['core','fm']){const modules=[module('public/synth-lab/'+kernel+'.wasm'),module('public/synth-lab/'+(kernel==='core'?'core-acoustic':'fm-fast')+'.wasm')];

   for(const spec of DSP_CASES.filter(c=>c.kernel===kernel)){const f=dspFixture(spec,{rate,seconds:.35}),a=modules.map(m=>prepareDsp(m,f).run({capture:true})),p=compareDsp(a[0].pcm,a[1].pcm);expect(p.nonFinite,spec.id).toBe(0);for(const r of a.slice(1)){expect(compareDsp(a[0].pcm,r.pcm).maxDifference,spec.id).toBe(0);expect(r.stats,spec.id).toEqual(a[0].stats);}}
  }
 },60000);
 test('works across the FM bank with heterogeneous patches',()=>{
  const modules={scalar:module('public/synth-lab/fm.wasm'),bank:module('public/synth-lab/fm-fast.wasm')},patches=[0,2,5,9].map(i=>cloneFM(FM_RECIPES[i]));
  const a=['scalar','bank'].map(mode=>bankFixture(modules,patches,{mode,capture:true,seconds:1,voices:2}));
  for(let s=0;s<4;s++)for(let i=0;i<a[0].pcm[s].length;i++)if(a[0].pcm[s][i]!==a[1].pcm[s][i])throw Error('Bank PCM mismatch '+s+':'+i);
 });
 test.each(['core-rosin','core-colour','fm-choir-release'])('%s preserves a six-second release window',id=>{
  const spec=DSP_CASES.find(c=>c.id===id),f=dspFixture(spec,{seconds:6});f.notes=f.notes.map(n=>({...n,duration:.3}));const a=[module('public/synth-lab/'+f.kernel+'.wasm'),module('public/synth-lab/'+(f.kernel==='core'?'core-acoustic':'fm-fast')+'.wasm')].map(m=>prepareDsp(m,f).run({capture:true}));expect(compareDsp(a[0].pcm,a[1].pcm).maxDifference).toBe(0);expect(a[1].stats).toEqual(a[0].stats);
 },30000);
});
