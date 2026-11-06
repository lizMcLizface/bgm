import {describe,it,expect} from 'vitest';
import {followPlayback} from './followPlayback';

describe('playback follow',()=>{
 it('advances four visible pads only after the playhead leaves the window',()=>{
  const part={startBar:2,bars:4};
  expect(followPlayback(32,47,part,16,1)).toBe(32);
  expect(followPlayback(32,48,part,16,1)).toBe(36);
  expect(followPlayback(36,51,part,16,1)).toBe(36);
  expect(followPlayback(36,52,part,16,1)).toBe(40);
  expect(followPlayback(40,32,part,16,1)).toBe(32);
 });
 it('uses the visible resolution and clamps at the end of the progression',()=>{
  const part={startBar:0,bars:7};
  expect(followPlayback(0,63,part,16,4)).toBe(0);
  expect(followPlayback(0,64,part,16,4)).toBe(16);
  expect(followPlayback(32,96,part,16,4)).toBe(48);
  expect(followPlayback(48,0,part,16,4)).toBe(0);
 });
});
