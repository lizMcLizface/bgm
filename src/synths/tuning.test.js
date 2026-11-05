import {describe,expect,it} from 'vitest';
import {DEFAULT,PRESETS,sanitize,tunedNote,chordRoot,chordOffsets,tuning} from './tuning';

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
 it('finds the root of a chord whatever the inversion',()=>{
  expect(chordRoot([60,64,67])).toBe(60);expect(chordRoot([64,67,72])).toBe(72);expect(chordRoot([67,72,76])).toBe(72);   // C major, three voicings
  expect(chordRoot([57,60,64])).toBe(57);expect(chordRoot([60,64,67,69])).toBe(60);                                         // A minor, C6 over C
  expect(chordRoot([62,65,69,72])).toBe(62);expect(chordRoot([48,52,55,58])).toBe(48);                                      // Dm7, C7
 });
 it('tunes a major triad just: 5/4 and 3/2 above the root',()=>{
  const o=chordOffsets([60,64,67]);
  expect(o.get(60)).toBe(0);expect(o.get(64)).toBeCloseTo(-13.69,2);expect(o.get(67)).toBeCloseTo(1.96,2);
  const minor=chordOffsets([57,60,64]);expect(minor.get(60)).toBeCloseTo(15.64,2);   // 6/5 above A
  expect(chordOffsets([60,72])).toBeNull();expect(chordOffsets([60])).toBeNull();     // no chord, nothing to correct
  // the root keeps the scale's own offset and the chord follows it
  const scaled={...DEFAULT,cents:PRESETS['Pythagorean']};expect(chordOffsets([62,66,69],scaled).get(66)).toBeCloseTo(3.91-13.69,2);
 });
 it('only changes a key when auto-tune is on',()=>{
  const was=tuning.get();
  try{
   tuning.set({auto:0});expect(tuning.note(64,[60,64,67])).toBe(64);
   tuning.set({auto:1});expect(tuning.note(64,[60,64,67])).toBeCloseTo(64-.1369,4);expect(tuning.note(64)).toBe(64);
  }finally{tuning.set(was);}
 });
 it('reports what the chord is doing to each sounding pitch class, and stops when it does not',()=>{
  const was=tuning.get(),seen=[],off=tuning.subscribeLive(m=>seen.push(m));
  try{
   tuning.set({auto:1});tuning.setHeld([60,64,67]);
   const m=tuning.liveCents();expect(m.get(0)).toBe(0);expect(m.get(4)).toBeCloseTo(-13.69,2);expect(m.get(7)).toBeCloseTo(1.96,2);expect(m.has(2)).toBe(false);
   tuning.setHeld([60]);expect(tuning.liveCents()).toBeNull();       // one key is no chord
   tuning.setHeld([60,64,67]);tuning.set({auto:0});expect(tuning.liveCents()).toBeNull();
   expect(seen.length).toBe(4);
  }finally{off();tuning.setHeld([]);tuning.set(was);}
 });
});
