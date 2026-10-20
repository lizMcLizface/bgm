// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import {createOfflineSynth,MODELS,rms,peak,brightness,pitchHz as pitchOf} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize,engineValues} from '../vs/params';
import {PRESETS} from '../vs/presets';
import {builtinWaves,composeWaves,CYCLE} from '../vs/waves';
import {parseVsSysex} from '../vs/sysex';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const WAVES=builtinWaves();
const synth=(values={},{sampleRate=48000,waves=WAVES}={})=>createOfflineSynth(module,{sampleRate,model:MODELS.vs,waves,params:toPairs(sanitize({reverbMix:0,chorusMix:0,...values}))});
const pitchHz=(a,sr=48000)=>pitchOf(a,sr);
const cents=(hz,ref)=>Math.abs(1200*Math.log2(hz/ref));
const CONTROL={bend:0,pressure:1,mod:2,sustain:5};
function level(x,f,sr=48000){let re=0,im=0,w=0;for(let n=0;n<x.length;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(x.length-1)),a=2*Math.PI*f*n/sr;re+=h*x[n]*Math.cos(a);im+=h*x[n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}
/** All four oscillators on the pure sine (wave 32); point all five mix points at one vector position. */
const at=(x,y)=>Object.fromEntries([0,1,2,3,4].flatMap(i=>[['mixX'+i,x],['mixY'+i,y]]));
const SINE={waveA:32,waveB:32,waveC:32,waveD:32,cutoff:99,ampRate1:0,ampRate2:0,ampRate3:0,ampRate4:0,ampLevel0:99,ampLevel1:99,ampLevel2:99,ampLevel3:99,volume:80};
const hold=(values,note=69,s=.3,opts)=>{const v=synth(values,opts);v.k.syn_note_on(1,note,1);v.seconds(.2);return v.seconds(s);};

test('the table fits the kernel ABI, and the ids follow the engine\'s layout',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(96);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<96||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 const expected={waveA:0,coarseA:4,fineA:8,cutoff:12,ampRate1:21,ampLevel0:26,ampLoop:30,filterRate1:32,filterLevel0:37,mixRate1:44,mixX0:49,mixY0:54,mixLoop:59,lfo1Dest:65,modWheelDest:71,unison:72,pan0:75,raw:83,tune:86};
 for(const [key,id] of Object.entries(expected))expect(BY_KEY[key].id,key).toBe(id);
});

test('an oscillator is in tune at every sample rate; coarse, fine and tune move it',()=>{
 const only=(extra={})=>({...SINE,...at(-64,0),...extra});     // vector at A
 for(const sr of [44100,48000,96000])expect(cents(pitchHz(hold(only(),69,.4,{sampleRate:sr})[0],sr),440)).toBeLessThan(1);
 expect(cents(pitchHz(hold(only({coarseA:12}))[0]),880)).toBeLessThan(1);
 expect(cents(pitchHz(hold(only({fineA:99}))[0]),440*2**(1/12))).toBeLessThan(1.5);   // fine runs to about a semitone
 expect(cents(pitchHz(hold(only({tune:50}))[0]),440*2**(50/1200))).toBeLessThan(1.5);
});

test('the joystick mixes the four oscillators as the manual\'s sheets show',()=>{
 // A, B, C, D = sines at 440, 880, 1320 (a twelfth up), 1760 Hz
 const base={...SINE,coarseB:12,coarseC:19,coarseD:24};
 const mix=(x,y)=>{const out=hold({...base,...at(x,y)},69,.5)[0];const t=[440,880,1318.5,1760].map(f=>level(out,f));const sum=t.reduce((a,b)=>a+b,0);return t.map(v=>v/sum);};
 const close=(got,want,tol=.03)=>want.forEach((w,i)=>expect(Math.abs(got[i]-w),`${i} of ${got.map(v=>v.toFixed(2))}`).toBeLessThan(tol));
 close(mix(0,63),[0,0,0,1]);          // vertex D
 close(mix(0,-64),[0,1,0,0]);         // vertex B
 close(mix(-64,0),[1,0,0,0]);         // vertex A
 close(mix(63,-64),[0,.51,.49,0]);    // the manual's (+63, −64): half B, half C
 close(mix(51,6),[.01,.04,.81,.14]);  // Volkanik's point 3
 close(mix(0,-7),[.26,.30,.24,.20]);  // and its centre-ish point
});

test('the mix envelope moves the vector over time, and a back-and-forth loop keeps moving it',()=>{
 const base={...SINE,coarseC:12,mixRate1:0,mixRate2:54,mixRate3:0,mixRate4:21,mixRate4A:21,
  mixX0:-64,mixY0:0,mixX1:-64,mixY1:0,mixX2:63,mixY2:0,mixX3:63,mixY3:0,mixX4:63,mixY4:0};
 // the oscillator at A (440) fades out and C (880) in
 const track=(extra,seconds,step=.05)=>{const v=synth({...base,...extra});v.k.syn_note_on(1,69,1);const a=[];for(let t=0;t<seconds;t+=step){const x=v.seconds(step)[0];a.push(level(x,440)/(level(x,440)+level(x,880)+1e-9));}return a;};
 const once=track({mixLoop:0},4);expect(once[0]).toBeGreaterThan(.9);expect(once.at(-1)).toBeLessThan(.1);
 const looped=track({mixLoop:4},10);
 // 0.3 s up, 0.3 s back, repeating: the share of A swings between near 1 and near 0 more than once
 let swings=0,high=looped[0]>.5;for(const x of looped){if(high&&x<.2){swings++;high=false;}else if(!high&&x>.8){swings++;high=true;}}
 expect(swings).toBeGreaterThanOrEqual(3);
});

test('the amplifier envelope rises, holds and releases at its rates; loops repeat it',()=>{
 const env={...SINE,...at(-64,0),ampRate1:29,ampRate2:0,ampRate3:0,ampRate4:29,ampLevel0:0,ampLevel1:99,ampLevel2:99,ampLevel3:99};
 const v=synth(env);v.k.syn_note_on(1,69,1);const early=rms(v.seconds(.01)[0]);v.seconds(.6);const full=rms(v.seconds(.1)[0]);
 expect(early).toBeLessThan(.5*full);
 v.k.syn_note_off(1);const rel=[];for(let i=0;i<8;i++)rel.push(rms(v.seconds(.1)[0]));
 expect(rel[0]).toBeGreaterThan(rel[2]);expect(rel.at(-1)).toBeLessThan(.01*full);
 v.seconds(2);expect(v.k.syn_stat(0)).toBe(0);
 // a slower rate takes longer to reach full level
 const rise=rate=>{const w=synth({...env,ampRate1:rate});w.k.syn_note_on(1,69,1);const a=[];for(let i=0;i<30;i++)a.push(rms(w.seconds(.05)[0]));return a.findIndex(x=>x>.9*Math.max(...a));};
 expect(rise(75)).toBeGreaterThan(rise(55));   // a higher rate number is slower on the VS
 // forward loop from point 1: the level pulses repeatedly while the key is held
 const pulse={...env,ampRate1:0,ampRate2:44,ampRate3:44,ampLevel1:99,ampLevel2:0,ampLevel3:99,ampLoop:2,ampRepeat:0};
 const p=synth(pulse);p.k.syn_note_on(1,69,1);const a=[];for(let i=0;i<60;i++)a.push(rms(p.seconds(.05)[0]));
 let dips=0;for(let i=1;i<a.length-1;i++)if(a[i]<a[i-1]*.6&&a[i]<a[i+1]*.8)dips++;
 expect(dips).toBeGreaterThanOrEqual(2);
});

test('the filter cutoff and envelope shape the tone, and resonance rings',()=>{
 const saw={...SINE,waveA:15,waveB:15,waveC:15,waveD:15,...at(0,0)};   // a harmonic-rich built-in wave
 const bright=extra=>brightness(hold({...saw,...extra},48)[0]);
 expect(bright({cutoff:40})).toBeLessThan(.6*bright({cutoff:99}));
 const env=amount=>{const v=synth({...saw,cutoff:25,filterEnvAmount:amount,filterRate1:0,filterRate2:24,filterRate3:24,filterLevel0:0,filterLevel1:99,filterLevel2:0,filterLevel3:0,filterLevel4:0});v.k.syn_note_on(1,48,1);const first=brightness(v.seconds(.05)[0]);v.seconds(1);return first/brightness(v.seconds(.1)[0]);};
 expect(env(80)).toBeGreaterThan(1.3*env(0));
 // a low, fully resonant filter on a quiet input rings at the cutoff
 const ring=hold({...saw,waveA:32,waveB:32,waveC:32,waveD:32,cutoff:50,resonance:99,...at(-64,0),coarseA:24},96,.4)[0];
 expect(rms(ring)).toBeGreaterThan(0);expect(ring.every(Number.isFinite)).toBe(true);
});

test('the matrix routes LFO 1 to a frequency, the mod wheel scales it, and velocity shapes the level',()=>{
 const wobble=a=>{const c=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)c.push(i);const p=c.slice(1).map((x,i)=>x-c[i]);const m=p.reduce((s,x)=>s+x,0)/p.length;return Math.sqrt(p.reduce((s,x)=>s+(x-m)**2,0)/p.length)/m;};
 const vib={...SINE,...at(-64,0),lfo1Shape:0,lfo1Rate:62,lfo1Amount:60,lfo1Dest:1};
 const on=wobble(hold(vib)[0]),off=wobble(hold({...vib,lfo1Dest:0})[0]);expect(on).toBeGreaterThan(3*off+.002);
 // wheel → LFO 1 amount: nothing until the wheel is up
 const w=synth({...vib,modWheelDest:1});w.k.syn_note_on(1,69,1);w.seconds(.2);const still=wobble(w.seconds(.5)[0]);
 w.k.syn_control(CONTROL.mod,1);w.seconds(.1);expect(wobble(w.seconds(.5)[0])).toBeGreaterThan(4*still+.002);
 // velocity → amplifier: a soft key is quieter than a hard one, but not with the route off
 const at_=(velocity,route)=>{const v=synth({...SINE,...at(-64,0),velocityAmount:80,velocityDest:route});v.k.syn_note_on(1,69,velocity);v.seconds(.1);return rms(v.seconds(.2)[0]);};
 expect(at_(.2,8)).toBeLessThan(.6*at_(1,8));expect(Math.abs(at_(.2,0)/at_(1,0)-1)).toBeLessThan(.02);
 // keyboard → mix: the vector slides with the key
 const kb=note=>{const v=synth({...SINE,coarseB:12,...at(0,0),keyboardAmount:90,keyboardDest:2});v.k.syn_note_on(1,note,1);v.seconds(.1);const x=v.seconds(.3)[0];const f=440*2**((note-69)/12);return level(x,f)/(level(x,f)+level(x,2*f));};
 expect(Math.abs(kb(45)-kb(93))).toBeGreaterThan(.1);
});

test('each voice has its own pan, and unison stacks all eight voices on one key',()=>{
 const left=synth({...SINE,...at(-64,0),pan0:-63});left.k.syn_note_on(1,69,1);left.seconds(.1);const [l,r]=left.seconds(.2);expect(rms(l)).toBeGreaterThan(20*rms(r));
 const u=synth({...SINE,...at(-64,0),unison:5});u.k.syn_note_on(1,60,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(8);
 u.k.syn_note_on(2,64,1);u.seconds(.05);expect(u.k.syn_stat(0)).toBe(8);
 const poly=synth({...SINE,...at(-64,0)});for(let i=1;i<=10;i++)poly.k.syn_note_on(i,50+i,.7);poly.seconds(.05);expect(poly.k.syn_stat(0)).toBe(8);expect(poly.k.syn_stat(1)).toBe(2);
});

test('glide, the pedal and the bend in semitones',()=>{
 const g=glide=>{const v=synth({...SINE,...at(-64,0),glide});v.k.syn_note_on(1,57,1);v.seconds(.2);v.k.syn_note_off(1);v.seconds(1);v.k.syn_note_on(2,69,1);return pitchHz(v.seconds(.1)[0]);};
 expect(cents(g(0),440)).toBeLessThan(3);expect(g(60)).toBeLessThan(430);expect(g(60)).toBeGreaterThan(220);
 const p=synth({...SINE,...at(-64,0),ampRate4:29});p.k.syn_control(CONTROL.sustain,1);p.k.syn_note_on(1,60,1);p.seconds(.1);p.k.syn_note_off(1);p.seconds(.3);expect(p.k.syn_stat(0)).toBe(1);
 p.k.syn_control(CONTROL.sustain,0);p.seconds(2);expect(p.k.syn_stat(0)).toBe(0);
 const b=synth({...SINE,...at(-64,0)});b.k.syn_note_on(1,69,1);b.seconds(.2);b.k.syn_control(CONTROL.bend,2);b.seconds(.3);expect(cents(pitchHz(b.seconds(.3)[0]),440*2**(2/12))).toBeLessThan(3);
});

test('the waves are band-limited by default, and raw mode keeps the original\'s aliasing',()=>{
 // a naive saw with all 63 harmonics in wave 0
 const saw=Float32Array.from(WAVES);for(let n=0;n<CYCLE;n++)saw[n]=2*n/CYCLE-1;
 const f=2630,note=69+12*Math.log2(f/440),N=4800;
 const alias=x=>{const c=f/10;let h=0,a=0;for(let k=1;k<N/2;k++){let re=0,im=0;for(let n=0;n<N;n++){const w=2*Math.PI*k*n/N;re+=x[n]*Math.cos(w);im-=x[n]*Math.sin(w);}const p=re*re+im*im;if(k%c===0)h+=p;else a+=p;}return 10*Math.log10(a/h);};
 const run=raw=>alias(hold({...SINE,waveA:0,...at(-64,0),raw},note,.1,{waves:saw})[0]);
 const clean=run(0),rough=run(1);
 expect(clean).toBeLessThan(-40);expect(rough).toBeGreaterThan(clean+8);
});

test('every built-in sound stays finite and below full scale under extreme playing',()=>{
 for(const preset of PRESETS){
  const s=synth({...preset.values,resonance:90,volume:99});for(let i=0;i<10;i++)s.k.syn_note_on(i+1,24+i*6,1);
  s.k.syn_control(CONTROL.pressure,1);s.k.syn_control(CONTROL.mod,1);s.k.syn_control(CONTROL.bend,24);
  const [l,r]=s.seconds(1.5);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});

const BANKS='banks/prophet-vs';
const local=fs.existsSync(BANKS)?fs.readdirSync(BANKS):[];
const pairs=[['factory-programs.syx','factory-user-waves.syx'],['rom-cart-programs.syx','rom-cart-user-waves.syx']].filter(([a,b])=>local.includes(a)&&local.includes(b));
test.skipIf(!pairs.length||!local.includes('waves-000-063.wav'))('every program of your local banks plays finite and audible with your wave sets',()=>{
 const file=name=>fs.readFileSync(path.join(BANKS,name));
 const wavs=[{bytes:file('waves-000-063.wav'),first:0},{bytes:file('waves-064-127.wav'),first:64}];
 let count=0,quiet=[];
 for(const [programs,dump] of pairs){
  const waves=composeWaves({wavs,userDump:file(dump)});
  for(const p of parseVsSysex(file(programs))){
   const s=synth(engineValues(p.raw),{waves});[48,55,60,64].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
   const [l]=s.seconds(1.5);count++;
   expect(l.every(Number.isFinite),`${p.name}`).toBe(true);expect(peak(l)).toBeLessThanOrEqual(1);
   if(rms(l)<1e-4)quiet.push(p.name);
  }
 }
 expect(count).toBe(200);
 expect(quiet.length,quiet.join(', ')).toBeLessThanOrEqual(15);
});
