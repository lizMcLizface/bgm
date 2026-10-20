// @vitest-environment node
import fs from 'node:fs';
import {parseJunoSysex,bankFromSysex,junoValues,patchCode,JUNO_NAMES,CALIBRATION,FACTORY_FINGERPRINTS,fingerprint,factoryName} from './sysex';
import {sanitize,toPairs,BY_KEY} from './params';
import {createOfflineSynth,MODELS,rms,peak} from '../engine/offline';

// One patch dump: F0 41 30 0n pp <16 sliders> <buttons> <switches> F7
const message=(patch,sliders,buttons,switches,kind=0x30)=>[0xF0,0x41,kind,0x00,patch,...sliders,buttons,switches,0xF7];
const SLIDERS=[20,49,0,102,0,35,13,58,0,86,108,3,49,45,32,0];

test('patch codes and factory names cover A11–B88',()=>{
 expect(JUNO_NAMES).toHaveLength(128);
 expect([0,7,8,63,64,127].map(patchCode)).toEqual(['A11','A18','A21','A88','B11','B88']);
});

test('factory patches are recognised by a content fingerprint (FNV-1a over the 18 data bytes)',()=>{
 expect(fingerprint(SLIDERS,0x12,0x10)).toBe('403fa78d');                 // reference value from an independent implementation
 expect(FACTORY_FINGERPRINTS).toHaveLength(128);expect(new Set(FACTORY_FINGERPRINTS).size).toBe(128);
 expect(factoryName(SLIDERS,0x12,0x10)).toBeNull();
});

test('slider bytes decode in panel order with the published end points',()=>{
 const v=junoValues([127,127,0,0,0,0,0,0,0,0,127,0,127,0,127,0],0x02,0x18);
 expect(v.lfoRate).toBeCloseTo(CALIBRATION.lfoRate[1]);expect(v.lfoDelay).toBeCloseTo(3);
 expect(v.attack).toBeCloseTo(.0015);expect(v.decay).toBeCloseTo(12);expect(v.release).toBeCloseTo(12);
 const low=junoValues(Array(16).fill(0),0x02,0x18);
 expect(low.lfoRate).toBeCloseTo(.1);expect(low.attack).toBeCloseTo(.0015);expect(low.level).toBeGreaterThan(0);
 const s=junoValues(SLIDERS,0,0);expect(s.pwm).toBeCloseTo(102/127);expect(s.res).toBeCloseTo(13/127);expect(s.kybd).toBeCloseTo(86/127);expect(s.sustain).toBeCloseTo(45/127);
});

test('button and switch bits decode range, waveforms, chorus, PWM source, polarity, VCA mode and HPF',()=>{
 const b=(buttons,switches)=>junoValues(SLIDERS,buttons,switches);
 expect([b(0x01,0).range,b(0x02,0).range,b(0x04,0).range]).toEqual([0,1,2]);
 expect([b(0x08,0).pulse,b(0x08,0).saw,b(0x10,0).saw]).toEqual([1,0,1]);
 expect([b(0x20,0).chorus,b(0x40,0).chorus,b(0x00,0).chorus,b(0x60,0).chorus]).toEqual([0,1,2,0]);
 const sw=b(0x02,0x07);expect([sw.pwmSource,sw.envPolarity,sw.vcaMode]).toEqual([1,1,1]);
 expect([0x18,0x08,0x10,0x00].map(x=>b(0x02,x).hpf)).toEqual([0,2,1,3]);
 // imported patches play as the hardware: no velocity routes, dry
 expect([sw.velVcf,sw.velVca,sw.reverbMix]).toEqual([0,0,0]);
});

test('a file of dumps parses into numbered slots, skipping other messages; manual dumps fill the next slot',()=>{
 const bytes=new Uint8Array([
  ...message(0,SLIDERS,0x12,0x10),
  0xF0,0x43,0x10,0x01,0xF7,                    // someone else's SysEx
  ...message(64,SLIDERS,0x0A,0x18),
  ...message(0,SLIDERS,0x0A,0x18,0x31),        // manual (no number) → slot 65
 ]);
 const patches=parseJunoSysex(bytes);expect(patches.map(p=>p.code)).toEqual(['A11','B11','Manual']);
 const bank=bankFromSysex(bytes);
 expect(bank.filter(Boolean).map(p=>p.code)).toEqual(['A11','B11','B12']);
 expect(bank.filter(Boolean).every(p=>p.name==='')).toBe(true);   // not factory patches: no names
 expect(bank[1]).toBeNull();
});

test('any bank of 128 random patches sanitizes to valid parameters and renders finite, bounded audio',()=>{
 let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed;};
 const bytes=new Uint8Array(Array.from({length:128},(_,i)=>message(i,Array.from({length:16},()=>rnd()%128),rnd()%128,rnd()%32)).flat());
 const bank=bankFromSysex(bytes);expect(bank.every(Boolean)).toBe(true);
 const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
 for(const patch of bank.filter((_,i)=>i%8===0)){
  const values=sanitize(patch.values);
  for(const [key,value] of Object.entries(values)){const p=BY_KEY[key];expect(value).toBeGreaterThanOrEqual(p.min);expect(value).toBeLessThanOrEqual(p.max);}
  const s=createOfflineSynth(module,{model:MODELS.juno,params:toPairs(values)});[48,60,64,67].forEach((n,i)=>s.k.syn_note_on(i+1,n,.8));
  const [l,r]=s.seconds(.6);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
 }
});

test('a filter left at full resonance sings from the first moment of the note',()=>{
 const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
 // no oscillators, resonance full, a 40 ms envelope ping
 const values=sanitize(junoValues([59,0,0,0,0,40,127,45,0,89,127,0,19,0,22,0],0x02,0x09));
 const s=createOfflineSynth(module,{model:MODELS.juno,params:toPairs(values)});s.k.syn_note_on(1,60,.8);
 expect(rms(s.seconds(.06)[0])).toBeGreaterThan(.01);
});
