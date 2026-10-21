// @vitest-environment node
// Generated suites and the picker's "New" generators: every sound plays, the suites have names
// of their own, and fresh draws are reproducible from their seed.
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak} from './offline';
import * as dx7 from '../dx7/params';
import {PRESETS as DX7,CATEGORIES as DX7_CATEGORIES,generate as dx7Generate,GENERATES as DX7_GENERATES} from '../dx7/presets';
import {SUITE} from '../dx7/suitePresets';
import {generateVoice} from '../dx7/generate';
import * as vs from '../vs/params';
import {PRESETS as VS,CATEGORIES as VS_CATEGORIES,generate as vsGenerate,GENERATES as VS_GENERATES} from '../vs/presets';
import {SUITE as VS_SUITE} from '../vs/suitePresets';
import {generateProgram} from '../vs/generate';
import {builtinWaves} from '../vs/waves';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const WAVES=builtinWaves();
const play=(model,params,values,notes=[48,55,60,64])=>{
 const s=createOfflineSynth(module,{model,params:params.toPairs(values),...(model===MODELS.vs?{waves:WAVES}:{})});
 notes.forEach((n,k)=>s.k.syn_note_on(k+1,n,.8));const [l,r]=s.seconds(1.2);notes.forEach((_,k)=>s.k.syn_note_off(k+1));const [t]=s.seconds(.6);
 return {finite:[l,r,t].every(a=>a.every(Number.isFinite)),peak:Math.max(peak(l),peak(r),peak(t)),level:Math.max(rms(l),rms(t))};
};

test('the FM7 suite: 128 voices with unique names in the synth\'s categories, all playable',()=>{
 expect(SUITE).toHaveLength(128);
 expect(new Set(DX7.map(p=>p.name)).size).toBe(DX7.length);
 const ids=DX7_CATEGORIES.map(c=>c.id);
 for(const p of DX7.slice(-128)){
  expect(ids).toContain(p.category);
  const m=play(MODELS.dx7,dx7,p.values);
  expect(m.finite,p.name).toBe(true);expect(m.peak,p.name).toBeLessThan(1);expect(m.level,p.name).toBeGreaterThan(1e-4);
 }
});

test('FM7 "New" draws are reproducible and play in every category',()=>{
 expect(generateVoice('keys',42)).toEqual(generateVoice('keys',42));
 expect(generateVoice('keys',42)).not.toEqual(generateVoice('keys',43));
 for(const c of DX7_GENERATES){
  let audible=0;
  for(let seed=1;seed<=4;seed++){
   const p=dx7Generate(c,seed*7919);expect(p.category).toBe(c);
   const m=play(MODELS.dx7,dx7,p.values);expect(m.finite,`${c} ${seed}`).toBe(true);
   if(m.level>1e-4)audible++;
  }
  expect(audible,c).toBeGreaterThanOrEqual(3);
 }
});

test('the VectorVS suite: 100 programs on the built-in waves, unique names, all playable',()=>{
 expect(VS_SUITE).toHaveLength(100);
 expect(new Set(VS.map(p=>p.name)).size).toBe(VS.length);
 const ids=VS_CATEGORIES.map(c=>c.id);
 for(const p of VS.slice(-100)){
  expect(ids).toContain(p.category);expect(p.builtinWaves).toBe(true);
  const m=play(MODELS.vs,vs,p.values);
  expect(m.finite,p.name).toBe(true);expect(m.peak,p.name).toBeLessThan(1);expect(m.level,p.name).toBeGreaterThan(1e-4);
 }
});

test('VectorVS "New" draws are reproducible and play in every category',()=>{
 expect(generateProgram('pads',7)).toEqual(generateProgram('pads',7));
 for(const c of VS_GENERATES){
  let audible=0;
  for(let seed=1;seed<=4;seed++){
   const p=vsGenerate(c,seed*7919);expect(p.category).toBe(c);
   const m=play(MODELS.vs,vs,p.values);expect(m.finite,`${c} ${seed}`).toBe(true);
   if(m.level>1e-4)audible++;
  }
  expect(audible,c).toBeGreaterThanOrEqual(3);
 }
});

test('VectorVS draws tune their oscillators as a set, with the lowest on the played note or an octave of it',()=>{
 for(const family of ['bass','pads','lead','vector','keys'])for(let seed=1;seed<=40;seed++){
  const p=generateProgram(family,seed),pitches=['A','B','C','D'].map(x=>p['coarse'+x]+p['fine'+x]/99);
  const low=Math.min(...pitches);expect(Math.abs(low-12*Math.round(low/12))).toBeLessThan(.3);
 }
});
