// @vitest-environment node
// The sounds approximated from printed patch books and sheets: names of their own, a place in
// the synth's own categories, and every one playable.
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak} from './offline';
import * as jupiter from '../jupiter/params';
import * as obxa from '../obxa/params';
import * as prophet from '../prophet/params';
import * as juno from '../juno/params';
import {PRESETS as JUPITER,CATEGORIES as JUPITER_CATEGORIES} from '../jupiter/presets';
import {PRESETS as OBXA,CATEGORIES as OBXA_CATEGORIES} from '../obxa/presets';
import {PRESETS as PROPHET,CATEGORIES as PROPHET_CATEGORIES} from '../prophet/presets';
import {PRESETS as JUNO,CATEGORIES as JUNO_CATEGORIES} from '../juno/presets';
import {SHEET_SOUNDS} from '../jupiter/sheetPresets';
import {BOOK_SOUNDS} from '../obxa/bookPresets';
import {SHEET_SOUNDS as P5_SHEETS} from '../prophet/sheetPresets';
import {BOOK_SOUNDS as J60_BOOK} from '../juno/bookPresets';
import {JUNO_NAMES} from '../juno/sysex';
import {JP8_NAMES} from '../jupiter/names';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const SETS=[
 {id:'Pluto 8 sheets',model:MODELS.jupiter8,params:jupiter,presets:JUPITER,categories:JUPITER_CATEGORIES,derived:SHEET_SOUNDS,count:64},
 {id:'Oberon Xa book',model:MODELS.obxa,params:obxa,presets:OBXA,categories:OBXA_CATEGORIES,derived:BOOK_SOUNDS,count:96},
 {id:'Analog 106 book',model:MODELS.juno,params:juno,presets:JUNO,categories:JUNO_CATEGORIES,derived:J60_BOOK,count:99},
 {id:'Oracle 5 sheets',model:MODELS.prophet5,params:prophet,presets:PROPHET,categories:PROPHET_CATEGORIES,derived:P5_SHEETS,count:38},
];

test('built-in sounds never reuse a factory patch name of the original (where the names are on file)',()=>{
 for(const [presets,names] of [[JUPITER,JP8_NAMES],[JUNO,JUNO_NAMES]]){
  const factory=new Set(names.map(n=>n.toLowerCase()));
  for(const p of presets)expect(factory.has(p.name.toLowerCase()),p.name).toBe(false);
 }
});

for(const set of SETS){
 test(`${set.id}: unique names, the synth's own categories`,()=>{
  expect(set.derived).toHaveLength(set.count);
  expect(new Set(set.presets.map(p=>p.name)).size).toBe(set.presets.length);
  for(const s of set.derived)expect(set.categories.map(c=>c.id)).toContain(s.category);
 });
 test(`${set.id}: every sound plays finite, audible and below full scale`,()=>{
  for(const p of set.presets.slice(-set.count)){
   const s=createOfflineSynth(module,{model:set.model,params:set.params.toPairs(p.values)});
   [48,55,60,64].forEach((n,k)=>s.k.syn_note_on(k+1,n,.8));
   const [l,r]=s.seconds(1.2);[1,2,3,4].forEach(k=>s.k.syn_note_off(k));const [tl]=s.seconds(.6);
   expect([l,r,tl].every(a=>a.every(Number.isFinite)),p.name).toBe(true);
   expect(Math.max(peak(l),peak(r),peak(tl)),p.name).toBeLessThan(1);
   expect(Math.max(rms(l),rms(tl)),p.name).toBeGreaterThan(1e-4);
  }
 });
}
