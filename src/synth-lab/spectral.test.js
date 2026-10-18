// @vitest-environment node
import fs from 'node:fs';
import {powerSpectrum,spectralMetrics,decimateReference} from './spectral';
import {spectralFixture,SPECTRAL_CASES,spectralConfig} from './spectralFixtures';
import {renderSpectralKernel,analyseSpectralChannels} from './spectralEngine';
const tone=(n,rate,hz,amp=1)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/rate));
test('windowed FFT locates and calibrates sine power without counting leakage as off-harmonic energy',()=>{
 const rate=48000,size=16384,f=317*rate/size,data=tone(size,rate,f,.5),spectrum=powerSpectrum(data,rate,{size}),m=spectralMetrics(spectrum,f);
 const peak=spectrum.power.indexOf(Math.max(...spectrum.power));expect(peak).toBe(317);
 expect(spectrum.power.reduce((s,v)=>s+v,0)).toBeCloseTo(.5**2/2,6);expect(m.offHarmonicDb).toBeLessThan(-90);
 expect(spectralMetrics(spectrum,f,spectrum).magnitudeDifferenceDb).toBe(-160);
 expect(()=>powerSpectrum(data,rate,{size:1000})).toThrow();data[100]=NaN;expect(()=>powerSpectrum(data,rate,{size})).toThrow();
});
test('off-grid folded tones register while harmonics and silent references are handled honestly',()=>{
 const rate=48000,size=16384,f=317*rate/size,base=tone(size,rate,f),fold=tone(size,rate,rate-f*3.7,.2);for(let i=0;i<size;i++)base[i]+=fold[i];
 expect(spectralMetrics(powerSpectrum(base,rate,{size}),f).offHarmonicDb).toBeGreaterThan(-20);
 const zero=powerSpectrum(new Float32Array(size),rate,{size});expect(spectralMetrics(zero,f,zero)).toMatchObject({offHarmonicDb:null,magnitudeDifferenceDb:null});
});
test('offline reference low-pass retains an audible tone and rejects content above the target Nyquist',()=>{
 for(const factor of [2,4]){const rate=48000*factor,size=rate/4,low=decimateReference(tone(size,rate,1000),factor),high=decimateReference(tone(size,rate,33000),factor),rms=a=>Math.sqrt(a.slice(200,-200).reduce((s,x)=>s+x*x,0)/(a.length-400));
  expect(rms(low)).toBeCloseTo(Math.SQRT1_2,3);expect(rms(high)).toBeLessThan(1e-4);
 }
 expect(()=>decimateReference(new Float32Array(100),3)).toThrow();
});
test('spectral probes disable drift/effects and use an unclamped coherent fundamental at every rate',()=>{
 for(const [test]of SPECTRAL_CASES)for(const rate of [44100,48000,96000]){const p=spectralFixture({test,rate});expect(p.fundamental/p.config.rate*65536%2).toBeCloseTo(1,8);expect(p.referenceFactor*rate).toBeLessThanOrEqual(192000);expect(p.kind==='fm'?p.patch.global.vibrato:p.patch.layers[0].drift).toBe(0);}
 expect(spectralConfig({test:'bad',rate:1,hz:Infinity,depth:99})).toMatchObject({test:'fm-bright',rate:48000,hz:3137,depth:3});
 const sync=spectralFixture({test:'sub-sync'}).patch.layers[0];expect(sync.coarseA+sync.coarseB).toBe(0);expect(sync.hardSync).toBe(1);
});
test('higher FM quality suppresses off-harmonic folding in the fixed high-register pair',()=>{
 const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
 for(const rate of [44100,48000,96000]){const fixture=spectralFixture({rate}),a=analyseSpectralChannels(renderSpectralKernel(module,fixture,rate,0),fixture),b=analyseSpectralChannels(renderSpectralKernel(module,fixture,rate,2),fixture);
  expect(a.metrics.peak).toBeLessThan(1);expect(b.metrics.offHarmonicDb).toBeLessThan(a.metrics.offHarmonicDb-10);
 }
});
