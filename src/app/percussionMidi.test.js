import {midiDrum} from './Tracks';
test('standard hand-percussion notes address the palette while old mappings stay compatible',()=>{
 for(const voice of ['felt','crisp','tr808','hand']){
  expect([60,61,62,63,64,75,76,77,54].map(n=>midiDrum(n,voice))).toEqual([6,6,1,6,0,10,10,3,4]);
  expect(midiDrum(35,voice)).toBe(0);expect(midiDrum(38,voice)).toBe(1);expect(midiDrum(42,voice)).toBe(4);expect(midiDrum(1,voice)).toBeUndefined();
 }
 expect(midiDrum(46,'felt')).toBe(4);expect(midiDrum(46,'hand')).toBe(5);expect(midiDrum(46,'tr808')).toBe(5);expect(midiDrum(69,'hand')).toBe(8);expect(midiDrum(69,'felt')).toBe(2);
});
