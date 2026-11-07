import {describe,it,expect} from 'vitest';
import {DRUM_LANES,drumLaneLabel,matchesDrumLane} from './drumLanes';
import {editDrum} from './gridTiming';

describe('common drum lanes',()=>{
 it('keeps machine-specific hits separate while retaining a common fallback',()=>{
  const base={steps:[{hits:[{drum:6,velocity:.7,duration:1}]}]};
  const withTom=editDrum(base,0,1,6,'mt');
  expect(withTom.steps[0].hits).toEqual([{drum:6,velocity:.7,duration:1},{drum:6,track:'mt',velocity:.8,duration:1}]);
  expect(matchesDrumLane(withTom.steps[0].hits[1],DRUM_LANES[6])).toBe(false);
  expect(editDrum(withTom,0,1,6,'mt')).toEqual(base);
 });
 it('labels common lanes for the active kit while preserving their indices',()=>{
  expect(drumLaneLabel(DRUM_LANES[0],{synth:'tr808'},'felt')).toBe('Bass drum');
  expect(drumLaneLabel(DRUM_LANES[0],{synth:'kit'},'hand')).toBe('Low conga');
  expect(DRUM_LANES.find(l=>l.track==='tb')).toMatchObject({drum:2});
 });
});
