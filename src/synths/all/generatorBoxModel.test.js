import {describe,it,expect} from 'vitest';
import {SECTIONS,optionsOf,knobText,knobPosition,knobValue,INITIAL_VALUES,MODES,FAMILIES,seqValues,seqPatch} from './generatorBoxModel';

const SEQ={tonic:7,mode:'Major-2',progression:1,barsPerChord:2,bpm:100,meter:'3/4'};

describe('generator box model',()=>{
 it('gives every section four knob slots',()=>{for(const s of SECTIONS)expect(s.knobs).toHaveLength(4);});
 it('makes the mode list follow the scale family',()=>{
  const mode=SECTIONS[0].knobs[2];
  expect(optionsOf(mode,{family:1})).toEqual(MODES[FAMILIES[1]]);
 });
 it('round-trips a choice through its knob position',()=>{
  const k=SECTIONS[0].knobs[0];
  const v=knobValue(k,INITIAL_VALUES,knobPosition(k,{...INITIAL_VALUES,...seqValues(SEQ)}));
  expect(v).toBe(7);
 });
 it('reads a range as a number and a toggle as ON/OFF',()=>{
  const bpm=SECTIONS[2].knobs[0];
  expect(knobText(bpm,{...INITIAL_VALUES,...seqValues({...SEQ,bpm:72})},{})).toBe('72');
  expect(knobText(SECTIONS[3].knobs[0],{},{evoOn:true})).toBe('ON');
 });
 it('reads the song into the knobs and the knobs back into generator settings',()=>{
  const v=seqValues(SEQ);
  expect(v.key).toBe(7);expect(MODES[FAMILIES[v.family]][v.mode]).toBe('Dorian');expect(v.progression).toBe(1);
  expect(seqPatch('key',{...v,key:2})).toEqual({tonic:2});
  expect(seqPatch('mode',v)).toEqual({mode:'Major-2'});
  expect(seqPatch('chordLength',{...v,chordLength:2})).toEqual({barsPerChord:4});
  expect(seqPatch('meter',v)).toEqual({meter:'3/4'});
  expect(seqPatch('bpm',v)).toEqual({bpm:100});
  expect(seqPatch('swing',v)).toBeNull();
 });
});
