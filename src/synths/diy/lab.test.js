import {describe,expect,it} from 'vitest';
import {LAB,labFx,masterSettings} from './lab';

describe('lab effects',()=>{
 const values=()=>LAB.defaultValues();
 it('starts with every effect silent and the master filter out',()=>{
  const v=values(),fx=labFx(v);
  expect(fx.tapeWow+fx.tapeFlutter+fx.tapeDrive).toBe(0);
  expect(fx.shimmerMix).toBe(0);expect(fx.freezeMix).toBe(0);expect(fx.freezeHold).toBe(false);
  expect(masterSettings(v).on).toBe(false);
 });
 it('names the shimmer interval the way the effect expects it',()=>{
  const names=[0,1,2,3].map(i=>labFx({...values(),shimmerInterval:i}).shimmerInterval);
  expect(names).toEqual(['fifth','octave','twelfth','twoOctaves']);
 });
 it('silences an effect that is switched off, keeping its settings',()=>{
  const v={...values(),tapeWow:.5,tapeDrive:.4,shimmerMix:.6,freezeMix:.7,tapeOn:0,shimmerOn:0,freezeOn:0};
  const off=labFx(v);
  expect(off.tapeWow+off.tapeFlutter+off.tapeDrive).toBe(0);expect(off.shimmerMix).toBe(0);expect(off.freezeMix).toBe(0);
  const on=labFx({...v,tapeOn:1,shimmerOn:1,freezeOn:1});
  expect(on.tapeWow).toBe(.5);expect(on.shimmerMix).toBe(.6);expect(on.freezeMix).toBe(.7);
 });
 it('maps the filter type onto a Web Audio biquad type',()=>{
  const types=[0,1,2,3,4,5].map(i=>masterSettings({...values(),masterType:i}).type);
  expect(types).toEqual(['lowpass','highpass','bandpass','notch','lowshelf','highshelf']);
 });
 it('keeps every value of every control inside its range by default',()=>{
  for(const p of LAB.PARAMS){expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 });
});
