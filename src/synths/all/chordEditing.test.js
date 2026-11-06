import {describe,it,expect} from 'vitest';
import {makeKey,degreeToMidi} from '../../seq/harmony';
import {resizeChord,transposeChord} from './chordEditing';

const key=makeKey('Major-1',0),part={startBar:0,bars:6};
const chord=(bar,name,pitchClasses)=>({bar,name,pitchClasses,scalePcs:[0,2,4,5,7,9,11]});
const make=()=>({
 key,bars:6,stepsPerBar:4,
 chords:[chord(0,'Dm7',[2,5,9,0]),chord(1,'Cmaj7',[0,4,7,11]),chord(2,'G7',[7,11,2,5]),chord(4,'Am7',[9,0,4,7])],
 patterns:{lead:{length:24,steps:Array.from({length:24},(_,i)=>i%4===0?{n:[{d:[1,0,4,4,5,5][i/4]}]}:null)},bass:{length:24,steps:Array.from({length:24},(_,i)=>i%4===0?{n:[{d:[1,0,4,4,5,5][i/4],o:-1}]}:null)},perc:{steps:[{hits:[{drum:0}]}]}},
});
const midi=(p,role,bar)=>degreeToMidi(key,p.patterns[role].steps[bar*4].n[0]);
describe('chord edits',()=>{
 it('transposes chord metadata and all pitched roles by scale degree and octave',()=>{
  const p=make(),next=transposeChord(p,part,0,1,1);
  expect(next.chords[0].name).toBe('Em7');
  expect(next.chords[0].pitchClasses).toEqual([4,7,11,2]);
  expect(midi(next,'lead',0)).toBe(76);
  expect(midi(next,'bass',0)).toBe(64);
  expect(midi(next,'lead',1)).toBe(60);
  expect(next.patterns.perc).toBe(p.patterns.perc);
 });
 it('names ninth chords in stacked order when transposed through the scale',()=>{
  const p=make();
  p.chords[0]=chord(0,'Cmaj9',[0,4,7,11,2]);
  const d=transposeChord(p,part,0,1,0);
  expect(d.chords[0].name).toBe('Dm9');
  expect(d.chords[0].pitchClasses).toEqual([2,5,9,0,4]);
  const e=transposeChord(d,part,0,1,0);
  expect(e.chords[0].name).toBe('Em7(♭9)');
  expect(e.chords[0].pitchClasses).toEqual([4,7,11,2,5]);
  const back=transposeChord(e,part,0,-2,0);
  expect(back.chords[0].name).toBe('Cmaj9');
  expect(back.chords[0].pitchClasses).toEqual([0,4,7,11,2]);
 });
 it('preserves the chord name and pitches when only its octave changes',()=>{
  const p=make();
  p.chords[0]=chord(0,'Cmaj9',[0,4,7,11,2]);
  const next=transposeChord(p,part,0,0,1);
  expect(next.chords[0].name).toBe('Cmaj9');
  expect(next.chords[0].pitchClasses).toEqual([0,4,7,11,2]);
 });
 it('spells transposed roots according to the scale',()=>{
  const p=make();
  p.key=makeKey('Major-1',5);
  p.chords[0]=chord(0,'Am',[9,0,4]);
  const next=transposeChord(p,part,0,1,0);
  expect(next.chords[0].name).toBe('B♭');
  expect(next.chords[0].pitchClasses).toEqual([10,2,5]);
 });
 it('keeps added ninths above the triad instead of treating them as sevenths',()=>{
  const p=make();
  p.chords[0]=chord(0,'Cadd9',[0,4,7,2]);
  const next=transposeChord(p,part,0,1,0);
  expect(next.chords[0].name).toBe('Dmadd9');
  expect(next.chords[0].pitchClasses).toEqual([2,5,9,4]);
 });
 it('cascades right and remaps each transferred bar to its new chord',()=>{
  const p=make(),result=resizeChord(p,part,0,'end',3).project;
  expect(result.chords.map(c=>c.bar)).toEqual([0,3,4,5]);
  expect([0,1,2,3,4,5].map(b=>midi(result,'lead',b))).toEqual([62,62,62,60,67,69]);
  expect(midi(result,'bass',1)).toBe(50);
  expect(p.chords.map(c=>c.bar)).toEqual([0,1,2,4]);
 });
 it('cascades left and shrinks without deleting chords',()=>{
  const project=make();
  project.chords[1].bar=2;project.chords[2].bar=3;
  const result=resizeChord(project,part,4,'start',3);
  expect(result.bar).toBe(3);
  expect(result.project.chords.map(c=>c.bar)).toEqual([0,1,2,3]);
 });
 it('respects progression boundaries and preserves chords outside the edited progression',()=>{
  const project=make(),section={startBar:1,bars:4};
  const result=resizeChord(project,section,1,'end',3).project;
  expect(result.chords.map(c=>c.bar)).toEqual([0,1,3,4,5]);
  expect(result.chords.find(c=>c.bar===5).name).toBe('Am7');
  expect(midi(result,'lead',5)).toBe(69);
  expect(()=>resizeChord(project,section,1,'end',4)).toThrow('at least one bar');
 });
 it('splits a held note at the changed boundary and leaves its outside portion unchanged',()=>{
  const project=make();
  project.patterns.lead.steps[3]={n:[{d:1,len:3}]};
  const result=resizeChord(project,part,0,'end',2).project;
  expect(result.patterns.lead.steps[3].n[0].len).toBe(1);
  expect(degreeToMidi(key,result.patterns.lead.steps[4].n[0])).toBe(64);
 });
 it('transposes absolute-pitch patterns without losing their pitch',()=>{
  const project=make();
  project.patterns.lead.follow='off';
  project.patterns.lead.steps[0]={n:[{midi:62}]};
  const result=transposeChord(project,part,0,1,1);
  expect(result.patterns.lead.steps[0].n[0].midi).toBe(76);
 });
});
