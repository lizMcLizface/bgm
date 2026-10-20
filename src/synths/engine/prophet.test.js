// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize} from '../prophet/params';
import {PRESETS} from '../prophet/presets';
import {parseProphetSysex} from '../prophet/sysex';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.prophet5,params:toPairs(sanitize(values))});
// Osc A's saw alone through an open, untracked filter: steady, dry, no drift.
const CLEAN={aSaw:1,bSaw:0,bFine:0,mixA:1,mixB:0,cutoff:20000,res:0,track:0,fEnv:0,aAttack:.001,aSustain:1,aRelease:.01,
 vintage:0,velAmp:0,velFilter:0,width:0,reverbMix:0};
// near-sine version for zero-crossing pitch
const SINE={...CLEAN,cutoff:500};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
const hold=(values,note=69,s=.3,sr=48000)=>{const v=synth(values,sr);v.k.syn_note_on(1,note,1);v.seconds(.2);return v.seconds(s)[0];};

/** Energy between the harmonics of f relative to energy on them (dB): aliasing. f must be a multiple of 10 Hz at 48 kHz. */
function aliasDb(x,f){
 const N=4800,c=f/10;let h=0,a=0;
 for(let k=1;k<N/2;k++){let re=0,im=0;for(let n=0;n<N;n++){const w=2*Math.PI*k*n/N;re+=x[n]*Math.cos(w);im-=x[n]*Math.sin(w);}const p=re*re+im*im;if(k%c===0)h+=p;else a+=p;}
 return 10*Math.log10(a/h);
}
const noteOf=hz=>69+12*Math.log2(hz/440);

test('the Prophet table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(72);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<72||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.track.options).toEqual(['Off','Half','Full']);
});

test('both oscillators are in tune at every sample rate; Osc B fine and keyboard-off behave',()=>{
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold(SINE,69,.4,sr),sr),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,aFreq:-12}),48000),220)).toBeLessThan(1);
 const b={...SINE,aSaw:0,mixA:0,bSaw:1,mixB:1};
 expect(cents(pitchHz(hold(b),48000),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...b,bFine:50}),48000),440*2**(50/1200))).toBeLessThan(1.5);
 // keyboard off: Osc B stays at middle C whatever key is played
 expect(cents(pitchHz(hold({...b,bKybd:0},45),48000),261.63)).toBeLessThan(1);
});

test('hard sync locks Osc A to Osc B\'s period whatever Osc A is tuned to',()=>{
 // 375 Hz = a 128-sample period at 48 kHz
 const corr=(x,lag)=>{let s=0,a=0,b=0;for(let i=0;i+lag<x.length;i++){s+=x[i]*x[i+lag];a+=x[i]*x[i];b+=x[i+lag]**2;}return s/Math.sqrt(a*b);};
 const note=noteOf(375);
 // tunings whose free-running saw does not happen to line up after one Osc B period
 for(const aFreq of [5.3,9,15.5]){
  const synced=hold({...CLEAN,sync:1,aFreq,oversample:2},note,.2);
  expect(corr(synced,128)).toBeGreaterThan(.99);
  const free=hold({...CLEAN,sync:0,aFreq,oversample:2},note,.2);
  expect(corr(free,128)).toBeLessThan(.9);
 }
});

test('oscillators are band-limited, and the 2× voice path halves the aliasing in dB',()=>{
 const f=2630,note=noteOf(f);
 const db=(values)=>aliasDb(hold(values,note,.1),f);
 expect(db({...CLEAN,oversample:0})).toBeLessThan(-33);
 expect(db({...CLEAN,oversample:2})).toBeLessThan(-52);
 expect(db({...CLEAN,aSaw:0,aPulse:1,aPw:.3,oversample:2})).toBeLessThan(-52);
 expect(db({...CLEAN,aSaw:0,mixA:0,bTri:1,mixB:1,oversample:0})).toBeLessThan(-55);
 // sync resets are corrected at their sub-sample time too
 expect(db({...CLEAN,sync:1,aFreq:7.3,oversample:0})).toBeLessThan(-31);
 expect(db({...CLEAN,sync:1,aFreq:7.3,oversample:2})).toBeLessThan(-50);
});

/** Amplitude of the component at f (Hann-windowed correlation). */
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}

test('Poly-Mod: Osc B frequency-modulates Osc A at audio rate, and the filter envelope sweeps its pitch',()=>{
 // Osc A 440 Hz, Osc B (silent) a fifth up at 659 Hz: FM puts a sideband at their difference, 219 Hz
 const fm={...CLEAN,bTri:1,bSaw:0,bFreq:7};
 const diff=440*(2**(7/12)-1);
 const dry=hold(fm),wet=hold({...fm,pmOscB:.4,pmFreqA:1});
 expect(level(dry,diff)/level(dry,440)).toBeLessThan(.003);
 expect(level(wet,diff)/level(wet,440)).toBeGreaterThan(.05);
 // envelope → Osc A frequency: the pitch starts high and falls to the key as the envelope decays
 const sweep={...SINE,pmEnv:.2,pmFreqA:1,fDecay:.15,fSustain:0};
 const v=synth(sweep);v.k.syn_note_on(1,57,1);v.seconds(.004);
 const early=pitchHz(v.seconds(.03)[0],48000);v.seconds(1);const late=pitchHz(v.seconds(.3)[0],48000);
 expect(early).toBeGreaterThan(1.5*late);expect(cents(late,220)).toBeLessThan(2);
});

test('Osc B in low-frequency mode runs at the measured rates and can follow the keyboard',()=>{
 const lfo={...CLEAN,aSaw:0,mixA:0,bSaw:1,mixB:1,bLow:1,bKybd:0,cutoff:20000};
 // panel step 90 (= +21 st) is 16.86 Hz on a Rev 4
 const rate=x=>pitchHz(x,48000);
 const v=synth({...lfo,bFreq:21});v.k.syn_note_on(1,60,1);v.seconds(.3);expect(Math.abs(rate(v.seconds(2)[0])/16.857-1)).toBeLessThan(.02);
 const t=synth({...lfo,bFreq:21,bKybd:1});t.k.syn_note_on(1,72,1);t.seconds(.3);expect(Math.abs(rate(t.seconds(2)[0])/(2*16.857)-1)).toBeLessThan(.02);
});

test('unison stacks voices on one note; last-note priority returns to a held key; chord memory spreads the stack',()=>{
 const u=synth({...SINE,unison:1,unisonVoices:5,voices:5});u.k.syn_note_on(1,60,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(5);
 u.k.syn_note_on(2,64,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(5);
 const mono={...SINE,unison:1,unisonVoices:1,unisonDetune:0,priority:1};
 const m=synth(mono);m.k.syn_note_on(1,57,1);m.seconds(.1);m.k.syn_note_on(2,69,1);m.seconds(.1);
 expect(cents(pitchHz(m.seconds(.2)[0],48000),440)).toBeLessThan(2);
 m.k.syn_note_off(2);m.seconds(.1);expect(cents(pitchHz(m.seconds(.2)[0],48000),220)).toBeLessThan(2);
 m.k.syn_note_off(1);m.seconds(.3);expect(m.k.syn_stat(0)).toBe(0);
 // low priority keeps the lower key
 const low=synth({...mono,priority:0});low.k.syn_note_on(1,57,1);low.seconds(.05);low.k.syn_note_on(2,69,1);low.seconds(.1);
 expect(cents(pitchHz(low.seconds(.2)[0],48000),220)).toBeLessThan(2);
 const chord=synth({...SINE,unison:1,chord:1,chord1:0,chord2:7,chord3:12,voices:5});chord.k.syn_note_on(1,60,1);chord.seconds(.05);
 expect(chord.k.syn_stat(0)).toBe(3);
});

test('poly mode follows the voices setting and the pedal; full resonance self-oscillates',()=>{
 const s=synth({...SINE,voices:5});for(let i=1;i<=7;i++)s.k.syn_note_on(i,50+i,.7);s.seconds(.05);
 expect(s.k.syn_stat(0)).toBe(5);expect(s.k.syn_stat(1)).toBe(2);
 const p=synth(SINE);p.k.syn_control(CONTROL.sustain,1);p.k.syn_note_on(1,60,.7);p.seconds(.05);p.k.syn_note_off(1);p.seconds(.2);expect(p.k.syn_stat(0)).toBe(1);
 p.k.syn_control(CONTROL.sustain,0);p.seconds(.2);expect(p.k.syn_stat(0)).toBe(0);
 const sing=synth({...CLEAN,mixA:0,cutoff:1000,res:1});sing.k.syn_note_on(1,60,.8);sing.seconds(.8);const [tone]=sing.seconds(.4);
 expect(rms(tone)).toBeGreaterThan(.01);expect(Math.abs(pitchHz(tone,48000)/1000-1)).toBeLessThan(.05);
});

test('the mod wheel brings in wheel-mod vibrato on the chosen oscillators',()=>{
 const wobble=a=>{const c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m;};
 const v=synth({...SINE,lfoRate:6,lfoTri:1,wmFreqA:1});v.k.syn_note_on(1,69,1);v.seconds(.2);const still=wobble(v.seconds(.5)[0]);
 v.k.syn_control(CONTROL.mod,.5);v.seconds(.1);expect(wobble(v.seconds(.5)[0])).toBeGreaterThan(5*still+1e-3);
});

test('every Prophet sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,res:1,voices:16,pmOscB:1,pmFreqA:1,pmFilter:1});for(let i=0;i<16;i++)s.k.syn_note_on(i+1,24+i*5,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);s.k.syn_control(CONTROL.bend,-24);const [l2]=s.seconds(.5);
  for(const a of [l,r,l2]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

const FACTORY='banks/prophet-5/p5-factory-v1.03.syx';
test.skipIf(!fs.existsSync(FACTORY))('every program in the local factory file plays finite and audible',()=>{
 const programs=parseProphetSysex(fs.readFileSync(FACTORY));expect(programs.length).toBe(200);
 for(const p of programs){
  const s=synth(p.engine);[48,55,60,64].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
  const [l]=s.seconds(1.5);
  expect(l.every(Number.isFinite)).toBe(true);expect(peak(l)).toBeLessThanOrEqual(1);
  expect(rms(l),`${p.code} ${p.name}`).toBeGreaterThan(1e-4);
 }
});

test('the bend is in semitones as the host sends it (the program bend range does not rescale it)',()=>{
 const v=synth({...SINE,bendRange:12});v.k.syn_note_on(1,69,1);v.seconds(.2);v.k.syn_control(CONTROL.bend,2);v.seconds(.3);
 expect(cents(pitchHz(v.seconds(.3)[0],48000),440*2**(2/12))).toBeLessThan(3);
});
