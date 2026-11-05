import {describe,expect,it} from 'vitest';
import {DEFAULT,PRESETS,sanitize,tunedNote} from './tuning';

describe('tuning',()=>{
 it('leaves every key alone by default',()=>{for(let n=0;n<128;n++)expect(tunedNote(n,DEFAULT)).toBe(n);});
 it('moves each degree by its own offset from the tonic',()=>{
  const just={...DEFAULT,cents:PRESETS['Just intonation']};
  expect(tunedNote(64,just)).toBeCloseTo(64-.1369,4); // E above a C tonic
  expect(tunedNote(76,just)).toBeCloseTo(76-.1369,4); // the same in the next octave
  const inD={...just,tonic:2};
  expect(tunedNote(66,inD)).toBeCloseTo(66-.1369,4); // F♯ is the major third above D
  expect(tunedNote(64,inD)).toBeCloseTo(64+.0391,4); // E is now the second degree
 });
 it('stretches the octave about middle C',()=>{
  const wide={...DEFAULT,octave:2.01};
  expect(tunedNote(60,wide)).toBe(60);
  const up=tunedNote(72,wide)-72;
  expect(up).toBeCloseTo(12*Math.log2(2.01)-12,6);
  expect(tunedNote(48,wide)-48).toBeCloseTo(-up,6);
 });
 it('follows the A4 reference and the shift',()=>{
  expect(tunedNote(69,{...DEFAULT,a4:442})).toBeCloseTo(69+12*Math.log2(442/440),6);
  expect(tunedNote(69,{...DEFAULT,shift:50})).toBeCloseTo(69.5,6);
 });
 it('keeps every preset within a quarter-tone of equal temperament',()=>{
  for(const cents of Object.values(PRESETS)){expect(cents).toHaveLength(12);for(const c of cents)expect(Math.abs(c)).toBeLessThan(50);}
 });
 it('repairs a damaged tuning',()=>{
  const t=sanitize({cents:[1,'x',500],tonic:99,octave:'big',a4:0,shift:NaN});
  expect(t.cents).toHaveLength(12);expect(t.cents[0]).toBe(1);expect(t.cents[1]).toBe(0);expect(t.cents[2]).toBe(100);
  expect(t.tonic).toBe(11);expect(t.octave).toBe(2);expect(t.a4).toBe(400);expect(t.shift).toBe(0);
 });
});
