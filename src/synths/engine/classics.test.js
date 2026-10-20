// @vitest-environment node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {sourceHash} from '../../../tools/buildClassics.mjs';
import {createOfflineSynth,rms,peak,brightness,pitchHz} from './offline';
import {PARAMS,BY_KEY,defaultValues,toPairs,sanitize} from '../cs80/params';
import {PRESETS} from '../cs80/presets';

const bytes=fs.readFileSync('public/synths/classics.wasm');
const module=new WebAssembly.Module(bytes);
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,params:toPairs(sanitize(values))});
// Ch I sine only, steady pitch, no effects: a clean probe.
const PURE={'i.saw':0,'i.sine':1,'ii.level':0,drift:0,reverbMix:0,chorusMix:0,'i.initLevel':0,'i.a':.001,'i.s':1,'i.r':.01};
const SAW={'i.saw':1,'i.lpf':800,'i.lpRes':0,'i.al':0,'i.il':0,'i.initBrill':0,'ii.level':0,drift:0,reverbMix:0,chorusMix:0,'i.a':.001,'i.s':1};
const CONTROL={bend:0,pressure:1,sustain:5};

test('checked-in Wasm is built from the current Rust sources',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/synths/classics-build.json','utf8'));
 expect(manifest.source).toBe(sourceHash());
 expect(manifest.wasm).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
});

test('the parameter table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_api()).toBe(1);const count=k.syn_param_count();
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<count||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY['ii.lpf'].id).toBe(BY_KEY['i.lpf'].id+32);
});

test('notes are in tune across sample rates and feet, and the ribbon bends relative to the note',()=>{
 for(const sr of [44100,48000,96000]){
  const s=synth(PURE,sr);s.k.syn_note_on(1,69,.8);const [a]=s.seconds(.4);
  expect(Math.abs(1200*Math.log2(pitchHz(a.subarray(sr*.1),sr)/440))).toBeLessThan(1);
 }
 const high=synth({...PURE,'i.feet':3});high.k.syn_note_on(1,57,.8);const [h]=high.seconds(.3);expect(Math.abs(1200*Math.log2(pitchHz(h.subarray(4800),48000)/880))).toBeLessThan(1);
 const s=synth(PURE);s.k.syn_note_on(1,69,.8);s.k.syn_control(CONTROL.bend,2);s.seconds(.1);const [b]=s.seconds(.3);
 expect(Math.abs(1200*Math.log2(pitchHz(b,48000)/(440*2**(2/12))))).toBeLessThan(2);
});

test('release silences the voice; the sustain pedal holds and a re-struck key reuses its voice',()=>{
 const s=synth(PURE);s.k.syn_note_on(1,60,.8);s.seconds(.1);s.k.syn_note_off(1);const [tail]=s.seconds(.3);
 expect(s.k.syn_stat(0)).toBe(0);expect(rms(tail.subarray(-2000))).toBeLessThan(1e-5);
 s.k.syn_control(CONTROL.sustain,1);for(let i=0;i<5;i++){s.k.syn_note_on(10+i,64,.7);s.seconds(.05);s.k.syn_note_off(10+i);}
 s.seconds(.2);expect(s.k.syn_stat(0)).toBe(1);
 s.k.syn_control(CONTROL.sustain,0);s.seconds(.3);expect(s.k.syn_stat(0)).toBe(0);
});

test('polyphony is capped by the voices setting and stale note-offs do not stop replacements',()=>{
 const s=synth({...PURE,voices:4});for(let i=1;i<=6;i++)s.k.syn_note_on(i,50+i*2,.7);s.seconds(.1);
 expect(s.k.syn_stat(0)).toBe(4);expect(s.k.syn_stat(1)).toBe(2);
 s.k.syn_note_off(1);s.k.syn_note_off(2);s.seconds(.1);expect(s.k.syn_stat(0)).toBe(4);
});

test('after touch brightens through the filter and initial touch follows velocity',()=>{
 const run=(values,velocity,pressure)=>{const s=synth({...SAW,...values});s.k.syn_note_on(1,48,velocity);if(pressure)s.k.syn_pressure(1,pressure);s.seconds(.3);return brightness(s.seconds(.3)[0]);};
 expect(run({'i.afterBrill':1},.7,1)).toBeGreaterThan(1.5*run({'i.afterBrill':1},.7,0));
 expect(run({'i.initBrill':1},1,0)).toBeGreaterThan(1.5*run({'i.initBrill':1},.1,0));
 // channel pressure (the touch pad) and auto touch reach every voice
 const pad=synth({...SAW,'i.afterBrill':1});pad.k.syn_note_on(1,48,.7);pad.k.syn_control(CONTROL.pressure,1);pad.seconds(.3);
 const auto=synth({...SAW,'i.afterBrill':1,autoTouch:1,autoTime:.1});auto.k.syn_note_on(1,48,.7);auto.seconds(.3);
 const none=run({'i.afterBrill':1},.7,0);
 expect(brightness(pad.seconds(.3)[0])).toBeGreaterThan(1.5*none);expect(brightness(auto.seconds(.3)[0])).toBeGreaterThan(1.5*none);
});

test('the IL/AL filter envelope opens on the attack and settles back to the cutoff',()=>{
 const s=synth({...SAW,'i.il':0,'i.al':.8,'i.fa':.02,'i.fd':.3,'i.fr':.1});s.k.syn_note_on(1,48,.7);
 s.seconds(.02);const [open]=s.seconds(.05);s.seconds(1);const [settled]=s.seconds(.1);
 expect(brightness(open)).toBeGreaterThan(2*brightness(settled));
 // a negative initial level starts darker than the cutoff and rises through it
 const low=synth({...SAW,'i.il':-.6,'i.al':0,'i.fa':1});low.k.syn_note_on(1,48,.7);const [start]=low.seconds(.05);low.seconds(1.2);
 expect(brightness(start)).toBeLessThan(.8*brightness(low.seconds(.1)[0]));
});

test('panic stops voices and the reverb tail at once',()=>{
 const s=synth({...PURE,reverbMix:1,reverbDecay:10});s.k.syn_note_on(1,60,1);s.seconds(.3);s.k.syn_note_off(1);s.seconds(.1);
 expect(rms(s.seconds(.05)[0])).toBeGreaterThan(1e-4);s.k.syn_panic();expect(peak(s.seconds(.05)[0])).toBe(0);
});

test('rendering does not depend on block size',()=>{
 const run=chunk=>{const s=synth({...PRESETS[0].values,reverbMix:0});s.k.syn_note_on(1,60,.7);s.k.syn_note_on(2,67,.6);const [a]=s.render(6000,chunk);s.k.syn_note_off(1);return [...a,...s.render(3000,chunk)[0]];};
 // events land at block starts, so compare only block sizes that divide the event frame
 expect(run(40)).toEqual(run(128));expect(run(2000)).toEqual(run(128));
});

test('every factory sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const values={...preset.values,'i.lpRes':1,'ii.lpRes':1,'i.hpRes':1,'ii.hpRes':1,resonance:1,voices:16};
  const s=synth(values);for(let i=0;i<16;i++)s.k.syn_note_on(i+1,24+i*5,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1);s.k.syn_control(CONTROL.bend,-24);const [l2]=s.seconds(.5);
  for(const a of [l,r,l2]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

test('factory sounds are distinct, use known keys and sit within a few dB of each other',()=>{
 const levels=PRESETS.map(p=>{const s=synth(p.values);[48,55,60,64,67].forEach((n,i)=>s.k.syn_note_on(i+1,n,.7));return 20*Math.log10(rms(s.seconds(1.5)[0]));});
 expect(Math.max(...levels)-Math.min(...levels)).toBeLessThan(8);
 expect(new Set(PRESETS.map(p=>JSON.stringify(p.values))).size).toBe(PRESETS.length);
 for(const p of PRESETS)expect(Object.keys(p.values).sort()).toEqual(Object.keys(defaultValues()).sort());
});
