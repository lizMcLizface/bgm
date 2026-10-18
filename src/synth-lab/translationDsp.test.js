// @vitest-environment node
import fs from 'node:fs';
import {translatedWasmVoice} from '../app/engine/wasmPreset';
import {parameterTriples} from './patch';
import {fmPacket} from './fmPatch';
const modules=Object.fromEntries(['core','fm'].map(k=>[k,new WebAssembly.Module(fs.readFileSync('public/synth-lab/'+k+'.wasm'))]));
function render(raw,frames=144000,off=57600){
 const spec=translatedWasmVoice({masterVolume:.4,filterFreq:18000,...raw}),fm=spec.kind==='fm',e=new WebAssembly.Instance(modules[fm?'fm':'core'],{}).exports,prefix=fm?'fm':'engine';e[prefix+'_init'](48000);
 if(fm){const p=fmPacket(spec.patch);for(const a of p.globals)e.fm_param(...a);for(const a of p.operators)e.fm_op(...a);for(const a of p.routes)e.fm_route(...a);for(const a of p.carriers)e.fm_carrier(...a);}
 else for(const a of parameterTriples(spec.patch))e.engine_param(...a);
 e[prefix+'_event'](0,1,0,69,1);e[prefix+'_event'](1,1,off,0,0);const out=new Float32Array(frames);
 for(let at=0;at<frames;at+=128){const n=Math.min(128,frames-at);e[prefix+'_render'](n);out.set(new Float32Array(e.memory.buffer,fm?e.fm_output(0):e.engine_left(),n),at);}return out;
}
const rms=(data,from,to)=>{const a=data.slice(Math.round(from*48000),Math.round(to*48000));return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);};
const amplitude=(data,hz)=>{let re=0,im=0;for(let i=4800;i<14400;i++){const t=i/48000;re+=data[i]*Math.cos(t*hz*2*Math.PI);im+=data[i]*Math.sin(t*hz*2*Math.PI);}return Math.hypot(re,im);};

test('translated sustained sines have no invented half-frequency square sub',()=>{
 const x=render({vcoType:'sine',gainAttack:.005,gainDecay:1.2,gainSustain:.1,gainRelease:1});
 expect(amplitude(x,220)/amplitude(x,440)).toBeLessThan(.002);expect([...x].every(Number.isFinite)).toBe(true);
});
test('translated organ and hollow voices preserve their defining harmonic ratios',()=>{
 for(const [vcoType,harmonics]of [['organ',[.8,.6,.5]],['hollow',[0,.5,0]]]){
  const x=render({vcoType,gainAttack:0,gainDecay:0,gainSustain:.7,gainRelease:.3});const fundamental=amplitude(x,440);
  harmonics.forEach((a,i)=>expect(amplitude(x,(i+2)*440)/fundamental).toBeCloseTo(a,1));
 }
});
test('legacy decay and long release keep the original full envelope in both source engines',()=>{
 for(const fmIndex of [0,.15]){
  const x=render({vcoType:'sine',gainAttack:.01,gainDecay:1,gainSustain:.1,gainRelease:1,fmIndex,fmRatio:2});
  const early=rms(x,.04,.09),middle=rms(x,.485,.535),held=rms(x,1.1,1.15),release=rms(x,1.575,1.625);
  // Original power-2 decay is still ~78% of peak at its halfway point;
  // its release still holds ~84% of the held body at 0.4 seconds.
  expect(middle/early).toBeGreaterThan(.72);expect(middle/early).toBeLessThan(.83);expect(release/held).toBeGreaterThan(.79);expect(release/held).toBeLessThan(.89);
  expect(rms(x,2.25,2.3)).toBeLessThan(1e-6);
 }
});
test('translated instantaneous sustain starts at its written level without a false attack spike',()=>{
 const x=render({vcoType:'sine',gainAttack:0,gainDecay:0,gainSustain:.3,gainRelease:0});
 const early=rms(x,.02,.07),body=rms(x,.4,.45);expect(Math.abs(20*Math.log10(early/body))).toBeLessThan(.1);expect(rms(x,1.4,1.45)).toBeLessThan(1e-8);
});
test('translated band-pass retains unity centre gain instead of multiplying it by Q',()=>{
 const base={vcoType:'sine',gainAttack:0,gainDecay:0,gainSustain:.5,gainRelease:.3};const plain=render({...base,filterFreq:18000});
 for(const filterQ of [.8,1.5]){const band=render({...base,filterType:'bandpass',filterFreq:440,filterQ});expect(rms(band,.2,.3)/rms(plain,.2,.3)).toBeCloseTo(1,1);}
});
