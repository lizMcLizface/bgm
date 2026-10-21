// @vitest-environment node
import fs from 'node:fs';
import {BEATS,ARRANGEMENTS,KITS,beatPattern,arrangementBank,validPattern,patternCommands,drumParams} from './kits';
import {chainCommands} from '../seq/bank';
import {createOfflineSynth,peak} from '../engine/offline';

test('every recipe has sixteen legal cells per row and a unique permanent ID',()=>{
 expect(BEATS.length).toBeGreaterThanOrEqual(30);expect(ARRANGEMENTS.length).toBeGreaterThanOrEqual(10);
 for(const list of [BEATS,ARRANGEMENTS])expect(new Set(list.map(b=>b.id)).size).toBe(list.length);
 for(const b of [...BEATS,...ARRANGEMENTS.flatMap(a=>a.stages)])for(const r of Object.values(b.rows))expect(r).toMatch(/^[.xf]{16}$/);
 for(const a of ARRANGEMENTS){
  expect([4,8,16]).toContain(a.chain.length);
  expect(a.chain.every(n=>Number.isInteger(n)&&a.stages[n])).toBe(true);
  expect(new Set(a.chain.map(n=>JSON.stringify(a.stages[n].rows))).size).toBeGreaterThanOrEqual(3);
 }
});

test('all loops and every stage adapt to all three machines without empty or invalid patterns',()=>{
 for(const kit of Object.values(KITS)){
  for(const b of [...BEATS,...ARRANGEMENTS.flatMap(a=>a.stages)]){
   const p=beatPattern(kit,b);expect(validPattern(kit)(p)).toBe(true);
   expect(p.slice(0,-1).flat().some(Boolean),`${kit.id}: ${b.name}`).toBe(true);
  }
  // Clap backbeats and congas must remain present on a 606.
  const four=beatPattern(kit,BEATS[0]),backbeat=kit.tracks.findIndex(t=>t[0]===(kit.id==='tr606'?'sd':'cp'));
  expect(four[backbeat][4]).toBe(1);expect(four[backbeat][12]).toBe(1);
 }
 const flam=beatPattern(KITS.tr606,BEATS.find(b=>b.id==='flam-parade'));expect(flam[1][4]).toBe(2);
});

test('real drum kernels play a complete 16-bar arrangement, including the loop back to the intro',()=>{
 const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
 for(const kit of Object.values(KITS)){
  const recipe=ARRANGEMENTS[0],bank=arrangementBank(kit,recipe),params=drumParams(kit);
  const v=createOfflineSynth(module,{sampleRate:48000,model:kit.model,params:params.toPairs({...params.defaultValues(),tempo:240,swing:.5,reverbMix:0})});
  for(const cmd of [...bank.patterns.flatMap((p,i)=>patternCommands(kit,i,p)),...chainCommands(bank),[6,0,0],[0,1,0]])v.seq(...cmd);
  // At 240 bpm a sixteen-step bar is exactly one second. Inspect inside each bar,
  // avoiding the deliberately delayed (50 ms) output boundary.
  for(const p of [...bank.chain,bank.chain[0]]){
   const [l,r]=v.seconds(.5,128);expect(v.k.syn_stat(5)).toBe(p);
   expect(peak(l)).toBeGreaterThan(.001);expect(peak(l)).toBeLessThanOrEqual(1);
   expect(l.every(Number.isFinite)&&r.every(Number.isFinite)).toBe(true);v.seconds(.5,128);
  }
 }
});
