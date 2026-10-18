// @vitest-environment node
import fs from 'node:fs';
import {spectralFixture} from './spectralFixtures';
import {renderSpectralKernel,analyseSpectralChannels} from './spectralEngine';
import {qualityFixture,qualityMeasure,QUALITY_SOUNDS} from './qualityFixtures';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm'));
test('moving PWM edges reduce off-harmonic folding without oversampling or losing the body',()=>{
 for(const rate of [44100,48000,96000])for(const hz of [220,997,3137]){
  const f=spectralFixture({test:'sub-pwm',rate,hz}),before=analyseSpectralChannels(renderSpectralKernel(module,f,rate,0,{legacyEdges:true}),f),after=analyseSpectralChannels(renderSpectralKernel(module,f,rate),f);
  expect(after.metrics.offHarmonicDb).toBeLessThan(before.metrics.offHarmonicDb-10);expect(Math.abs(20*Math.log10(after.metrics.rms/before.metrics.rms))).toBeLessThan(2);expect(after.metrics.peak).toBeLessThan(1);
 }
});
test('sync correction remains finite and does not worsen the measured harmonic leakage',()=>{
 for(const rate of [44100,48000,96000]){const f=spectralFixture({test:'sub-sync',rate,hz:3137}),before=analyseSpectralChannels(renderSpectralKernel(module,f,rate,0,{legacyEdges:true}),f),after=analyseSpectralChannels(renderSpectralKernel(module,f,rate),f);expect(after.metrics.offHarmonicDb).toBeLessThan(before.metrics.offHarmonicDb+.1);expect(after.metrics.peak).toBeLessThan(1);}
});
test('unmodulated saw/sine/triangle controls retain sample-identical output',()=>{
 for(const wave of [1,2,3,4]){const f=spectralFixture({test:'sub-saw'});f.patch.layers[0].waveA=wave;const a=renderSpectralKernel(module,f,48000),b=renderSpectralKernel(module,f,48000,0,{legacyEdges:true});for(let ch=0;ch<2;ch++)expect(Buffer.from(a[ch].buffer).equals(Buffer.from(b[ch].buffer))).toBe(true);}
});
test('musical comparisons remain bounded for all sounds and match their scores across paths',()=>{
 const fm=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
 for(const [sound]of QUALITY_SOUNDS){const f=qualityFixture({sound});expect(f.notes.length).toBeGreaterThan(0);expect(f.seconds).toBeGreaterThan(f.scoreSeconds);for(const n of f.notes)expect(n.time+n.duration).toBeLessThanOrEqual(f.scoreSeconds);
  for(const quality of f.kind==='fm'?[0,1,2]:[0]){const metric=qualityMeasure(renderSpectralKernel(f.kind==='fm'?fm:module,f,48000,quality));expect(metric.peak).toBeLessThan(.8);expect(metric.rms).toBeGreaterThan(.001);}
 }
},20000);
