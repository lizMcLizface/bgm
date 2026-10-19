// @vitest-environment node
import fs from 'node:fs';
import {colourProbe} from './acousticAnalysis';
import {responseCurve,atFrequency,deterministicNoise} from './toneAnalysis';
import {VOICE_COLOUR,voiceColourTail,patchColourTail} from './voiceColour';
import {initialPatch,LAYER,parameterTriples,clonePatch} from './patch';
import {initialFM,FM_GLOBAL,fmPacket,cloneFM} from './fmPatch';
import {acousticFixture,acousticVariants,acousticConfig,ACOUSTIC_SOUNDS} from './acousticFixtures';
import {renderSpectralKernel} from './spectralEngine';
const core=new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm')),fm=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),silent=n=>[new Float32Array(n),new Float32Array(n)],eq=(a,b)=>Buffer.from(a.buffer).equals(Buffer.from(b.buffer));
function impulse(p,rate=48000){const a=silent(131072);a[0][0]=a[1][0]=.001;return colourProbe(core,a,rate,p)[0];}
function engine(kind,colour={},sr=48000){
 const isFM=kind==='fm',e=new WebAssembly.Instance(isFM?fm:core,{}).exports,p=isFM?initialFM():initialPatch();e[isFM?'fm_init':'engine_init'](sr);
 if(isFM){Object.assign(p.global,{operators:4,feedback:0,index:0,vibrato:0,quality:1,...colour});p.routes=Array.from({length:6},()=>Array(6).fill(0));p.carriers=[1,0,0,0,0,0];for(const o of p.operators)Object.assign(o,{attack:.002,decay1:.002,breakpoint:1,decay2:.002,sustain:1,release:.01,level:1});const q=fmPacket(p);for(const t of q.globals)e.fm_param(...t);for(const t of q.operators)e.fm_op(...t);for(const t of q.routes)e.fm_route(...t);for(const t of q.carriers)e.fm_carrier(...t);}
 else{Object.assign(p.global,{chorus:0,unison:1});Object.assign(p.layers[0],{waveA:3,waveB:0,levelB:0,cutoff:6000,filterAmount:0,attack:.002,decay:.002,sustain:1,release:.01,...colour});for(const t of parameterTriples(p))e.engine_param(...t);}
 return {e,p,event:(...args)=>e[isFM?'fm_event':'engine_event'](...args),stat:i=>e[isFM?'fm_stat':'engine_stat'](i),render:(frames,chunk=128)=>{const out=new Float32Array(frames);for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e[isFM?'fm_render':'engine_render'](n);out.set(new Float32Array(e.memory.buffer,isFM?e.fm_output(0):e.engine_left(),n),at);}return out;},panic:()=>e[isFM?'fm_panic':'engine_panic']()};
}
test('acoustic parameters append to both formats with neutral old-patch defaults and safe bounds',()=>{
 expect(LAYER.slice(86,99)).toEqual(VOICE_COLOUR);expect(FM_GLOBAL.slice(41)).toEqual(VOICE_COLOUR);
 for(const p of [clonePatch({version:1}),cloneFM({version:1,kind:'fm'})]){const c=p.kind==='fm'?p.global:p.layers[0];expect([c.breath,c.bow,c.formant,c.body]).toEqual([0,0,0,0]);expect(patchColourTail(p)).toBe(0);}
 const p=initialPatch();Object.assign(p.layers[0],{body:10,bodyType:2.8,bodyDecay:-9,vowel:Infinity});const c=clonePatch(p).layers[0];expect([c.body,c.bodyType,c.bodyDecay,c.vowel]).toEqual([1,3,.3,0]);
 expect(voiceColourTail({body:1,bodyDecay:3,formant:1})).toBeCloseTo(10.9);
});
test('disabled acoustic colour is sample-exact bypass regardless of unused tone settings',()=>{
 const input=deterministicNoise(48000,.25),out=colourProbe(core,input,48000,{vowel:2,bodyType:4,bodyDecay:3});expect(eq(input[0],out[0])).toBe(true);expect(eq(input[1],out[1])).toBe(true);
});
test('excitation is repeatable across chunk sizes, follows pressure and pan gain, and is silent without gain',()=>{
 const x=silent(12000),p={breath:.7,bow:.4,noisePressure:1,noiseAttack:0},a=colourProbe(core,x,48000,p,{noiseGain:[.5,0]}),b=colourProbe(core,x,48000,p,{noiseGain:[.5,0],chunk:127});expect(eq(a[0],b[0])).toBe(true);expect(rms(a[0])).toBeGreaterThan(.01);expect(rms(a[1])).toBe(0);expect(rms(colourProbe(core,x,48000,p)[0])).toBe(0);
 const high=colourProbe(core,x,48000,p,{noiseGain:[.5,0],pressure:1});expect(rms(high[0].slice(-2000))/rms(a[0].slice(-2000))).toBeCloseTo(2.5,3);expect(eq(a[0],colourProbe(core,x,48000,p,{noiseGain:[.5,0],seed:5})[0])).toBe(false);
});
test('vowels and formant-size shifts move measured resonance peaks at all output rates',()=>{
 for(const sr of [44100,48000,96000]){const ah=responseCurve(impulse({formant:1,vowel:0},sr),sr),oo=responseCurve(impulse({formant:1,vowel:1},sr),sr),shift=responseCurve(impulse({formant:1,vowel:0,formantShift:12},sr),sr);expect(atFrequency(ah,700)).toBeGreaterThan(atFrequency(ah,350)+3);expect(atFrequency(oo,350)).toBeGreaterThan(atFrequency(oo,700)+3);expect(atFrequency(shift,1400)).toBeGreaterThan(atFrequency(shift,700)+3);}
});
test('body tuning moves fixed modes, while a longer decay retains a stronger late tail',()=>{
 const body=responseCurve(impulse({body:1,bodyType:0}),48000),shift=responseCurve(impulse({body:1,bodyType:0,bodyTune:12}),48000);expect(atFrequency(body,110)).toBeGreaterThan(atFrequency(shift,110)+3);expect(atFrequency(shift,220)).toBeGreaterThan(atFrequency(body,220));
 const short=impulse({body:1,bodyType:4,bodyDecay:.3}),long=impulse({body:1,bodyType:4,bodyDecay:3});expect(rms(long.slice(24000,36000))).toBeGreaterThan(rms(short.slice(24000,36000))*100);expect(rms(long.slice(-4096))).toBeLessThan(1e-6);
});
test('rapid vowel/material/noise edits remain finite, deterministic and settle back to bypass',()=>{
 const input=deterministicNoise(48000,1),edits=[{frame:4093,settings:{body:1,bodyType:4,bodyDecay:3,bodyTune:12,formant:1,vowel:2,formantShift:-12,breath:1}},{frame:12000,settings:{body:1,bodyType:1,bodyDecay:.3,bodyTune:-12,formant:1,vowel:0,formantShift:12,bow:1}},{frame:24000,settings:{}}];
 const a=colourProbe(core,input,48000,{body:1,formant:1},{edits,noiseGain:[.5,.5]}),b=colourProbe(core,input,48000,{body:1,formant:1},{edits,chunk:127,noiseGain:[.5,.5]});expect(eq(a[0],b[0])).toBe(true);expect(a.every(ch=>ch.every(Number.isFinite))).toBe(true);expect(eq(a[0].slice(-1000),input[0].slice(-1000))).toBe(true);
});
test('real voices retain acoustic release tails then free, and noise cannot keep them alive',()=>{
 for(const kind of ['subtractive','fm'])for(const sr of [44100,48000,96000]){const b=engine(kind,{body:1,bodyType:4,bodyDecay:3,formant:.5,breath:.5,bow:.5},sr);b.event(0,1,0,71,.8);b.event(1,1,sr*.1,0,0);b.render(sr*.2);expect(b.stat(0)).toBe(1);const tail=b.render(sr*12,257);expect(tail.every(Number.isFinite)).toBe(true);expect(b.stat(0)).toBe(0);expect(rms(tail.slice(-2048))).toBeLessThan(1e-7);}
 for(const kind of ['subtractive','fm']){const b=engine(kind,{breath:1,bow:1});b.event(0,1,0,60,.8);b.event(1,1,1000,0,0);b.render(10000);expect(b.stat(0)).toBe(0);}
},30000);
test('coloured voices preserve sustain, retuning, panic and independent repeated note lifecycles',()=>{
 for(const kind of ['subtractive','fm']){const b=engine(kind,{body:.7,bodyType:2,bow:.5,breath:.2});b.event(0,1,0,60,.8);b.event(0,2,0,60,.6);b.event(2,0,1000,1,0);b.event(1,1,1100,0,0);b.event(5,2,2000,67,.2);const a=b.render(20000);expect(a.every(Number.isFinite)).toBe(true);expect(b.stat(0)).toBe(2);b.event(2,0,20000,0,0);b.event(1,2,20000,0,0);b.render(480000);expect(b.stat(0)).toBe(0);b.event(0,3,600000,60,.8);b.panic();expect(rms(b.render(800000).slice(-1000))).toBe(0);}
},15000);
test('listening fixtures isolate excitation/resonance with equal notes, durations and bounded source tails',()=>{
 expect(acousticConfig({sound:'invalid',rate:7})).toEqual({sound:'rosin',rate:48000});
 for(const [sound]of ACOUSTIC_SOUNDS){const f=acousticFixture({sound}),rows=acousticVariants(f);expect(f.seconds).toBeGreaterThan(f.scoreSeconds+patchColourTail(f.patch));expect(rows).toHaveLength(3);const c=p=>f.kind==='fm'?p.global:p.layers[0];expect(c(rows[0].patch).body).toBe(0);expect(c(rows[0].patch).breath+c(rows[0].patch).bow).toBe(0);expect(c(rows[1].patch).body+c(rows[1].patch).formant).toBe(0);expect(c(rows[2].patch).body+c(rows[2].patch).formant).toBeGreaterThan(0);expect(c(rows[1].patch).breath+c(rows[1].patch).bow).toBeGreaterThan(0);const audio=renderSpectralKernel(f.kind==='fm'?fm:core,{...f,seconds:.7,notes:f.notes.slice(0,1)},48000,1);expect(rms(audio[0])).toBeGreaterThan(.00001);expect(audio.every(ch=>ch.every(Number.isFinite))).toBe(true);}
});

test('listening passages have no hidden halfway-note pressure switch',()=>{
 for(const [sound]of ACOUSTIC_SOUNDS){const f=acousticFixture({sound});expect(f.events).toEqual([]);expect(f.patch.global.pressure).toBe(0);}
});
test('bow texture follows audible tone level instead of adding an independent hiss bed',()=>{
 const sr=48000,signal=Float32Array.from({length:sr},(_,i)=>.1*Math.sin(2*Math.PI*220*i/sr)),p={bow:.6,noiseMotion:.4,noiseAttack:0},input=[signal,signal.slice()],options={noiseGain:[.5,.5]},out=colourProbe(core,input,sr,p,options),quiet=signal.map(x=>x*.1),quietOut=colourProbe(core,[quiet,quiet],sr,p,options),noise=out[0].map((x,i)=>x-signal[i]),quietNoise=quietOut[0].map((x,i)=>x-quiet[i]);
 expect(rms(colourProbe(core,silent(sr),sr,p,options)[0])).toBe(0);
 expect(rms(noise)).toBeGreaterThan(1e-5);expect(rms(noise)/rms(signal)).toBeLessThan(.05);
 expect(rms(quietNoise)/rms(noise)).toBeCloseTo(.1,4);
 expect(eq(out[0],colourProbe(core,input,sr,p,{...options,chunk:127})[0])).toBe(true);
});
test('noise pressure changes slew rather than switching levels in one sample',()=>{
 const sr=48000,input=silent(sr),p={breath:.6,noisePressure:1,noiseAttack:0},options={noiseGain:[.5,.5]},base=colourProbe(core,input,sr,p,options)[0],out=colourProbe(core,input,sr,p,{...options,edits:[{frame:12000,pressure:1}]})[0];
 expect(eq(base.slice(0,12000),out.slice(0,12000))).toBe(true);
 expect(rms(out.slice(12000,12128))/rms(base.slice(12000,12128))).toBeLessThan(1.2);
 expect(rms(out.slice(-4000))/rms(base.slice(-4000))).toBeCloseTo(2.5,3);
});


test('settled colour survives disable, tiny threshold crossings and re-enable at every rate',()=>{
 for(const rate of [44100,48000,96000]){
  const input=deterministicNoise(rate,4),settings={formant:.6,body:.5,bodyType:4,bodyDecay:1.5},edits=[
   {frame:31,settings},
   {frame:Math.floor(rate*.2)+1,settings:{}},
   {frame:Math.floor(rate*1.3)+1,settings:{formant:.0000101,body:.0000101}},
   {frame:Math.floor(rate*2.3)+1,settings:{formant:.8,body:.6,vowel:1.8,bodyType:2,bodyTune:7}},
   {frame:Math.floor(rate*3.1)+1,settings:{}},
  ];
  const a=colourProbe(core,input,rate,settings,{edits,chunk:31}),b=colourProbe(core,input,rate,settings,{edits,chunk:2048});
  for(let ch=0;ch<2;ch++){expect(eq(a[ch],b[ch])).toBe(true);expect(a[ch].every(Number.isFinite)).toBe(true);}
  expect(rms(a[0])).toBeGreaterThan(.0001);
 }
});


test('FM acoustic automation remains exact across callback sizes and quality changes',()=>{
 function passage(rate,quality,chunk){
  const b=engine('fm',{formant:.6,body:.5,bodyType:4,bodyDecay:1.5},rate);b.e.fm_param(4,quality);b.event(0,1,0,60,.6);b.event(1,1,Math.floor(rate*3.2),0,0);
  const edits=[ [.1,{formant:0,body:0}], [1.2,{formant:.0000101,body:.0000101}], [2.3,{formant:.7,body:.6,vowel:1.8,bodyType:2,bodyTune:7}], [2.7,{quality:(quality+1)%3}], [3.1,{formant:0,body:0}] ].map(([t,values])=>({frame:Math.floor(rate*t)+1,values}));
  const out=new Float32Array(rate*4);let at=0,next=0;
  while(at<out.length){while(edits[next]?.frame===at){for(const [key,value]of Object.entries(edits[next++].values))b.e.fm_param(FM_GLOBAL.findIndex(([id])=>id===key),value);}const n=Math.min(chunk,out.length-at,(edits[next]?.frame??out.length)-at);out.set(b.render(n,chunk),at);at+=n;}
  return {out,stats:[0,1,2,3,4].map(b.stat)};
 }
 for(const rate of [44100,48000,96000])for(const quality of [0,1,2]){const a=passage(rate,quality,127),b=passage(rate,quality,2048);expect(eq(a.out,b.out)).toBe(true);expect(a.stats).toEqual(b.stats);expect(a.out.every(Number.isFinite)).toBe(true);expect(rms(a.out)).toBeGreaterThan(.0001);}
},30000);
