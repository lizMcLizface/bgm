// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize,clampValue,intoLayer,LAYER_KEYS} from '../jupiter/params';
import {PRESETS} from '../jupiter/presets';
import {decodeTape} from '../jupiter/tape';
import {decodePatch,engineValues} from '../jupiter/patch';
import {factoryName} from '../jupiter/names';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.jupiter8,params:toPairs(sanitize(values))});
// VCO-1's saw alone through an open 24 dB filter, steady and dry
const CLEAN={vco1Wave:1,sourceMix:0,cutoff:20000,res:0,keyFollow:0,envMod:0,e2Attack:.001,e2Sustain:1,e2Release:.01,
 velVca:0,velVcf:0,spread:0,width:0,reverbMix:0};
const SINE={...CLEAN,cutoff:500};
const ONLY2={...SINE,sourceMix:1,vco2Fine:0};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
const hold=(values,note=69,s=.3,sr=48000)=>{const v=synth(values,sr);v.k.syn_note_on(1,note,1);v.seconds(.2);return v.seconds(s)[0];};
const noteOf=hz=>69+12*Math.log2(hz/440);
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}

test('the Jupiter table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(144);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 // the lower layer mirrors the upper one, 64 ids up
 for(const key of LAYER_KEYS)expect(BY_KEY['lo.'+key].id).toBe(BY_KEY[key].id+64);
 for(const p of PARAMS){expect(p.id<131||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.assign.options).toEqual(['Solo','Unison','Poly 1','Poly 2']);
});

test('VCO-1 ranges and VCO-2 range/fine are in tune at every sample rate',()=>{
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold(SINE,69,.4,sr),sr),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,vco1Range:0}),48000),220)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,vco1Range:2,cutoff:1500},57),48000),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...ONLY2,vco2Wave:0}),48000),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...ONLY2,vco2Wave:0,vco2Range:7,cutoff:2000}),48000),440*2**(7/12))).toBeLessThan(1);
 expect(cents(pitchHz(hold({...ONLY2,vco2Wave:0,vco2Fine:30}),48000),440*2**(30/1200))).toBeLessThan(1.5);
});

test('sync locks VCO-2 to VCO-1\'s period; cross-mod adds sidebands from VCO-2',()=>{
 const corr=(x,lag)=>{let s=0,a=0,b=0;for(let i=0;i+lag<x.length;i++){s+=x[i]*x[i+lag];a+=x[i]*x[i];b+=x[i+lag]**2;}return s/Math.sqrt(a*b);};
 const note=noteOf(375);
 for(const vco2Range of [5.3,9,15.5]){
  expect(corr(hold({...CLEAN,sourceMix:1,vco2Fine:0,sync:1,vco2Range,oversample:2},note,.2),128)).toBeGreaterThan(.99);
  expect(corr(hold({...CLEAN,sourceMix:1,vco2Fine:0,sync:0,vco2Range,oversample:2},note,.2),128)).toBeLessThan(.9);
 }
 // VCO-1 at 440 Hz (triangle, near-pure) modulated by a silent VCO-2 sine a fifth up: a sideband at 659 − 440 Hz
 const fm={...CLEAN,vco1Wave:0,vco2Wave:0,vco2Range:7,vco2Fine:0,cutoff:3000};
 const diff=440*(2**(7/12)-1),dry=hold(fm),wet=hold({...fm,crossMod:.4});
 expect(level(dry,diff)/level(dry,440)).toBeLessThan(.003);
 expect(level(wet,diff)/level(wet,440)).toBeGreaterThan(.05);
});

test('the 12 dB slope passes more above the cutoff than the 24 dB slope; the HPF thins the bass',()=>{
 const above=slope=>{const x=hold({...CLEAN,cutoff:400,slope},45);return level(x,110*8)/level(x,110);};
 expect(above(0)).toBeGreaterThan(2*above(1));
 const bass=hpf=>rms(hold({...CLEAN,cutoff:3000,hpf},33));
 expect(bass(600)).toBeLessThan(.6*bass(10));
});

test('the VCF follows ENV-1 or ENV-2 as switched, and ENV-1 can be inverted',()=>{
 // ENV-1 a fast decay, ENV-2 sustained: only the ENV-1 setting darkens after the attack
 const env={...CLEAN,cutoff:300,envMod:.5,e1Attack:.001,e1Decay:.05,e1Sustain:0,e2Sustain:1};
 const late=values=>{const v=synth(values);v.k.syn_note_on(1,45,1);v.seconds(.5);return brightness(v.seconds(.2)[0]);};
 expect(late({...env,envSource:1})).toBeGreaterThan(1.5*late({...env,envSource:0}));
 const attack=e1Invert=>{const v=synth({...env,cutoff:2000,e1Decay:2,e1Sustain:.5,e1Invert});v.k.syn_note_on(1,45,1);v.seconds(.05);return brightness(v.seconds(.05)[0]);};
 expect(attack(1)).toBeLessThan(.7*attack(0));
});

test('key follow shortens the envelopes up the keyboard',()=>{
 const tail=(e2Key,note)=>{const v=synth({...SINE,e2Attack:.001,e2Decay:.5,e2Sustain:0,e2Key});v.k.syn_note_on(1,note,1);v.seconds(.4);return rms(v.seconds(.1)[0]);};
 const ratio=e2Key=>tail(e2Key,84)/tail(e2Key,48);
 expect(ratio(1)).toBeLessThan(.5*ratio(0));
});

test('assign modes: Solo plays one voice, Unison all of them, Poly 2 rotates where Poly 1 reuses a released voice',()=>{
 const solo=synth({...SINE,assign:0});solo.k.syn_note_on(1,60,1);solo.k.syn_note_on(2,64,1);solo.seconds(.05);expect(solo.k.syn_stat(0)).toBe(1);
 solo.k.syn_note_off(2);solo.seconds(.1);expect(cents(pitchHz(solo.seconds(.2)[0],48000),261.63)).toBeLessThan(2);
 const uni=synth({...SINE,assign:1,voices:8});uni.k.syn_note_on(1,60,1);uni.seconds(.05);expect(uni.k.syn_stat(0)).toBe(8);
 // strike and release one key repeatedly with a long release: Poly 1 reuses the voice, Poly 2 moves on
 const repeat=assign=>{const v=synth({...SINE,assign,e2Release:2});for(let i=0;i<4;i++){v.k.syn_note_on(1,60,1);v.seconds(.05);v.k.syn_note_off(1);v.seconds(.05);}return v.k.syn_stat(0);};
 expect(repeat(2)).toBe(1);expect(repeat(3)).toBe(4);
 const poly=synth({...SINE,voices:8});for(let i=1;i<=10;i++)poly.k.syn_note_on(i,50+i,.7);poly.seconds(.05);expect(poly.k.syn_stat(0)).toBe(8);expect(poly.k.syn_stat(1)).toBe(2);
});

test('the arpeggiator steps up through the held keys and octaves at its rate, and hold latches them',()=>{
 const arp={...SINE,cutoff:3000,arp:1,arpMode:0,arpRange:2,arpRate:10,e2Release:.005};
 const v=synth(arp);v.k.syn_note_on(1,57,1);v.k.syn_note_on(2,64,1);
 // each step is 0.1 s with a half-step gate: read the pitch in the middle of the sounding half
 const pitches=[];for(let i=0;i<5;i++){const [x]=v.seconds(.1);pitches.push(pitchHz(x.subarray(500,2200),48000));}
 const steps=pitches.map(p=>Math.round(12*Math.log2(p/220))+0);
 expect(steps).toEqual([0,7,12,19,0]);
 v.k.syn_note_off(1);v.k.syn_note_off(2);v.seconds(.3);expect(v.k.syn_stat(0)).toBe(0);
 const held=synth({...arp,arpHold:1});held.k.syn_note_on(1,57,1);held.seconds(.05);held.k.syn_note_off(1);held.seconds(.5);
 expect(rms(held.seconds(.4)[0])).toBeGreaterThan(1e-3);
});

test('every Jupiter sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,res:1,voices:16,crossMod:1,vcoModLfo:1});for(let i=0;i<16;i++)s.k.syn_note_on(i+1,24+i*5,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);s.k.syn_control(CONTROL.bend,-24);const [l2]=s.seconds(.5);
  for(const a of [l,r,l2]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

const TAPE='banks/jupiter-8/jp8-factory-tape.wav';
test.skipIf(!fs.existsSync(TAPE))('the local factory tape decodes, names itself, maps into range and plays every patch',()=>{
 const tape=decodeTape(fs.readFileSync(TAPE));expect(tape.patches.length).toBe(64);
 for(const p of tape.patches){
  expect(factoryName(p.data)).not.toBe('');
  const values=engineValues(decodePatch(p.data));
  for(const [key,value] of Object.entries(values)){expect(BY_KEY[key],key).toBeDefined();expect(clampValue(key,value),key).toBeCloseTo(value);}
  const s=synth(values);[48,55,60,64].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
  const [l]=s.seconds(1.5);
  expect(l.every(Number.isFinite)).toBe(true);expect(peak(l)).toBeLessThanOrEqual(1);
  expect(rms(l),`${p.number} ${factoryName(p.data)}`).toBeGreaterThan(1e-4);
 }
});

// Both layers clean; the lower one an octave down, as a triangle (odd harmonics only), so
// neither layer has a component at the other's fundamental and a pitch tells which played.
const LAYERS={...SINE,...intoLayer({...SINE,vco1Range:0,vco1Wave:0},'lower')};

test('key modes: Whole plays the upper layer, Split sends low keys to the lower layer, Dual plays both',()=>{
 const play=(values,note)=>{const v=synth(values);v.k.syn_note_on(1,note,1);v.seconds(.2);return [pitchHz(v.seconds(.3)[0],48000),v.k.syn_stat(0)];};
 const [whole,wv]=play({...LAYERS,keyMode:0},57);expect(cents(whole,220)).toBeLessThan(1);expect(wv).toBe(1);
 const [low]=play({...LAYERS,keyMode:2,splitPoint:60},57);expect(cents(low,110)).toBeLessThan(1);
 const [high]=play({...LAYERS,keyMode:2,splitPoint:60},64);expect(cents(high,329.63)).toBeLessThan(1);
 // the split point itself belongs to the upper layer
 const [at]=play({...LAYERS,keyMode:2,splitPoint:60},60);expect(cents(at,261.63)).toBeLessThan(1);
 const dual=synth({...LAYERS,keyMode:1,'lo.cutoff':20000,cutoff:20000});dual.k.syn_note_on(1,57,1);dual.seconds(.2);
 expect(dual.k.syn_stat(0)).toBe(2);
 const x=dual.seconds(.3)[0];expect(level(x,110)).toBeGreaterThan(.01);expect(level(x,220)).toBeGreaterThan(.01);
});

test('Dual and Split share the voices half and half; balance sets the layer levels',()=>{
 const d=synth({...LAYERS,keyMode:1,voices:8});for(let i=1;i<=6;i++)d.k.syn_note_on(i,50+i,.7);d.seconds(.05);
 expect(d.k.syn_stat(0)).toBe(8);expect(d.k.syn_stat(1)).toBeGreaterThan(0);
 const w=synth({...LAYERS,keyMode:0,voices:8});for(let i=1;i<=6;i++)w.k.syn_note_on(i,50+i,.7);w.seconds(.05);expect(w.k.syn_stat(0)).toBe(6);
 const amount=balance=>{const v=synth({...LAYERS,keyMode:1,balance});v.k.syn_note_on(1,57,1);v.seconds(.2);const x=v.seconds(.3)[0];return [level(x,110),level(x,220)];};
 const [lo0,up0]=amount(0),[lo1,up1]=amount(1),[loC,upC]=amount(.5);
 expect(lo0).toBeLessThan(1e-3*up0);expect(up1).toBeLessThan(1e-3*lo1);
 expect(Math.abs(loC-lo1)/lo1).toBeLessThan(.05);expect(Math.abs(upC-up0)/up0).toBeLessThan(.05);
});

test('each layer keeps its own assign mode, and changing the key mode releases held notes',()=>{
 // split: a solo (mono) lower layer under a polyphonic upper one
 const v=synth({...LAYERS,keyMode:2,splitPoint:60,'lo.assign':0});
 v.k.syn_note_on(1,40,1);v.k.syn_note_on(2,43,1);v.k.syn_note_on(3,64,1);v.k.syn_note_on(4,67,1);v.seconds(.05);
 expect(v.k.syn_stat(0)).toBe(3);
 v.k.syn_note_off(1);v.k.syn_note_off(2);v.k.syn_note_off(3);v.k.syn_note_off(4);v.seconds(.2);expect(v.k.syn_stat(0)).toBe(0);
 const m=synth({...LAYERS,keyMode:1,e2Release:.01,'lo.e2Release':.01});m.k.syn_note_on(1,60,1);m.seconds(.05);expect(m.k.syn_stat(0)).toBe(2);
 m.k.syn_param(BY_KEY.keyMode.id,0);m.seconds(.2);expect(m.k.syn_stat(0)).toBe(0);
});

test('every layered preset stays finite and below full scale',()=>{
 for(const preset of PRESETS.filter(p=>p.values.keyMode>0)){
  const s=synth(preset.values);for(let i=0;i<10;i++)s.k.syn_note_on(i+1,36+i*5,1);
  const [l,r]=s.seconds(1);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

test('the bend is in semitones as the host sends it',()=>{
 const v=synth(SINE);v.k.syn_note_on(1,69,1);v.seconds(.2);v.k.syn_control(CONTROL.bend,2);v.seconds(.3);
 expect(cents(pitchHz(v.seconds(.3)[0],48000),440*2**(2/12))).toBeLessThan(3);
});
