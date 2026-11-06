import {describe,it,expect} from 'vitest';
import {makeKey} from '../../seq/harmony';
import {repeatRange,repeatNoteEvents} from './repeat';
import {createScheduler} from '../../seq/scheduler';

describe('playhead repeat',()=>{
 const project={bars:8,stepsPerBar:16,chords:[{bar:0},{bar:2},{bar:5}]};
 it('finds the bar and chord containing the audible step',()=>{
  expect(repeatRange(project,49,'bar')).toEqual({startBar:3,bars:1});
  expect(repeatRange(project,49,'chord')).toEqual({startBar:2,bars:3});
  expect(repeatRange(project,127,'chord')).toEqual({startBar:5,bars:3});
  expect(()=>repeatRange({...project,chords:[]},0,'chord')).toThrow('No chord');
 });
 it('resumes notes held into the loop and clips notes at its end',()=>{
  const steps=Array(32).fill(null);
  steps[2]={n:[{d:0,len:10}]};steps[8]={n:[{d:2,len:10}]};
  const p={start:4,key:makeKey(),sequencers:[{pattern:{length:32,steps,gate:1},mute:false}]};
  const ctx={time:1,stepSec:.1,swing:.5};
  const start=repeatNoteEvents(p,0,ctx,8);
  expect(start).toHaveLength(1);
  expect(start[0].note).toBe(60);
  expect(start[0].time).toBe(1);
  expect(start[0].duration).toBeCloseTo(.8);
  const last=repeatNoteEvents(p,4,{...ctx,time:1.4},8);
  expect(last[0].note).toBe(64);
  expect(last[0].duration).toBeCloseTo(.4);
 });
 it('loops the requested span on the actual scheduler',()=>{
  const steps=Array(12).fill(null);steps[4]={n:[{d:0,len:4}]};steps[8]={n:[{d:1}]};
  const p={start:4,key:makeKey(),sequencers:[{pattern:{length:12,steps,gate:1},mute:false}]};
  let time=0,tick;
  const played=[];
  const scheduler=createScheduler({now:()=>time,bank:()=>({patterns:[p],lengths:[4],tempos:[],chain:[],current:0}),tempo:()=>120,swing:()=>.5,flam:()=>.5,
   pattern:x=>x,events:(x,step,ctx)=>repeatNoteEvents(x,step,ctx,4),emit:events=>played.push(...events),lookahead:.01,timers:{set:fn=>(tick=fn,1),clear:()=>{}}});
  scheduler.start(0,'pattern');
  for(let i=1;i<=8;i++){time=i*.125;tick();}
  scheduler.stop();
  expect(played.map(e=>e.note)).toEqual([60,60,60]);
  expect(played.map(e=>e.time)).toEqual([0,.5,1]);
  expect(played.every(e=>Math.abs(e.duration-.5)<1e-8)).toBe(true);
 });
 it('restarts a song at a specified step and continues through its chain',()=>{
  let time=0,tick;
  const steps=[];
  const scheduler=createScheduler({now:()=>time,bank:()=>({patterns:[{},{}],lengths:[4,4],tempos:[],chain:[0,1],current:0}),tempo:()=>120,swing:()=>.5,flam:()=>.5,
   events:()=>[],emit:()=>{},onStep:info=>steps.push([info.pattern,info.step]),lookahead:.01,timers:{set:fn=>(tick=fn,1),clear:()=>{}}});
  scheduler.start(0,'song',{pattern:1,step:2});
  for(let i=1;i<=2;i++){time=i*.125;tick();}
  scheduler.stop();
  expect(steps).toEqual([[1,2],[1,3],[0,0]]);
  expect(()=>scheduler.start(0,'song',{pattern:1,step:4})).toThrow('Invalid scheduler start position');
 });
});
