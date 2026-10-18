// @vitest-environment node
import fs from 'node:fs';
import {impulseResponse,responseCurve,atFrequency,filterSummary,chorusProbe,deterministicNoise,stereoMeasure} from './toneAnalysis';
import {toneConfig,toneFixture,toneVariants} from './toneFixtures';
import {renderSpectralKernel} from './spectralEngine';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm'));
test('calibrated SVF low-pass cutoffs and slopes match their Butterworth targets across sample rates',()=>{
 for(const rate of [44100,48000,96000])for(const cutoff of [200,2000,10000])for(const response of [0,1]){
  const curve=responseCurve(impulseResponse(module,{rate,cutoff,resonance:0,response,family:0}),rate);
  expect(atFrequency(curve,cutoff)).toBeCloseTo(-3.0103,1);
  for(const hz of [cutoff*.25,Math.min(rate*.45,cutoff*2)]){const w=Math.tan(Math.PI*hz/rate)/Math.tan(Math.PI*cutoff/rate),expected=-10*Math.log10(1+w**(response===0?4:8));expect(atFrequency(curve,hz)).toBeCloseTo(expected,1);}
 }
});
test('four-pole resonance remains bounded and ladder compensation preserves more bass',()=>{
 const cfg={rate:48000,cutoff:2000,resonance:1,response:1,family:0};
 const old=filterSummary(responseCurve(impulseResponse(module,cfg,{modern:false}),cfg.rate),cfg.cutoff),current=filterSummary(responseCurve(impulseResponse(module,cfg),cfg.rate),cfg.cutoff);expect(current.peakDb).toBeLessThan(old.peakDb-8);
 for(const resonance of [.2,.7,1]){const c={...cfg,resonance,family:1},a=responseCurve(impulseResponse(module,c,{modern:false}),c.rate),b=responseCurve(impulseResponse(module,c),c.rate);expect(atFrequency(b,50)-atFrequency(a,50)).toBeCloseTo(20*Math.log10(1+resonance*3.8*.75),1);expect(atFrequency(b,50)).toBeGreaterThan(-2.1);}
});
test('fractional chorus interpolation loses less high-frequency wet-tap energy',()=>{
 for(const rate of [44100,48000,96000]){
  const phase=.125,depth=((Math.round(.012*rate)+.5)/rate-.012)*1000/Math.sin(2*Math.PI*phase),signal=Float32Array.from({length:rate},(_,i)=>.1*Math.sin(2*Math.PI*.35*i)),cfg={rate,amount:.8,speed:0,depth},input=[signal,signal];
  const rms=a=>Math.sqrt(a.slice(4096).reduce((s,x)=>s+x*x,0)/(a.length-4096)),old=chorusProbe(module,input,cfg,{modern:false,wetOnly:true,phase}),current=chorusProbe(module,input,cfg,{wetOnly:true,phase});
  expect(20*Math.log10(rms(current[0])/rms(old[0]))).toBeGreaterThan(2.5);
 }
});
test('chorus bypass is exact, and compensated broad-band power and mono fold stay useful',()=>{
 for(const rate of [44100,48000,96000]){const input=deterministicNoise(rate,1),cfg={rate,amount:.8,speed:.35,depth:3.5},cut=channels=>channels.map(ch=>ch.slice(Math.ceil(rate*.05)));
  const dry=stereoMeasure(cut(input)),old=stereoMeasure(cut(chorusProbe(module,input,cfg,{modern:false}))),current=stereoMeasure(cut(chorusProbe(module,input,cfg)));
  expect(20*Math.log10(current.rms/dry.rms)).toBeGreaterThan(-1);expect(current.rms/old.rms).toBeGreaterThan(1.25);expect(current.monoDb).toBeGreaterThan(-2);expect(current.peak).toBeLessThan(.2);
  const bypass=chorusProbe(module,input,{...cfg,amount:0});for(let ch=0;ch<2;ch++)expect(Buffer.from(input[ch].buffer).equals(Buffer.from(bypass[ch].buffer))).toBe(true);
 }
});
test('chorus edits ramp and their physical response time remains consistent across rates',()=>{
 const measurements=[];
 for(const rate of [44100,48000,96000]){const signal=new Float32Array(rate/2).fill(.1),frame=Math.round(rate*.1),input=[signal,signal],config={rate,amount:0,speed:0,depth:3},edits=[{frame,index:8,value:.8}];
  const out=chorusProbe(module,input,config,{edits});measurements.push(out[0][frame+Math.round(rate*.01)]);
  const sine=Float32Array.from({length:rate/2},(_,i)=>.1*Math.sin(2*Math.PI*440*i/rate)),a=chorusProbe(module,[sine,sine],config,{modern:false,edits}),b=chorusProbe(module,[sine,sine],config,{edits}),difference=out=>Math.max(...out[0].slice(frame,frame+32).map((x,i)=>Math.abs(x-sine[frame+i])));
  expect(difference(b)).toBeLessThan(difference(a)*.25);
 }
 expect(Math.max(...measurements)-Math.min(...measurements)).toBeLessThan(.0001);
});
test('musical filter/chorus variants isolate the requested path and remain valid',()=>{
 expect(toneConfig({target:'unknown',cutoff:Infinity,amount:99})).toMatchObject({target:'filter',cutoff:1400,amount:.8});
 for(const target of ['filter','chorus'])for(const sound of ['pad','lead','bass']){const f=toneFixture({target,sound});expect(f.kind).toBe('subtractive');expect(f.notes.every(n=>n.time+n.duration<=f.scoreSeconds)).toBe(true);expect(f.patch.global.chorus).toBe(target==='chorus'?.65:0);}
 const f=toneFixture({target:'filter',sound:'lead'});f.seconds=1.5;f.notes=f.notes.slice(0,1).map(n=>({...n,time:.05,duration:.8}));
 for(const variant of toneVariants('filter'))expect(stereoMeasure(renderSpectralKernel(module,f,48000,0,variant)).peak).toBeLessThan(1);
 expect(toneVariants('chorus')).toHaveLength(3);
});
