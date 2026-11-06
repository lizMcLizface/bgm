import {describe,it,expect} from 'vitest';
import {makeKey} from '../../seq/harmony';
import {noteStepEvents} from '../../seq/notes';
import {gridResolutions,soundingNotes,editPitch,editDrum} from './gridTiming';

const key=makeKey('Major-1',0);
const makePattern=steps=>({mode:'poly',follow:'scale',length:steps.length,steps});

describe('grid timing',()=>{
 it('offers views no coarser than the meter unit',()=>{
  expect(gridResolutions('4/4')).toEqual([{label:'1/4',steps:4},{label:'1/8',steps:2},{label:'1/16',steps:1}]);
  expect(gridResolutions('8/4')[0].label).toBe('1/4');
  expect(gridResolutions('7/8')).toEqual([{label:'1/8',steps:4},{label:'1/16',steps:2},{label:'1/32',steps:1}]);
 });
 it('replaces only the matching pitch, splits sustained notes and preserves other pitches',()=>{
  const pattern=makePattern([{n:[{d:0,len:8},{d:2,len:8}]},null,null,{n:[{d:0,len:2}]},null,null,null,null]);
  const edited=editPitch(pattern,key,2,6,60);
  expect(soundingNotes(edited,0,8,key).filter(n=>n.midi===60)).toEqual([
   {midi:60,start:0,end:2},{midi:60,start:2,end:6},{midi:60,start:6,end:8},
  ]);
  expect(soundingNotes(edited,0,8,key).filter(n=>n.midi===64)).toEqual([{midi:64,start:0,end:8}]);
  expect(pattern.steps[0].n[0].len).toBe(8);
  expect(noteStepEvents(edited,0,{time:0,stepSec:.1,key}).map(e=>[e.note,e.duration])).toEqual([[64,.78],[60,.18000000000000002]]);
  const removed=editPitch(edited,key,2,6,60);
  expect(soundingNotes(removed,2,6,key).map(n=>n.midi)).toEqual([64]);
 });
 it('replaces and removes hits only in the selected drum lane',()=>{
  const pattern=makePattern([{hits:[{drum:0}]},{hits:[{drum:0},{drum:1}]},null,null]);
  const edited=editDrum(pattern,0,4,0);
  expect(edited.steps[0].hits).toEqual([{drum:0,velocity:.8,duration:1}]);
  expect(edited.steps[1].hits).toEqual([{drum:1}]);
  expect(editDrum(edited,0,4,0).steps[0]).toBeNull();
 });
 it('does not shorten existing legacy holds when inserting an overlapping pitch',()=>{
  const pattern=makePattern([{n:[{d:2}],len:8},null,null,null,null,null,null,null]);
  const edited=editPitch(pattern,key,2,6,60);
  const event=noteStepEvents(edited,0,{time:0,stepSec:.1,key})[0];
  expect(event.note).toBe(64);
  expect(event.duration).toBeCloseTo(.78);
 });
 it('replaces an exact existing note rather than toggling it off when dragging',()=>{
  const pattern=makePattern([{n:[{d:0,len:4},{d:2,len:4}]},null,null,null]);
  const edited=editPitch(pattern,key,0,4,60,{replace:true});
  expect(soundingNotes(edited,0,4,key).map(n=>n.midi).sort()).toEqual([60,64]);
  expect(soundingNotes(edited,0,4,key).find(n=>n.midi===60).end).toBe(4);
 });
});
