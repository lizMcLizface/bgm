// @vitest-environment node
import fs from 'node:fs';import {DSP_CASES,dspFixture,prepareDsp,compareDsp} from './profileDsp';import {defaultInserts,insertsPacket} from './insertsConfig';
const mod=file=>new WebAssembly.Module(fs.readFileSync(file));
it.each(['core','core-acoustic','fm','fm-simd','fm-bank','fm-fast'])('%s reaches exact silence after a released note',kind=>{
 const fm=kind.startsWith('fm'),f=dspFixture(DSP_CASES.find(c=>c.id===(fm?'fm-tines':'core-8')),{seconds:1});f.notes=f.notes.map(n=>({...n,duration:.05}));const runner=prepareDsp(mod('public/synth-lab/'+kind+'.wasm'),f);for(let i=0;i<20;i++)runner.run();expect(runner.stat()[0]).toBe(0);for(const x of runner.output)expect(x.subarray(0,128).every(v=>v===0)).toBe(true);
});
it('EQ clears subnormal recursive residue without changing audible samples',()=>{
 const file='public/synth-lab/inserts.wasm',e=new WebAssembly.Instance(mod(file),{}).exports;e.inserts_init(48000);insertsPacket({...defaultInserts(),lowGain:1,midGain:-1,highGain:-1}).forEach(p=>e.inserts_param(...p));e.inserts_settle();const input=[0,1].map(c=>new Float32Array(e.memory.buffer,e.inserts_input(c),2048)),output=[0,1].map(c=>new Float32Array(e.memory.buffer,e.inserts_output(c),2048));input.forEach(v=>v[0]=.1);e.inserts_render(128);input.forEach(v=>v.fill(0));for(let i=0;i<4000;i++)e.inserts_render(128);for(const x of output)expect(x.subarray(0,128).every(v=>v===0)).toBe(true);
});
const before='.tmp/idle-before';(fs.existsSync(before+'/core.wasm')?it:it.skip)('source cleanup preserves the retained audible reference, with only subnormal-tail differences',()=>{
 for(const kernel of ['core','fm'])for(const id of kernel==='core'?['core-8','core-rosin']:['fm-tines','fm-choir']){
  const f=dspFixture(DSP_CASES.find(c=>c.id===id),{seconds:6});f.notes=f.notes.map(n=>({...n,duration:.05}));const a=[before+'/', 'public/synth-lab/'].map(dir=>prepareDsp(mod(dir+kernel+'.wasm'),f).run({capture:true}));const cmp=compareDsp(a[0].pcm,a[1].pcm);expect(cmp.nonFinite,id).toBe(0);expect(cmp.maxDifference,id).toBeLessThan(1e-34);for(let c=0;c<2;c++)for(let i=0;i<a[0].pcm[c].length;i++)if(Math.abs(a[0].pcm[c][i])>1e-20&&a[1].pcm[c][i]!==a[0].pcm[c][i])throw Error('Normal-signal mismatch '+id+':'+i);
 }
},30000);
