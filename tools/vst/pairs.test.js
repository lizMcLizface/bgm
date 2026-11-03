import {describe,expect,it} from 'vitest';
import {SYNTHS} from '../../src/synths/models.js';
import {dexedToFm7,fm7ToDexed} from './pairs.mjs';

describe('Dexed <-> FM7 voice mapping',()=>{
 const voice=SYNTHS.dx7.params.sanitize({algorithm:17,feedback:5,transpose:12,lfoWave:3,lfoSync:1,pitchL1:70,pitchModSens:6,
  'op2.mode':1,'op2.coarse':3,'op2.fine':46,'op2.detune':3,'op3.breakPoint':57,'op3.leftCurve':2,'op3.rightCurve':1,'op4.level':44,'op5.on':0});
 const keys=SYNTHS.dx7.params.PARAMS.filter(p=>p.id<156||/^(oscKeySync|lfoSync)$/.test(p.key)).map(p=>p.key);
 it('round-trips every voice parameter',()=>{
  const back=dexedToFm7(fm7ToDexed(voice));
  for(const k of keys)expect(back[k],k).toBe(voice[k]);
 });
 it('uses Dexed units: algorithm 1-32, transpose and pitch EG level relative to the DX7 centre',()=>{
  const d=fm7ToDexed(voice);
  expect(d.algorithm).toBe(18);
  expect(d.transpose).toBe(-12);
  expect(d.pitch_eg_level1).toBe(20);
  expect(d.op2_detune).toBe(-4);
 });
});
