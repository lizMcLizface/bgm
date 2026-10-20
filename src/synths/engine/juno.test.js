// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz} from './offline';
import {PARAMS,BY_KEY,defaultValues,toPairs,sanitize} from '../juno/params';
import {PRESETS} from '../juno/presets';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.juno,params:toPairs(sanitize(values))});
// One saw through a low filter: close enough to a sine for zero-crossing pitch.
const CLEAN={saw:1,sub:0,cutoff:600,kybd:0,res:0,env:0,chorus:0,reverbMix:0,velVca:0,velVcf:0,spread:0,attack:.0015,sustain:1,release:.01};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,sustain:5};

test('the Juno table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(48);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<48||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.chorus.options).toEqual(['Off','I','II','I+II']);
});

test('the DCO is in tune at every sample rate and range, the sub sits an octave down, and nothing drifts',()=>{
 for(const sr of [44100,48000,96000]){const s=synth(CLEAN,sr);s.k.syn_note_on(1,69,.8);const [a]=s.seconds(.4);expect(cents(pitchHz(a.subarray(sr*.1),sr),440)).toBeLessThan(1);}
 const low=synth({...CLEAN,range:0});low.k.syn_note_on(1,69,.8);expect(cents(pitchHz(low.seconds(.4)[0].subarray(4800),48000),220)).toBeLessThan(1);
 const sub=synth({...CLEAN,saw:0,sub:1,cutoff:300});sub.k.syn_note_on(1,69,.8);expect(cents(pitchHz(sub.seconds(.5)[0].subarray(9600),48000),220)).toBeLessThan(1);
 const s=synth(CLEAN);s.k.syn_note_on(1,69,.8);s.seconds(.1);const early=pitchHz(s.seconds(.3)[0],48000);s.seconds(2);
 expect(cents(pitchHz(s.seconds(.3)[0],48000),early)).toBeLessThan(.05);
});

test('full resonance self-oscillates at the cutoff with no oscillator; moderate resonance stays silent',()=>{
 const quiet={...CLEAN,saw:0,cutoff:1000};
 const sing=synth({...quiet,res:1});sing.k.syn_note_on(1,60,.8);sing.seconds(.8);const [tone]=sing.seconds(.4);
 expect(rms(tone)).toBeGreaterThan(.01);expect(Math.abs(pitchHz(tone,48000)/1000-1)).toBeLessThan(.04);
 const calm=synth({...quiet,res:.5});calm.k.syn_note_on(1,60,.8);calm.seconds(.8);expect(rms(calm.seconds(.4)[0])).toBeLessThan(1e-4);
});

test('the high-pass positions boost, pass and then cut the bass',()=>{
 const level=hpf=>{const s=synth({...CLEAN,hpf,cutoff:2000,range:0});s.k.syn_note_on(1,36,.8);s.seconds(.1);return rms(s.seconds(.3)[0]);};
 const [boost,flat,two,three]=[0,1,2,3].map(level);
 expect(boost).toBeGreaterThan(flat*1.2);expect(two).toBeLessThan(flat*.8);expect(three).toBeLessThan(two*.8);
});

test('chorus modes widen the mono voice into stereo at about the same level',()=>{
 const run=chorus=>{const s=synth({...CLEAN,cutoff:3000,chorus});s.k.syn_note_on(1,60,.8);s.seconds(.3);return s.seconds(1);};
 const [dl,dr]=run(0);expect(peak(dl.map((x,i)=>x-dr[i]))).toBe(0);
 for(const mode of [1,2,3]){
  const [l,r]=run(mode);let diff=0;for(let i=0;i<l.length;i++)diff+=(l[i]-r[i])**2;
  expect(Math.sqrt(diff/l.length)).toBeGreaterThan(.05*rms(l));
  expect(Math.abs(20*Math.log10(rms(l)/rms(dl)))).toBeLessThan(3);
 }
});

test('gate mode closes the VCA at once; the envelope mode releases slowly',()=>{
 const tail=vcaMode=>{const s=synth({...CLEAN,vcaMode,release:2});s.k.syn_note_on(1,60,.8);s.seconds(.2);s.k.syn_note_off(1);s.seconds(.02);return [rms(s.seconds(.05)[0]),s.k.syn_stat(0)];};
 const [gated,voices]=tail(1);expect(gated).toBeLessThan(1e-4);expect(voices).toBe(0);
 expect(tail(0)[0]).toBeGreaterThan(.01);
});

test('the LFO delay fades vibrato in, and a negative envelope darkens the attack',()=>{
 const wobble=a=>{const sr=48000,c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m*sr;};
 const s=synth({...CLEAN,lfoDco:1,lfoRate:6,lfoDelay:1.5});s.k.syn_note_on(1,69,.8);
 const early=wobble(s.seconds(.3)[0]);s.seconds(1.5);expect(wobble(s.seconds(.5)[0])).toBeGreaterThan(5*early+1);
 const attack=envPolarity=>{const v=synth({...CLEAN,cutoff:800,env:.6,envPolarity,decay:2,sustain:0});v.k.syn_note_on(1,48,.8);v.seconds(.01);return brightness(v.seconds(.05)[0]);};
 expect(attack(1)).toBeLessThan(.8*attack(0));
});

test('polyphony follows the voices setting and the pedal holds released notes',()=>{
 const s=synth({...CLEAN,voices:6});for(let i=1;i<=8;i++)s.k.syn_note_on(i,50+i,.7);s.seconds(.05);
 expect(s.k.syn_stat(0)).toBe(6);expect(s.k.syn_stat(1)).toBe(2);
 const p=synth(CLEAN);p.k.syn_control(CONTROL.sustain,1);p.k.syn_note_on(1,60,.7);p.seconds(.05);p.k.syn_note_off(1);p.seconds(.2);expect(p.k.syn_stat(0)).toBe(1);
 p.k.syn_control(CONTROL.sustain,0);p.seconds(.2);expect(p.k.syn_stat(0)).toBe(0);
});

test('every Juno sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,res:1,voices:16,lfoVcf:1,lfoDco:12});for(let i=0;i<16;i++)s.k.syn_note_on(i+1,24+i*5,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);s.k.syn_control(CONTROL.bend,-24);const [l2]=s.seconds(.5);
  for(const a of [l,r,l2]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

test('Juno sounds are distinct, use known keys and sit within a few dB of each other',()=>{
 const levels=PRESETS.map(p=>{const s=synth(p.values);[48,55,60,64,67].forEach((n,i)=>s.k.syn_note_on(i+1,n,.7));return 20*Math.log10(rms(s.seconds(1.5)[0]));});
 expect(Math.max(...levels)-Math.min(...levels)).toBeLessThan(8);
 expect(new Set(PRESETS.map(p=>JSON.stringify(p.values))).size).toBe(PRESETS.length);
 for(const p of PRESETS)expect(Object.keys(p.values).sort()).toEqual(Object.keys(defaultValues()).sort());
});
