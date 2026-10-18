// @vitest-environment node
import fs from 'node:fs';
import {initialPatch,clonePatch,parameterTriples,sanitizePatch,LAYER} from './patch';
import {modulationFixture,modulationVariants,modulationConfig} from './modulationFixtures';
import {renderSpectralKernel} from './spectralEngine';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm'));
function plain(){const p=initialPatch();Object.assign(p.global,{gain:.15,chorus:0});Object.assign(p.layers[0],{waveA:1,waveB:0,levelA:1,levelB:0,cutoff:15000,filter:0,resonance:0,filterAmount:0,keytrack:0,velocityTone:0,drift:0,attack:.2,decay:.2,sustain:.6,release:.25});return p;}
function engine(p,sr=48000){const e=new WebAssembly.Instance(module,{}).exports;e.engine_init(sr);parameterTriples(p).forEach(t=>e.engine_param(...t));return e;}
function render(e,frames,chunk=128){const out=[new Float32Array(frames),new Float32Array(frames)];for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e.engine_render(n);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,ch?e.engine_right():e.engine_left(),n),at);}return out;}
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
function note(p,{frames=48000,rate=48000,chunk=128,off=.7}={}){const e=engine(p,rate);e.engine_event(0,1,0,69,.8);e.engine_event(1,1,Math.round(off*rate),0,0);return render(e,frames,chunk);}
test('old patches inherit original curves with all new routes disabled and stable append-only IDs',()=>{
 const p=sanitizePatch({version:1,layers:[{attack:.5}]});expect(p.layers[0]).toMatchObject({ampAttackCurve:1,ampDecayCurve:1,ampReleaseCurve:2,wanderCents:0,modSource1:0,modDepth4:0});expect(LAYER[58][0]).toBe('filterFamily');expect(LAYER[74][0]).toBe('modSource1');
 const bad=clonePatch(p);Object.assign(bad.layers[0],{modSource1:999,modTarget1:-3,modDepth1:Infinity,ampAttackCurve:-10,wanderCents:999});expect(clonePatch(bad).layers[0]).toMatchObject({modSource1:10,modTarget1:0,modDepth1:0,ampAttackCurve:.25,wanderCents:20});
});
test('curved envelopes reshape attack and release without shortening their scheduled endpoints',()=>{
 for(const sr of [44100,48000,96000]){
  const p=plain(),curved=clonePatch(p);curved.layers[0].ampAttackCurve=2;curved.layers[0].ampReleaseCurve=4;
  const a=note(p,{rate:sr,frames:sr}),b=note(curved,{rate:sr,frames:sr}),window=(out,start,end)=>rms(out[0].slice(Math.round(start*sr),Math.round(end*sr)));
  expect(window(b,.08,.1)).toBeLessThan(window(a,.08,.1)*.6);expect(window(b,.5,.6)).toBeCloseTo(window(a,.5,.6),5);expect(window(b,.82,.85)).toBeLessThan(window(a,.82,.85)*.4);expect(window(b,.97,1)).toBeLessThan(1e-8);
 }
});
test('each modulation destination changes the intended sound and inverted pan retains its direction',()=>{
 const p=plain(),base=note(p);for(let destination=1;destination<=5;destination++){
  const q=clonePatch(p);if(destination===2){q.layers[0].waveA=3;q.layers[0].cutoff=400;}if(destination===3)q.layers[0].waveA=4;
  const reference=note(q);Object.assign(q.layers[0],{modSource1:6,modTarget1:destination,modDepth1:.65});const a=note(q);expect(a[0]).not.toEqual(reference[0]);expect([...a[0]].every(Number.isFinite)).toBe(true);
  if(destination===5){expect(rms(a[1].slice(18000,26000))).toBeGreaterThan(rms(a[0].slice(18000,26000))*2);q.layers[0].modDepth1=-.65;const b=note(q);expect(rms(b[0].slice(18000,26000))).toBeGreaterThan(rms(b[1].slice(18000,26000))*2);}
 }expect(rms(base[0])).toBeGreaterThan(.001);
});
test('all sources route per voice and a separate modulation envelope releases with the pedal',()=>{
 for(let source=1;source<=10;source++){
  const p=plain();Object.assign(p.global,{wheel:.7,pressure:.6});Object.assign(p.layers[0],{modSource1:source,modTarget1:5,modDepth1:.6,modAttack:.08,modDecay:.1,modSustain:.8,lfo2Rate:1,wanderRate:1});
  const e=engine(p);e.engine_event(0,1,0,72,.8);e.engine_event(2,0,25000,1,0);e.engine_event(1,1,27000,0,0);const held=render(e,30000);expect(held[0].some((x,i)=>Math.abs(x-held[1][i])>1e-5)).toBe(true);expect(e.engine_stat(0)).toBe(1);e.engine_event(2,0,30000,0,0);const tail=render(e,24000);expect(e.engine_stat(0)).toBe(0);expect(rms(tail[0].slice(-1000))).toBeLessThan(1e-8);
 }
});
test('moving texture is repeatable across render chunks and safe after routing edits or panic',()=>{
 const p=clonePatch(modulationFixture().patch);for(const layer of p.layers)layer.modDepth4=-1;
 const run=chunk=>{const e=engine(p);e.engine_event(0,1,13,60,.7);e.engine_event(0,2,713,67,.6);e.engine_event(5,1,19000,72,.3);e.engine_event(1,1,31000,0,0);return render(e,48000,chunk);};
 const a=run(128),b=run(257);for(let ch=0;ch<2;ch++)expect(Buffer.from(a[ch].buffer).equals(Buffer.from(b[ch].buffer))).toBe(true);
 const e=engine(p);e.engine_event(0,1,0,60,.7);render(e,12000);for(let slot=0;slot<4;slot++)e.engine_param(1,74+slot*3,0);const edited=render(e,12000);expect([...edited[0]].every(Number.isFinite)).toBe(true);e.engine_panic();expect(rms(render(e,12000)[0])).toBe(0);
});
test('comparison fixtures isolate patch changes, retain all releases and render finite musical output',()=>{
 expect(modulationConfig({sound:'invalid',rate:12})).toEqual({sound:'pad',rate:48000});
 for(const sound of ['pad','lead','pressure']){const f=modulationFixture({sound}),variants=modulationVariants(f);expect(variants[0].patch.layers[0].modSource1).toBe(0);expect(f.notes.every(n=>n.time+n.duration+f.patch.layers[0].release<f.seconds)).toBe(true);
  f.seconds=1;f.notes=f.notes.slice(0,1).map(n=>({...n,time:.02,duration:.8}));f.events=[];
  for(const v of variants){const out=renderSpectralKernel(module,{...f,patch:v.patch},48000);expect([...out[0]].every(Number.isFinite)).toBe(true);expect(rms(out[0])).toBeGreaterThan(.0001);}
 }
});
