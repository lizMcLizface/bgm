// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,MODELS,rms,peak,pitchHz as pitchOf} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize,operatorBase,OPERATOR_FIELDS} from '../dx7/params';
import {PRESETS} from '../dx7/presets';
import {ALGORITHMS,algorithmGraph} from '../dx7/algorithms';
import {parseDx7Sysex} from '../dx7/sysex';
import {engineValues} from '../dx7/voice';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=(values={},sampleRate=48000)=>createOfflineSynth(module,{sampleRate,model:MODELS.dx7,params:toPairs(sanitize({reverbMix:0,...values}))});
const pitchHz=(a,sr=48000)=>pitchOf(a,sr);
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
/** One sine carrier (OP1) and nothing else, at constant level. */
const SINE={algorithm:31,'op1.level':99,'op1.coarse':1};
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}
const hold=(values,note=69,s=.3,sr=48000)=>{const v=synth(values,sr);v.k.syn_note_on(1,note,1);v.seconds(.1);return v.seconds(s)[0];};

test('the table fits the kernel ABI, and the ids follow the DX7 voice layout (operator 6 first)',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(176);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<176||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY['op6.r1'].id).toBe(0);expect(BY_KEY['op1.r1'].id).toBe(105);expect(BY_KEY['op1.level'].id).toBe(105+16);expect(BY_KEY['op3.detune'].id).toBe(operatorBase(3)+20);
 expect(OPERATOR_FIELDS.length).toBe(21);expect(BY_KEY.algorithm.id).toBe(134);expect(BY_KEY.lfoWave.id).toBe(142);expect(BY_KEY.transpose.id).toBe(144);
});

test('a sine carrier is in tune at every sample rate; ratio, fixed frequency, fine and detune move it correctly',()=>{
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold(SINE,69,.4,sr),sr),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,'op1.coarse':2})),880)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,'op1.coarse':0})),220)).toBeLessThan(1);   // coarse 0 = ×0.5
 expect(cents(pitchHz(hold({...SINE,'op1.coarse':1,'op1.fine':50})),440*1.5)).toBeLessThan(2);
 expect(cents(pitchHz(hold({...SINE,'op1.mode':1,'op1.coarse':3,'op1.fine':0})),1000)).toBeLessThan(2);   // fixed: 1000 Hz at any key
 expect(cents(pitchHz(hold({...SINE,'op1.mode':1,'op1.coarse':3},45)),1000)).toBeLessThan(2);
 expect(cents(pitchHz(hold({...SINE,'op1.detune':14})),440)).toBeGreaterThan(5);          // detune +7 ≈ 7 counts
 expect(cents(pitchHz(hold({...SINE,transpose:36})),880)).toBeLessThan(1);
 expect(cents(pitchHz(hold({...SINE,tune:50})),440*2**(50/1200))).toBeLessThan(2);
});

test('output level is in the DX7\'s steps (about 0.75 dB each) and velocity scales a sensitive operator',()=>{
 const a=level(hold({...SINE,'op1.level':99}),440),b=level(hold({...SINE,'op1.level':89}),440),c=level(hold({...SINE,'op1.level':79}),440);
 expect(Math.abs(20*Math.log10(b/a)+7.5)).toBeLessThan(.8);expect(Math.abs(20*Math.log10(c/b)+7.5)).toBeLessThan(.8);
 const at=(velocity,sens)=>{const v=synth({...SINE,'op1.velocity':sens});v.k.syn_note_on(1,69,velocity);v.seconds(.1);return level(v.seconds(.2)[0],440);};
 expect(at(.2,7)).toBeLessThan(.6*at(1,7));expect(Math.abs(at(.2,0)/at(1,0)-1)).toBeLessThan(.02);
});

test('the envelope runs through its four rates and levels at the DX7\'s speeds, at any sample rate',()=>{
 const decay=(sr)=>{const v=synth({...SINE,'op1.r1':99,'op1.r2':60,'op1.l1':99,'op1.l2':0,'op1.l3':0},sr);v.k.syn_note_on(1,69,1);v.seconds(.05,undefined);
  const out=[];for(let i=0;i<40;i++)out.push(rms(v.seconds(.05)[0]));const top=Math.max(...out);return .05*(out.findIndex(x=>x<top*.1)+1);};
 const t48=decay(48000);expect(t48).toBeGreaterThan(.1);expect(t48).toBeLessThan(2);
 // the same time at 44.1 and 96 kHz (the envelope speeds are scaled for the sample rate)
 expect(Math.abs(decay(44100)/t48-1)).toBeLessThan(.15);expect(Math.abs(decay(96000)/t48-1)).toBeLessThan(.15);
 // a faster rate is faster, a slower one slower
 const fast=(r2)=>{const v=synth({...SINE,'op1.r2':r2,'op1.l2':0,'op1.l3':0});v.k.syn_note_on(1,69,1);v.seconds(.05);const out=[];for(let i=0;i<40;i++)out.push(rms(v.seconds(.05)[0]));return out.findIndex(x=>x<Math.max(...out)*.1);};
 expect(fast(80)).toBeLessThan(fast(60));expect(fast(60)).toBeLessThan(fast(40)+1);
 // release: key-up runs to L4 at R4
 const rel=r4=>{const v=synth({...SINE,'op1.r4':r4,'op1.l4':0});v.k.syn_note_on(1,69,1);v.seconds(.3);v.k.syn_note_off(1);v.seconds(.1);return rms(v.seconds(.1)[0]);};
 expect(rel(99)).toBeLessThan(.2*rel(50));
 const silent=synth(SINE);silent.k.syn_note_on(1,69,1);silent.seconds(.1);silent.k.syn_note_off(1);silent.seconds(1.5);expect(silent.k.syn_stat(0)).toBe(0);
});

test('operators modulate each other as the algorithm routes them, and an operator switch silences it',()=>{
 // algorithm 5: OP2 modulates OP1. FM adds sidebands around 440 Hz at 440 ± 440 (the modulator is at ratio 1).
 const fm={algorithm:4,'op1.level':99,'op2.level':0,'op3.level':0,'op4.level':0,'op5.level':0,'op6.level':0};
 const none=hold(fm),mod=hold({...fm,'op2.level':85}),off=hold({...fm,'op2.level':85,'op2.on':0});
 const side=x=>level(x,880)/level(x,440);
 expect(side(none)).toBeLessThan(.003);expect(side(mod)).toBeGreaterThan(.1);expect(side(off)).toBeLessThan(.003);
 // feedback on OP6 in algorithm 1 turns a sine into something harmonic
 const fb=f=>hold({algorithm:0,'op1.level':0,'op2.level':0,'op3.level':99,'op4.level':99,'op5.level':99,'op6.level':80,feedback:f});
 // (algorithm 1: OP6 feeds back and modulates OP5 → OP4 → OP3, which is a carrier; more feedback puts more energy in the harmonics)
 const harm=x=>(level(x,880)+level(x,1320)+level(x,1760))/level(x,440);
 expect(fb(7).every(Number.isFinite)).toBe(true);expect(rms(fb(7))).toBeGreaterThan(0);expect(harm(fb(7))).toBeGreaterThan(1.3*harm(fb(0))+.01);
});

test('the algorithm table has 32 entries with at least one carrier, and the drawing graph follows the routing',()=>{
 expect(ALGORITHMS.length).toBe(32);
 for(let i=0;i<32;i++){const g=algorithmGraph(i);expect(g.carriers.length).toBeGreaterThan(0);expect(Object.keys(g.depth).length).toBe(6);}
 // algorithm 32: six independent carriers; algorithm 5: three carriers (OP1, OP3, OP5), each modulated once
 expect(algorithmGraph(31).carriers.sort()).toEqual([1,2,3,4,5,6]);expect(algorithmGraph(31).edges.length).toBe(0);
 const a5=algorithmGraph(4);expect(a5.carriers.sort()).toEqual([1,3,5]);expect(a5.edges.sort()).toEqual([[2,1],[4,3],[6,5]]);expect(a5.feedback).toEqual([6]);
 // algorithm 1: OP2 → OP1; OP6 → OP5 → OP4 → OP3, carriers OP1 and OP3
 const a1=algorithmGraph(0);expect(a1.carriers.sort()).toEqual([1,3]);expect(a1.edges.length).toBe(4);
});

test('the LFO modulates pitch (with delay, wheel and pressure) and amplitude',()=>{
 const wobble=a=>{const c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m;};
 const vib={...SINE,lfoSpeed:70,lfoWave:4,pitchModDepth:60,pitchModSens:6,modWheel:0};
 const v=synth(vib);v.k.syn_note_on(1,69,1);v.seconds(.2);expect(wobble(v.seconds(.5)[0])).toBeGreaterThan(.003);
 // no depth of its own: nothing, until the mod wheel brings it in
 const wheel=synth({...vib,pitchModDepth:0,modWheel:99});wheel.k.syn_note_on(1,69,1);wheel.seconds(.2);const still=wobble(wheel.seconds(.5)[0]);
 wheel.k.syn_control(CONTROL.mod,1);wheel.seconds(.1);expect(wobble(wheel.seconds(.5)[0])).toBeGreaterThan(5*still+.002);
 const touch=synth({...vib,pitchModDepth:0,pressure:99,modWheel:0});touch.k.syn_note_on(1,69,1);touch.seconds(.2);const before=wobble(touch.seconds(.4)[0]);
 touch.k.syn_control(CONTROL.pressure,1);touch.seconds(.2);expect(wobble(touch.seconds(.4)[0])).toBeGreaterThan(5*before+.002);
 // the LFO delay holds the vibrato back
 const late=synth({...vib,lfoDelay:80});late.k.syn_note_on(1,69,1);const early=wobble(late.seconds(.3)[0]);late.seconds(3);expect(wobble(late.seconds(.5)[0])).toBeGreaterThan(4*early+.002);
 // amplitude modulation: AMS 3 with AMD 99 makes the level swing
 const swing=ams=>{const t=synth({...SINE,lfoSpeed:60,lfoWave:4,ampModDepth:99,'op1.ams':ams});t.k.syn_note_on(1,69,1);t.seconds(.1);const w=[];for(let i=0;i<30;i++)w.push(rms(t.seconds(.02)[0]));return Math.max(...w)/Math.min(...w);};
 expect(swing(3)).toBeGreaterThan(2);expect(swing(0)).toBeLessThan(1.05);
});

test('the pitch envelope bends the pitch, and the bend wheel is in semitones',()=>{
 // start four octaves up (L4 = 99) and fall to the note
 const peg={...SINE,pitchL4:99,pitchL1:50,pitchL2:50,pitchL3:50,pitchR1:70,pitchR2:70,pitchR3:70};
 const v=synth(peg);v.k.syn_note_on(1,57,1);const early=pitchHz(v.seconds(.02)[0],48000);v.seconds(1.5);const late=pitchHz(v.seconds(.2)[0],48000);
 expect(early).toBeGreaterThan(1.5*late);expect(cents(late,220)).toBeLessThan(2);
 const b=synth(SINE);b.k.syn_note_on(1,69,1);b.seconds(.2);b.k.syn_control(CONTROL.bend,2);b.seconds(.3);expect(cents(pitchHz(b.seconds(.3)[0],48000),440*2**(2/12))).toBeLessThan(3);
});

test('mono mode with portamento glides legato; polyphony plays 16 notes; the pedal holds',()=>{
 const m=synth({...SINE,mono:1,portamento:60});m.k.syn_note_on(1,57,1);m.seconds(.2);m.k.syn_note_on(2,69,1);
 const during=pitchHz(m.seconds(.1)[0],48000);expect(during).toBeGreaterThan(225);expect(during).toBeLessThan(430);
 m.seconds(3);expect(cents(pitchHz(m.seconds(.2)[0],48000),440)).toBeLessThan(3);expect(m.k.syn_stat(0)).toBe(1);
 m.k.syn_note_off(2);m.seconds(3);expect(cents(pitchHz(m.seconds(.2)[0],48000),220)).toBeLessThan(3);   // back to the held first key
 const poly=synth(SINE);for(let i=1;i<=20;i++)poly.k.syn_note_on(i,40+i,.8);poly.seconds(.05);expect(poly.k.syn_stat(0)).toBe(16);expect(poly.k.syn_stat(1)).toBe(4);
 const p=synth({...SINE,'op1.r4':80});p.k.syn_control(CONTROL.sustain,1);p.k.syn_note_on(1,60,1);p.seconds(.1);p.k.syn_note_off(1);p.seconds(.3);expect(p.k.syn_stat(0)).toBe(1);
 p.k.syn_control(CONTROL.sustain,0);p.seconds(2);expect(p.k.syn_stat(0)).toBe(0);
});

test('level and rate scaling follow the keyboard: a negative right depth quiets high notes',()=>{
 const amp=(values,note)=>level(hold({...SINE,...values},note),440*2**((note-69)/12));
 const plain=amp({},84)/amp({},57);
 const scaled=amp({'op1.rightDepth':60,'op1.rightCurve':0,'op1.breakPoint':39},84)/amp({'op1.rightDepth':60,'op1.rightCurve':0,'op1.breakPoint':39},57);
 expect(scaled).toBeLessThan(.5*plain);
});

test('every built-in voice stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,volume:1});for(let i=0;i<12;i++)s.k.syn_note_on(i+1,28+i*5,1);
  s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,12);
  const [l,r]=s.seconds(1);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

const BANKS='banks/dx7';
const carts=fs.existsSync(BANKS)?fs.readdirSync(BANKS).filter(f=>/\.syx$/i.test(f)):[];
test.skipIf(!carts.length)('every voice of your local cartridges plays finite, and the factory ROMs are audible',()=>{
 let voices=0;
 for(const file of carts){
  for(const v of parseDx7Sysex(fs.readFileSync(path.join(BANKS,file)))){
   const s=synth(engineValues(v.raw));[48,55,60,64].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
   const [l]=s.seconds(1);voices++;
   expect(l.every(Number.isFinite),`${file} ${v.name}`).toBe(true);expect(peak(l)).toBeLessThanOrEqual(1);
   if(/^rom/i.test(file))expect(rms(l),`${file} ${v.name}`).toBeGreaterThan(1e-4);
  }
 }
 expect(voices).toBeGreaterThan(0);
});
