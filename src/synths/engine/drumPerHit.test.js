// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms} from './offline';
import {KITS,drumParams} from '../drums/kits';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const synth=kit=>{const params=drumParams(kit);return createOfflineSynth(module,{model:kit.model,params:params.toPairs(params.sanitize({reverbMix:0,chorusMix:0}))});};
const peak=c=>c.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
// the pitch of a decaying tone from its zero crossings over the first stretch
const crossings=(c,n)=>{let z=0;for(let i=1;i<n;i++)if(c[i-1]<=0&&c[i]>0)z++;return z;};

test('a per-hit accent makes that hit louder, once, and the next hit is plain again',()=>{
 const s=synth(KITS.tr808);
 s.k.syn_pressure(0*4+1,1);s.k.syn_note_on(800,36,1);const accented=peak(s.seconds(.4)[0]);
 s.seconds(3);
 s.k.syn_note_on(800,36,1);const plain=peak(s.seconds(.4)[0]);
 const fresh=synth(KITS.tr808);fresh.k.syn_note_on(800,36,1);
 expect(accented).toBeGreaterThan(plain*1.15);
 expect(plain).toBeCloseTo(peak(fresh.seconds(.4)[0]),3); // the override did not stick to the next hit
});

test('a per-hit tune offset moves the pitch for that hit only',()=>{
 const s=synth(KITS.tr808);
 const pitch=()=>{const c=s.seconds(.3)[0];return crossings(c,Math.round(48000*.12));};
 s.k.syn_note_on(802,38,1);const base=pitch();
 s.k.syn_pressure(2*4+2,1);s.k.syn_note_on(802,38,1);const up=pitch();
 s.k.syn_pressure(2*4+2,-1);s.k.syn_note_on(802,38,1);const down=pitch();
 s.k.syn_note_on(802,38,1);const after=pitch();
 expect(up).toBeGreaterThan(base);expect(down).toBeLessThan(base);expect(after).toBe(base);
});

test('a per-hit decay offset lengthens the hit',()=>{
 const s=synth(KITS.tr808);
 const tail=()=>{const c=s.seconds(1)[0];return rms(c.subarray(Math.round(48000*.25),Math.round(48000*.5)));};
 s.k.syn_note_on(802,38,1);const base=tail();
 s.k.syn_pressure(2*4+3,1);s.k.syn_note_on(802,38,1);const long=tail();
 expect(long).toBeGreaterThan(base*1.5);
});

test('the 707 plays all thirteen voices, including its cowbell and tambourine',()=>{
 const kit=KITS.tr707;
 expect(kit.model).toBe(MODELS.tr707);expect(kit.tracks).toHaveLength(13);
 kit.tracks.forEach(([key],t)=>{
  const s=synth(kit);s.k.syn_note_on(800+t,36+t,1);const c=s.seconds(1);
  const level=Math.max(rms(c[0].subarray(0,12000)),rms(c[1].subarray(0,12000)));
  expect(level,key).toBeGreaterThan(0.002);
  expect(peak(c[0]),key).toBeLessThan(1.5);
  expect(c[0].every(Number.isFinite),key).toBe(true);
 });
 const s=synth(kit);s.k.syn_note_on(815,36+15,1);expect(peak(s.seconds(.3)[0])).toBe(0); // no voice past the thirteenth
});
