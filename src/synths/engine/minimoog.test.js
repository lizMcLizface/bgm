// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize} from '../minimoog/params';
import {PRESETS} from '../minimoog/presets';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.minimoog,params:toPairs(sanitize(values))});
// Oscillator 1's saw alone through a wide-open filter, steady and dry
const CLEAN={osc1Wave:2,mix1:.6,mix1On:1,mix2On:0,mix3On:0,noiseOn:0,drive:.3,feedback:0,cutoff:24000,emphasis:0,contour:0,kbdThird:0,kbdTwoThirds:0,
 aAttack:.001,aSustain:1,decayOn:0,velContour:0,velLevel:0,reverbMix:0};
const SINE={...CLEAN,osc1Wave:0,cutoff:500};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
const hold=(values,note=69,s=.3,sr=48000)=>{const v=synth(values,sr);v.k.syn_note_on(1,note,1);v.seconds(.2);return v.seconds(s)[0];};
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}
const noteOf=hz=>69+12*Math.log2(hz/440);

test('the Minimoog table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(52);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<52||(p.id>=180&&p.id<196)||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.osc1Range.options).toEqual(['LO',"32'","16'","8'","4'","2'"]);
});

test('every range and oscillator is in tune at every sample rate; osc 2 tune and master tune move the pitch',()=>{
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold(SINE,69,.4,sr),sr),440)).toBeLessThan(1);
 for(const [range,ref] of [[2,220],[4,880],[1,110]])expect(cents(pitchHz(hold({...SINE,osc1Range:range,cutoff:range===4?1500:500},range===1?69:69),48000),ref)).toBeLessThan(1.5);
 const two={...SINE,mix1On:0,mix2On:1,mix2:.6,osc2Wave:0};
 expect(cents(pitchHz(hold(two),48000),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...two,osc2Tune:3}),48000),440*2**(3/12))).toBeLessThan(1.5);
 expect(cents(pitchHz(hold({...SINE,tune:50}),48000),440*2**(50/1200))).toBeLessThan(1.5);
 const three={...SINE,mix1On:0,mix3On:1,mix3:.6,osc3Wave:0};
 expect(cents(pitchHz(hold(three),48000),440)).toBeLessThan(1);
});

test('the waveforms have their characteristic harmonics',()=>{
 const f=220,note=noteOf(f);
 const partial=(wave,n)=>{const x=hold({...CLEAN,osc1Wave:wave,drive:0,mix1:.3},note,.2);return level(x,f*n)/level(x,f);};
 expect(partial(3,2)).toBeLessThan(.02);expect(partial(3,3)).toBeGreaterThan(.2);   // square: odd harmonics only
 expect(partial(2,2)).toBeGreaterThan(.35);                                         // saw: all of them
 expect(partial(0,3)).toBeLessThan(.2);                                             // triangle: weak third
 expect(partial(5,2)).toBeGreaterThan(.2);                                          // narrow pulse: even harmonics too
});

test('the filter self-oscillates at the cutoff with no oscillator, tracks the keyboard fully, and rolls off at 24 dB',()=>{
 const sing={...CLEAN,mix1On:0,cutoff:1000,emphasis:1};
 const x=hold(sing,60,.4);expect(rms(x)).toBeGreaterThan(.01);expect(Math.abs(pitchHz(x,48000)/1000-1)).toBeLessThan(.05);
 // keyboard control ⅓ + ⅔ = full: an octave up moves the singing pitch an octave
 const track={...sing,kbdThird:1,kbdTwoThirds:1,cutoff:262};
 const lo=pitchHz(hold(track,60,.4),48000),hi=pitchHz(hold(track,72,.4),48000);
 expect(Math.abs(hi/lo-2)).toBeLessThan(.08);
 // ⅓ alone moves a third of the way
 const third=pitchHz(hold({...track,kbdTwoThirds:0},72,.4),48000);expect(Math.abs(third/lo-2**(1/3))).toBeLessThan(.06);
 const slope=hold({...CLEAN,cutoff:400,emphasis:0},45);expect(level(slope,110*8)/level(slope,110)).toBeLessThan(.02);
});

test('the filter contour sweeps the cutoff; the decay switch makes the release follow the decay',()=>{
 const bright=values=>{const v=synth(values);v.k.syn_note_on(1,45,1);const first=brightness(v.seconds(.03)[0]);v.seconds(.6);return [first,brightness(v.seconds(.1)[0])];};
 const [early,late]=bright({...CLEAN,cutoff:200,contour:.8,fDecay:.15,fSustain:0});
 expect(early).toBeGreaterThan(1.3*late);
 const tail=decayOn=>{const v=synth({...SINE,aDecay:1.5,aSustain:1,decayOn});v.k.syn_note_on(1,60,1);v.seconds(.2);v.k.syn_note_off(1);v.seconds(.1);return rms(v.seconds(.1)[0]);};
 expect(tail(0)).toBeLessThan(1e-4);expect(tail(1)).toBeGreaterThan(.01);
});

test('monophonic: low-note priority returns to the held key; single trigger is legato, multi retriggers',()=>{
 const m=synth({...SINE,priority:0});m.k.syn_note_on(1,57,1);m.k.syn_note_on(2,45,1);m.seconds(.1);
 expect(m.k.syn_stat(0)).toBe(1);expect(cents(pitchHz(m.seconds(.2)[0],48000),110)).toBeLessThan(2);
 m.k.syn_note_off(2);m.seconds(.1);expect(cents(pitchHz(m.seconds(.2)[0],48000),220)).toBeLessThan(2);
 // a higher key while a lower one is held does not take over under low priority
 const low=synth({...SINE,priority:0});low.k.syn_note_on(1,45,1);low.k.syn_note_on(2,69,1);low.seconds(.1);expect(cents(pitchHz(low.seconds(.2)[0],48000),110)).toBeLessThan(2);
 const last=synth({...SINE,priority:1});last.k.syn_note_on(1,45,1);last.k.syn_note_on(2,69,1);last.seconds(.1);expect(cents(pitchHz(last.seconds(.2)[0],48000),440)).toBeLessThan(2);
 // a second key while the first is held: single trigger keeps the filter closed after its decay, multi reopens it
 const reopen=trigger=>{const v=synth({...CLEAN,cutoff:200,contour:.6,fDecay:.1,fSustain:0,aDecay:5,trigger,priority:1});
  v.k.syn_note_on(1,45,1);v.seconds(.8);v.k.syn_note_on(2,47,1);return brightness(v.seconds(.03)[0]);};
 expect(reopen(1)).toBeGreaterThan(1.3*reopen(0));
});

test('glide moves between notes over its time, and only when switched on',()=>{
 const run=(glideOn)=>{const v=synth({...SINE,glideOn,glide:.4});v.k.syn_note_on(1,57,1);v.seconds(.2);v.k.syn_note_off(1);v.k.syn_note_on(2,69,1);return pitchHz(v.seconds(.1)[0],48000);};
 const on=run(1),off=run(0);expect(cents(off,440)).toBeLessThan(3);expect(on).toBeLessThan(400);expect(on).toBeGreaterThan(220);
 // with a key still held, last-note priority lets the new key glide the pitch
 const v=synth({...SINE,glideOn:1,glide:.4,priority:1});v.k.syn_note_on(1,57,1);v.seconds(.2);v.k.syn_note_on(2,69,1);v.seconds(1.5);expect(cents(pitchHz(v.seconds(.2)[0],48000),440)).toBeLessThan(3);
});

test('oscillator 3 free of the keyboard modulates pitch (wheel) and filter at its own rate',()=>{
 const wobble=a=>{const c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m;};
 const vib={...SINE,osc3Range:0,osc3Kbd:0,osc3Tune:3,osc3Wave:0,modOsc:1,modFilter:0,modMix:0};
 const v=synth(vib);v.k.syn_note_on(1,69,1);v.seconds(.2);const still=wobble(v.seconds(.5)[0]);
 v.k.syn_control(CONTROL.mod,.4);v.seconds(.1);expect(wobble(v.seconds(.5)[0])).toBeGreaterThan(5*still+1e-3);
 // the filter wobble: brightness varies over time when oscillator 3 modulates a closed filter
 const run=modAmount=>{const w=synth({...CLEAN,cutoff:300,modFilter:1,modOsc:0,modAmount,osc3Range:0,osc3Kbd:0,osc3Tune:2,osc3Wave:0});w.k.syn_note_on(1,45,1);w.seconds(.3);
  const b=[];for(let i=0;i<25;i++)b.push(brightness(w.seconds(.02)[0]));return Math.max(...b)/Math.min(...b);};
 expect(run(.6)).toBeGreaterThan(1.5*run(0));
});

test('overdrive: hot mixer levels compress the output and add harmonics; feedback changes the sound',()=>{
 const sine=values=>hold({...SINE,cutoff:3000,...values},57,.3);
 const soft=sine({mix1:.2,drive:0}),hot=sine({mix1:1,drive:1});
 // the input is 26 times hotter (5× the knob, 5.2× the drive): the output must grow much less
 expect(rms(hot)/rms(soft)).toBeLessThan(.6*26);
 // a triangle has no even harmonics; the asymmetric overload adds them
 const f=note=>440*2**((57-69)/12);const second=x=>level(x,2*f())/level(x,f());
 expect(second(hot)).toBeGreaterThan(5*second(soft)+.01);
 const fed=sine({feedback:.8});expect(fed.every(Number.isFinite)).toBe(true);expect(Math.abs(rms(fed)/rms(sine({feedback:0}))-1)).toBeGreaterThan(.05);
});

test('the saw is band-limited at the normal rate and cleaner with the 2× path',()=>{
 const f=2630,note=noteOf(f),N=4800;
 const alias=x=>{const c=f/10;let h=0,a=0;for(let k=1;k<N/2;k++){let re=0,im=0;for(let n=0;n<N;n++){const w=2*Math.PI*k*n/N;re+=x[n]*Math.cos(w);im-=x[n]*Math.sin(w);}const p=re*re+im*im;if(k%c===0)h+=p;else a+=p;}return 10*Math.log10(a/h);};
 expect(alias(hold({...CLEAN,oversample:0,osc1Range:3,drive:0},note,.1))).toBeLessThan(-30);
 expect(alias(hold({...CLEAN,oversample:1,drive:0},note,.1))).toBeLessThan(-50);
});

test('the bend is in semitones as the host sends it',()=>{
 const v=synth(SINE);v.k.syn_note_on(1,69,1);v.seconds(.2);v.k.syn_control(CONTROL.bend,2);v.seconds(.3);
 expect(cents(pitchHz(v.seconds(.3)[0],48000),440*2**(2/12))).toBeLessThan(3);
});

test('every Minimoog sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,emphasis:1,drive:1,feedback:1,modAmount:1,mix1:1,mix2:1,mix3On:1,mix3:1,noiseOn:1,noise:1});
  for(let i=0;i<8;i++){s.k.syn_note_on(i+1,24+i*7,1);s.seconds(.05);}
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

test('the pedal holds the note after the key is released',()=>{
 const v=synth({...SINE,aDecay:.1,decayOn:1});v.k.syn_control(CONTROL.sustain,1);v.k.syn_note_on(1,60,1);v.seconds(.2);v.k.syn_note_off(1);v.seconds(.3);
 expect(rms(v.seconds(.1)[0])).toBeGreaterThan(.01);v.k.syn_control(CONTROL.sustain,0);v.seconds(.5);expect(v.k.syn_stat(0)).toBe(0);
});
