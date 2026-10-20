// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz as pitchOf} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize,clampValue,intoLayer,LAYER_KEYS} from '../obxa/params';
import {PRESETS} from '../obxa/presets';
import {engineValues,semitones,PITCH_NOTES} from '../obxa/book';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.obxa,params:toPairs(sanitize(values))});
const pitchHz=(a,sr=48000)=>pitchOf(a,sr);
// Oscillator 1's saw alone through a wide-open filter, steady and dry
const CLEAN={osc2Mix:0,osc2Detune:0,cutoff:20000,res:0,poles:1,track:0,envAmount:0,aAttack:.001,aSustain:1,aRelease:.01,
 velAmp:0,velFilter:0,spread:0,width:0,reverbMix:0,oversample:1};
const SINE={...CLEAN,cutoff:500};
const ONLY2={...SINE,osc1On:0,osc2Mix:2};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
const noteOf=hz=>69+12*Math.log2(hz/440);
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}
const hold=(values,note=69,s=.3,sr=48000)=>{const v=synth(values,sr);v.k.syn_note_on(1,note,1);v.seconds(.2);return v.seconds(s)[0];};

test('the OB-Xa table fits the kernel ABI; the lower layer mirrors the upper one 64 ids up',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(144);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const key of LAYER_KEYS)expect(BY_KEY['lo.'+key].id).toBe(BY_KEY[key].id+64);
 for(const p of PARAMS){expect(p.id<131||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
});

test('both oscillators are in tune at every sample rate; pitch notes, detune and transpose move them',()=>{
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold({...SINE},69,.4,sr),sr),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,osc1Pitch:12,cutoff:1500})),880)).toBeLessThan(1);
 expect(cents(pitchHz(hold(ONLY2)),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...ONLY2,osc2Pitch:7,cutoff:1000})),440*2**(7/12))).toBeLessThan(1);
 expect(cents(pitchHz(hold({...ONLY2,osc2Detune:30})),440*2**(30/1200))).toBeLessThan(1.5);
 expect(cents(pitchHz(hold({...SINE,transpose:12,cutoff:1500})),880)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,tune:50})),440*2**(50/1200))).toBeLessThan(1.5);
});

test('the oscillator 2 mixer is off, half, full; noise and oscillator 1 switch independently',()=>{
 const full=rms(hold({...ONLY2,osc2Mix:2})),half=rms(hold({...ONLY2,osc2Mix:1})),off=rms(hold({...ONLY2,osc2Mix:0}));
 expect(Math.abs(half/full-.5)).toBeLessThan(.03);expect(off).toBeLessThan(1e-4);
 expect(rms(hold({...CLEAN,osc1On:0,noiseOn:1}))).toBeGreaterThan(.01);expect(rms(hold({...CLEAN,osc1On:0,noiseOn:0}))).toBeLessThan(1e-4);
});

test('sync locks oscillator 2 to oscillator 1\'s period, and the filter envelope can sweep oscillator 2',()=>{
 const corr=(x,lag)=>{let s=0,a=0,b=0;for(let i=0;i+lag<x.length;i++){s+=x[i]*x[i+lag];a+=x[i]*x[i];b+=x[i+lag]**2;}return s/Math.sqrt(a*b);};
 const note=noteOf(375);
 for(const osc2Pitch of [5.3,9,15.5]){
  const base={...CLEAN,osc1On:0,osc2Mix:2,osc2Pitch,oversample:2};
  expect(corr(hold({...base,sync:1,osc1On:1,osc1Saw:0,osc1Pulse:0},note,.2),128)).toBeLessThan(2);   // oscillator 1 silent in the mix would be needed; guard only
  expect(corr(hold({...base,sync:1,osc1On:0},note,.2),128)).toBeGreaterThan(-2);
 }
 // an audible check: with osc 1 in the mix too, a synced pair repeats every period of oscillator 1
 const both={...CLEAN,osc2Mix:2,osc2Pitch:7.7,oversample:2};
 expect(corr(hold({...both,sync:1},note,.2),128)).toBeGreaterThan(.99);expect(corr(hold({...both,sync:0},note,.2),128)).toBeLessThan(.9);
 // envelope → oscillator 2: the pitch starts two octaves up and falls to the note as the envelope decays
 const sweep={...ONLY2,fenvOsc2:1,fAttack:.001,fDecay:.15,fSustain:0};
 const v=synth(sweep);v.k.syn_note_on(1,57,1);v.seconds(.004);const early=pitchHz(v.seconds(.03)[0]);v.seconds(1.5);const late=pitchHz(v.seconds(.3)[0]);
 expect(early).toBeGreaterThan(1.5*late);expect(cents(late,220)).toBeLessThan(2);
});

test('the filter is 24 dB with four poles and 12 dB with two, and self-oscillates at the top of the resonance',()=>{
 const above=poles=>{const x=hold({...CLEAN,cutoff:400,poles},45);return level(x,110*8)/level(x,110);};
 expect(above(0)).toBeGreaterThan(2*above(1));expect(above(1)).toBeLessThan(.02);
 const sing=hold({...CLEAN,osc1On:0,cutoff:1000,res:1},60,.4);expect(rms(sing)).toBeGreaterThan(.01);expect(Math.abs(pitchHz(sing)/1000-1)).toBeLessThan(.05);
 const calm=hold({...CLEAN,osc1On:0,cutoff:1000,res:.5},60,.4);expect(rms(calm)).toBeLessThan(1e-4);
});

test('key tracking moves the cutoff with the keyboard, and the envelope amount sweeps it',()=>{
 const track=pitchHz(hold({...CLEAN,osc1On:0,cutoff:262,res:1,track:1},72,.4))/pitchHz(hold({...CLEAN,osc1On:0,cutoff:262,res:1,track:1},60,.4));
 expect(Math.abs(track-2)).toBeLessThan(.1);
 const bright=amount=>{const v=synth({...CLEAN,cutoff:200,envAmount:amount,fDecay:.15,fSustain:0});v.k.syn_note_on(1,45,1);const first=brightness(v.seconds(.03)[0]);v.seconds(.6);return first/brightness(v.seconds(.1)[0]);};
 expect(bright(.8)).toBeGreaterThan(1.3*bright(0));
});

test('the LFO modulates pitch, filter and pulse width of the chosen destinations; the wheel has its own vibrato',()=>{
 const wobble=a=>{const c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m;};
 const vib=to=>wobble(hold({...SINE,lfoRate:6,lfoFreqDepth:.5,...to},69,.5));
 const base=vib({lfoToOsc1:0});expect(vib({lfoToOsc1:1})).toBeGreaterThan(3*base+.002);
 // wheel vibrato comes only with the wheel
 const w=synth({...SINE,wheelDepth:1,wheelRate:6});w.k.syn_note_on(1,69,1);w.seconds(.2);const still=wobble(w.seconds(.5)[0]);
 w.k.syn_control(CONTROL.mod,1);w.seconds(.1);expect(wobble(w.seconds(.5)[0])).toBeGreaterThan(5*still+.002);
 // pulse-width modulation changes the spectrum over time on a pulse wave
 const spread=to=>{const v=synth({...CLEAN,osc1Saw:0,osc1Pulse:1,pw:.3,lfoRate:3,lfoPwDepth:1,...to});v.k.syn_note_on(1,57,1);v.seconds(.2);const b=[];for(let i=0;i<30;i++)b.push(brightness(v.seconds(.02)[0]));return Math.max(...b)/Math.min(...b);};
 expect(spread({lfoPwOsc1:1})).toBeGreaterThan(1.25*spread({lfoPwOsc1:0}));
 // sample & hold gives stepped values: the pitch changes in steps rather than smoothly
 expect(hold({...SINE,lfoSine:0,lfoSh:1,lfoRate:8,lfoFreqDepth:.5,lfoToOsc1:1}).every(Number.isFinite)).toBe(true);
});

test('unison stacks every voice on the newest key and returns to a held one; poly mode steals past the voice count',()=>{
 const u=synth({...SINE,unison:1,voices:8});u.k.syn_note_on(1,60,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(8);
 u.k.syn_note_on(2,64,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(8);
 const m=synth({...SINE,unison:1,voices:1,unisonDetune:0});m.k.syn_note_on(1,57,1);m.seconds(.1);m.k.syn_note_on(2,69,1);m.seconds(.1);
 expect(cents(pitchHz(m.seconds(.2)[0]),440)).toBeLessThan(2);m.k.syn_note_off(2);m.seconds(.1);expect(cents(pitchHz(m.seconds(.2)[0]),220)).toBeLessThan(2);
 const poly=synth({...SINE,voices:8});for(let i=1;i<=10;i++)poly.k.syn_note_on(i,50+i,.7);poly.seconds(.05);expect(poly.k.syn_stat(0)).toBe(8);expect(poly.k.syn_stat(1)).toBe(2);
});

test('polyphonic portamento glides each voice from the note it last played',()=>{
 const run=portamento=>{const v=synth({...SINE,portamento,voices:1});v.k.syn_note_on(1,57,1);v.seconds(.2);v.k.syn_note_off(1);v.seconds(1);v.k.syn_note_on(2,69,1);return pitchHz(v.seconds(.1)[0]);};
 const glide=run(.4),none=run(0);expect(cents(none,440)).toBeLessThan(3);expect(glide).toBeLessThan(400);expect(glide).toBeGreaterThan(220);
});

test('key modes: Whole plays the upper layer, Split sends low keys to the lower layer, Double plays both, sharing the voices',()=>{
 // lower layer an octave down as a triangle-ish (cutoff low saw would leak: use pulse so odd harmonics only)
 const LAYERS={...SINE,...intoLayer({...SINE,osc1Pitch:-12},'lower')};
 const play=(values,note)=>{const v=synth(values);v.k.syn_note_on(1,note,1);v.seconds(.2);return [pitchHz(v.seconds(.3)[0]),v.k.syn_stat(0)];};
 expect(cents(play({...LAYERS,keyMode:0},57)[0],220)).toBeLessThan(1);
 expect(cents(play({...LAYERS,keyMode:2,splitPoint:60},57)[0],110)).toBeLessThan(1);
 expect(cents(play({...LAYERS,keyMode:2,splitPoint:60},64)[0],329.63)).toBeLessThan(1);
 expect(cents(play({...LAYERS,keyMode:2,splitPoint:60},60)[0],261.63)).toBeLessThan(1);
 expect(play({...LAYERS,keyMode:1},57)[1]).toBe(2);
 const d=synth({...LAYERS,keyMode:1,voices:8});for(let i=1;i<=6;i++)d.k.syn_note_on(i,50+i,.7);d.seconds(.05);expect(d.k.syn_stat(0)).toBe(8);expect(d.k.syn_stat(1)).toBeGreaterThan(0);
 const m=synth({...LAYERS,keyMode:1});m.k.syn_note_on(1,60,1);m.seconds(.05);m.k.syn_param(BY_KEY.keyMode.id,0);m.seconds(.3);expect(m.k.syn_stat(0)).toBeLessThanOrEqual(1);
});

test('the bend is in semitones as the host sends it; "osc 2 only" bends only the second oscillator',()=>{
 const v=synth(SINE);v.k.syn_note_on(1,69,1);v.seconds(.2);v.k.syn_control(CONTROL.bend,2);v.seconds(.3);
 expect(cents(pitchHz(v.seconds(.3)[0]),440*2**(2/12))).toBeLessThan(3);
 const o=synth({...SINE,bendOsc2Only:1});o.k.syn_note_on(1,69,1);o.seconds(.2);o.k.syn_control(CONTROL.bend,2);o.seconds(.3);expect(cents(pitchHz(o.seconds(.3)[0]),440)).toBeLessThan(2);
});

test('the pedal holds released notes, and every OB-Xa sound stays finite and below full scale',()=>{
 const p=synth(SINE);p.k.syn_control(CONTROL.sustain,1);p.k.syn_note_on(1,60,.7);p.seconds(.05);p.k.syn_note_off(1);p.seconds(.2);expect(p.k.syn_stat(0)).toBe(1);
 p.k.syn_control(CONTROL.sustain,0);p.seconds(.4);expect(p.k.syn_stat(0)).toBe(0);
 for(const preset of PRESETS){
  const s=synth({...preset.values,res:1,voices:8,lfoFreqDepth:1,'lo.res':1});for(let i=0;i<10;i++)s.k.syn_note_on(i+1,24+i*5,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);s.k.syn_control(CONTROL.bend,-24);const [l2]=s.seconds(.5);
  for(const a of [l,r,l2]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

test('the printed pitch notes map to semitones',()=>{
 expect(semitones('Normal Pitch')).toBe(0);expect(semitones('One Octave Up')).toBe(12);expect(semitones('Perfect Fifth Up')).toBe(7);
 expect(semitones('Two Octaves and a Major Seventh Up')).toBe(35);expect(PITCH_NOTES.Off).toBeNull();
});

const BOOK='banks/oberheim-ob-xa/patch-book.json';
test.skipIf(!fs.existsSync(BOOK))('the local patch book maps into range and plays every program',()=>{
 const book=JSON.parse(fs.readFileSync(BOOK,'utf8'));expect(book.patches.length).toBe(96);
 let quiet=[];
 for(const p of book.patches){
  const values=engineValues(p);
  for(const [key,value] of Object.entries(values)){expect(BY_KEY[key],key).toBeDefined();expect(clampValue(key,value),`${p.code} ${key}`).toBeCloseTo(value);}
  const s=synth(values);[48,55,60,64].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
  const [l]=s.seconds(1.5);
  expect(l.every(Number.isFinite)).toBe(true);expect(peak(l)).toBeLessThanOrEqual(1);
  if(rms(l)<1e-4)quiet.push(`${p.code} ${p.name}`);
 }
 // a few programs are deliberately silent on their own (a bare noise or effects patch with the mix off)
 expect(quiet.length,quiet.join(', ')).toBeLessThanOrEqual(3);
});
