import {pianoPatch} from './pianoPatches';
import {soundFrom} from '../soundGenV3';
import {sanitizePreset} from '../editor/presetStore';
import {prepareSound} from './prepareSound';
vi.mock('./loudness',()=>({levelPreset:vi.fn(async preset=>preset)}));
const withoutResonance=({pianoResonance,...p})=>p;
test('named keys opt in without changing their envelope, sustain or old oscillator recipes',()=>{
 const original={gainRelease:2};
 for(const name of ['Felt Piano','Soft Keys','Tine Keys','FM Rhodes']){
  const before=pianoPatch(name,original,'latest',{resonance:false}),after=pianoPatch(name,original);
  expect(after.pianoResonance).toBeGreaterThan(0);expect(withoutResonance(after)).toEqual(withoutResonance(before));
  expect(sanitizePreset(after)).toEqual(after);expect(after.pianoSustain).toBe(.28);expect(pianoPatch(name,original,'legacy')).toBe(original);
 }
 expect(pianoPatch('Dark Drone',original)).toBe(original);
});
test('generated key resonance preserves recipe, saved metadata and independent preparation caches',async()=>{
 for(const role of ['lead','counter','pad','bass'])for(const seed of [1,2,42]){
  const info={role,seed,version:3,kind:'keys',profile:'keys',gate:2,register:60};
  const before=soundFrom(info,'latest',{pianoResonance:false}),after=soundFrom(info);
  expect(withoutResonance(after.preset)).toEqual(withoutResonance(before.preset));
  expect(after.preset.pianoResonance??0)[role==='bass'?'toBe':'toBeGreaterThan'](0);
  expect(soundFrom(info,'legacy')).toEqual(soundFrom(info,'legacy',{pianoResonance:false}));
 }
 const info={role:'pad',seed:42,version:3,kind:'keys',profile:'keys'};
 const before=prepareSound(info,'latest',{pianoResonance:false}),after=prepareSound(info);
 expect(before).not.toBe(after);expect(prepareSound(info)).toBe(after);
 const [a,b]=await Promise.all([before,after]);expect(a.info).toEqual(b.info);expect(withoutResonance(a.preset)).toEqual(withoutResonance(b.preset));
});
