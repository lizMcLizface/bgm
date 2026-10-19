// @vitest-environment node
// The dedicated test:synth-simd command builds these opt-in artifacts first.
import fs from 'node:fs';
import {wasmCodeHash} from '../../tools/wasmCodeHash.mjs';
import {DSP_CASES,dspFixture,prepareDsp,compareDsp} from './profileDsp';
import {parameterTriples} from './patch';
import {fmPacket,topology} from './fmPatch';
const available=['core','fm'].every(k=>fs.existsSync('.tmp/dsp-simd/'+k+'.wasm'));
const matrix=available?describe:describe.skip;
const modules=available?Object.fromEntries(['core','fm'].map(k=>[k,['public/synth-lab/','.tmp/dsp-simd/'].map(dir=>new WebAssembly.Module(fs.readFileSync(dir+k+'.wasm')))])):{};
matrix('experimental SIMD voice batching',()=>{
 test('the public FM trial has the same code as the measured named kernel',()=>{
  expect(wasmCodeHash(fs.readFileSync('public/synth-lab/fm-simd.wasm'))).toBe(wasmCodeHash(fs.readFileSync('.tmp/dsp-simd/fm.wasm')));
 });
 test.each([44100,48000,96000])('all source fixtures preserve PCM at %i Hz',rate=>{
  for(const spec of DSP_CASES.filter(c=>['core','fm'].includes(c.kernel))){
   const f=dspFixture(spec,{rate,seconds:.6}),a=modules[f.kernel].map(m=>prepareDsp(m,f).run({capture:true})),parity=compareDsp(a[0].pcm,a[1].pcm);
   expect(parity.nonFinite,spec.id).toBe(0);expect(parity.maxDifference,spec.id).toBe(0);expect(a[1].stats,spec.id).toEqual(a[0].stats);
  }
 },30000);
 test('counters prove vector paths execute and ineligible cases stay scalar',()=>{
  for(const [id,expected]of [['fm-base',true],['core-lanes8',true],['fm-idle',false],['fm-1',false],['fm-2',true],['fm-3',true],['fm-tines-solo',false],['core-8',false],['core-sync',false]]){
   const f=dspFixture(DSP_CASES.find(s=>s.id===id),{seconds:.1}),runner=prepareDsp(modules[f.kernel][1],f);runner.run();expect(runner.simdFrames()>0,id).toBe(expected);
  }
 });
 test.each([4,6])('%i-operator topologies retain low-polyphony routing, shapes, envelopes and mixing order',operators=>{
  for(let algorithm=0;algorithm<7;algorithm++)for(const voices of [1,2]){
   const f=dspFixture(DSP_CASES.find(s=>s.id==='fm-base'),{seconds:.35});f.notes=f.notes.slice(0,voices).map(n=>({...n,duration:.18}));f.patch.global.operators=operators;f.patch.global.polyphony=voices;f.patch.global.feedbackOp=operators-2;
   Object.assign(f.patch.global,{modSource1:3,modTarget1:2,modDepth1:.15,modSource2:2,modTarget2:9,modDepth2:.2,modSource3:1,modTarget3:4,modDepth3:.1});
   Object.assign(f.patch,topology(operators,Math.min(5,algorithm)));
   if(algorithm===6)f.patch.routes=f.patch.routes.map((row,from)=>row.map((_,to)=>from<to&&from%2===0&&to%2===1?.7:0));
   f.patch.operators.forEach((op,i)=>Object.assign(op,{wave:i%4,legacyEnvelope:i%2,attack:.001*(i+1),decay1:.01+i*.004,decay2:.08,sustain:.14+i*.08}));
   const outputs=modules.fm.map(m=>prepareDsp(m,f).run({capture:true})),parity=compareDsp(outputs[0].pcm,outputs[1].pcm);expect(parity.nonFinite,algorithm+':'+voices).toBe(0);expect(parity.maxDifference,algorithm+':'+voices).toBe(0);
  }
 },30000);
 test.each(['fm-choir-release','core-rosin'])('%s keeps the complete release and acoustic tail',id=>{
  const f=dspFixture(DSP_CASES.find(s=>s.id===id),{seconds:6});f.notes=f.notes.map(n=>({...n,duration:.4}));const a=modules[f.kernel].map(m=>prepareDsp(m,f).run({capture:true}));expect(compareDsp(a[0].pcm,a[1].pcm).maxDifference).toBe(0);expect(a[1].stats).toEqual(a[0].stats);
 },30000);
 test.each(['core','fm'])('%s preserves stealing, holes, sustain, glides, patch switches and panic across partial blocks',kernel=>{
  for(const rate of [44100,48000,96000])for(const block of [1,65,128,2048]){
   const fixture=dspFixture(DSP_CASES.find(c=>c.id===(kernel==='fm'?'fm-base':'core-lanes8')),{rate,seconds:.9});fixture.patch.global.polyphony=12;
   const run=module=>{
    const e=new WebAssembly.Instance(module,{}).exports,fm=kernel==='fm',init=fm?e.fm_init:e.engine_init,render=fm?e.fm_render:e.engine_render,event=fm?e.fm_event:e.engine_event;
    init(rate);const patch=p=>{if(fm){const q=fmPacket(p);q.globals.forEach(v=>e.fm_param(...v));q.operators.forEach(v=>e.fm_op(...v));q.routes.forEach(v=>e.fm_route(...v));q.carriers.forEach(v=>e.fm_carrier(...v));}else parameterTriples(p).forEach(v=>e.engine_param(...v));};patch(fixture.patch);
    for(let j=0;j<20;j++)event(0,j+1,Math.round(j*.006*rate),48+j%16,.3+j*.025);
    event(2,0,Math.round(.14*rate),1,0);for(let j=0;j<20;j+=2)event(1,j+1,Math.round(.16*rate),0,0);event(2,0,Math.round(.24*rate),0,0);
    event(6,2,Math.round(.31*rate),.1,0);event(0,50,Math.round(.33*rate),72,.45);event(0,51,Math.round(.35*rate),60,.85);event(5,51,Math.round(.37*rate),64,.15);event(3,51,Math.round(.4*rate),.65,0);event(1,51,Math.round(.5*rate),0,0);
    const length=Math.round(.9*rate),pcm=[new Float32Array(length),new Float32Array(length)],views=[new Float32Array(e.memory.buffer,fm?e.fm_output(0):e.engine_left(),2048),new Float32Array(e.memory.buffer,fm?e.fm_output(1):e.engine_right(),2048)];
    const changed=structuredClone(fixture.patch);if(fm){changed.global.quality=2;changed.operators[0].attackCurve=1.3;}else{changed.layers[0].waveA=4;changed.layers[0].lfoPwm=.25;changed.layers[0].hardSync=1;}
    for(let at=0;at<length;){if(at>=Math.round(.12*rate)&&at<Math.round(.12*rate)+block)patch(changed);if(at>=Math.round(.28*rate)&&at<Math.round(.28*rate)+block)patch(fixture.patch);if(at>=Math.round(.55*rate)&&at<Math.round(.55*rate)+block)patch(changed);if(at>=Math.round(.7*rate)&&at<Math.round(.7*rate)+block){(fm?e.fm_panic:e.engine_panic)();event(0,100,at,67,.6);}
     const n=Math.min(block,length-at);render(n);for(let ch=0;ch<2;ch++)pcm[ch].set(views[ch].subarray(0,n),at);at+=n;
    }return pcm;
   };
   const a=modules[kernel].map(run),parity=compareDsp(a[0],a[1]);expect(parity.nonFinite,kernel+':'+rate+':'+block).toBe(0);expect(parity.maxDifference,kernel+':'+rate+':'+block).toBe(0);
  }
 },30000);
});
