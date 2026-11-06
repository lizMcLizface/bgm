import {describe,it,expect} from 'vitest';
import {makeKey} from '../../seq/harmony';
import {soundingNotes} from './gridTiming';
import {chordsAt,deleteItems,insertChord,itemsAt,newPlacedChord,nextChordId,placedChordEvents,placedChordTones} from './placedChords';
import {repeatNoteEvents} from './repeat';
import {transposeChord} from './chordEditing';
import {createScheduler} from '../../seq/scheduler';

const key=makeKey('Major-1',0);
const project={key,bars:2,stepsPerBar:16,chords:[{bar:0,name:'C',pitchClasses:[0,4,7]},{bar:1,name:'G',pitchClasses:[7,11,2]}]};
const pattern=(steps=Array(32).fill(null),chords=[])=>({mode:'poly',follow:'scale',length:32,steps,chords});
const chord=(extra={})=>({...newPlacedChord(project,0,8,4,1),...extra});
const ctx={key,time:0,stepSec:.1,track:0};

describe('placed chords',()=>{
 it('uses the progression root and the selected octave, including chromatic roots',()=>{
  expect(newPlacedChord(project,16,20,3,2).root).toEqual({d:-3,o:0,a:0});
  const chromatic={...project,chords:[{bar:0,name:'D♭'}]};
  expect(placedChordTones(key,newPlacedChord(chromatic,0,4,4,1))).toEqual([61,65,68]);
 });
 it('resolves all voicing and colour options',()=>{
  expect(placedChordTones(key,chord())).toEqual([60,64,67]);
  expect(placedChordTones(key,chord({complexity:'power'}))).toEqual([60,67]);
  expect(placedChordTones(key,chord({complexity:'seven'}))).toEqual([60,64,67,71]);
  expect(placedChordTones(key,chord({colour:'sus2'}))).toEqual([60,62,67]);
  expect(placedChordTones(key,chord({colour:'sus4'}))).toEqual([60,65,67]);
  expect(placedChordTones(key,chord({colour:'add7'}))).toEqual([60,64,67,71]);
  expect(placedChordTones(key,chord({colour:'add9'}))).toEqual([60,64,67,74]);
  expect(placedChordTones(key,chord({inversion:1}))).toEqual([64,67,72]);
  expect(placedChordTones(key,chord({rootVoicing:'-1'}))).toEqual([48,64,67]);
  expect(placedChordTones(key,chord({rootVoicing:'-2'}))).toEqual([36,64,67]);
  expect(placedChordTones(key,chord({rootVoicing:'off'}))).toEqual([64,67]);
  expect(()=>placedChordTones(key,chord({root:{d:6,o:4,a:0},colour:'add9'}))).toThrow('MIDI note range');
 });
 it('plays simultaneous chords for their full duration and arpeggios at the selected rate and hold',()=>{
  const p=pattern(undefined,[chord()]);
  expect(placedChordEvents(p,0,ctx).map(e=>[e.note,e.duration])).toEqual([[60,.8],[64,.8],[67,.8]]);
  expect(placedChordEvents(p,1,ctx)).toEqual([]);
  p.chords=[chord({playMode:'arp',direction:'upDown',hold:2,rate:2})];
  const at=i=>placedChordEvents(p,i,{...ctx,time:i*.1});
  expect([0,2,4,6].map(i=>at(i)[0].note)).toEqual([60,64,67,64]);
  expect(at(0)[0].duration).toBeCloseTo(.4);
  expect(at(6)[0].duration).toBeCloseTo(.2);
  expect(at(1)).toEqual([]);
  p.chords=[chord({playMode:'arp',direction:'broken',hold:'end',rate:1})];
  expect([0,1,2,3].map(i=>at(i)[0].note)).toEqual([60,67,64,67]);
  expect(at(3)[0].duration).toBeCloseTo(.5);
  p.chords=[chord({playMode:'arp',direction:'down',hold:1,rate:1})];
  expect([0,1,2].map(i=>at(i)[0].note)).toEqual([67,64,60]);
  p.chords=[chord({playMode:'arp',direction:'random',hold:1,rate:1})];
  expect(at(3)).toEqual(at(3));
  expect(Array.from({length:8},(_,i)=>placedChordEvents(p,i,{...ctx,cycle:1})[0].note)).not.toEqual(Array.from({length:8},(_,i)=>at(i)[0].note));
 });
 it('replaces only the selected octave and splits both held notes and chords',()=>{
  const steps=Array(32).fill(null);steps[0]={n:[{d:0,len:8},{d:-7,len:8}]};
  const original=pattern(steps,[chord()]);
  const added=chord({id:2,start:2,len:4});
  const result=insertChord(original,key,added,true);
  expect(soundingNotes(result,0,8,key).map(n=>[n.midi,n.start,n.end])).toEqual([[48,0,8],[60,0,2],[60,6,8]]);
  expect(result.chords.map(c=>[c.id,c.start,c.len])).toEqual([[1,0,2],['1-tail-6',6,2],[2,2,4]]);
  expect(chordsAt(insertChord(original,key,added,false),2,3,4,key)).toHaveLength(2);
  expect(original.chords[0].len).toBe(8);
  expect(nextChordId(pattern(undefined,[{id:'12-tail-6'}]))).toBe(13);
 });
 it('deletes individual items or an entire stack without shortening unrelated notes',()=>{
  const steps=Array(32).fill(null);steps[0]={n:[{d:0,len:8},{d:2,len:8}]};
  const p=pattern(steps,[chord()]);
  const items=itemsAt(p,key,2,3,{view:'octave',octave:4});
  expect(items.map(x=>x.type)).toEqual(['note','note','chord']);
  const one=deleteItems(p,[items[0]]);
  expect(soundingNotes(one,2,3,key).map(x=>x.midi)).toEqual([64]);
  expect(one.chords).toHaveLength(1);
  const all=deleteItems(p,items);
  expect(all.steps[0]).toBeNull();
  expect(all.chords).toEqual([]);
  expect(itemsAt(p,key,2,3,{view:'scale',rowPc:4}).filter(item=>item.type==='chord')).toHaveLength(1);
 });
 it('clips and resumes held chords at repeat boundaries without changing arpeggio phase',()=>{
  const p=pattern(undefined,[chord({len:12})]);
  const loop={start:4,key,sequencers:[{pattern:p,mute:false}]};
  const start=repeatNoteEvents(loop,0,{time:1,stepSec:.1},4);
  expect(start.map(e=>e.note)).toEqual([60,64,67]);
  expect(start.every(e=>Math.abs(e.duration-.4)<1e-8)).toBe(true);
  p.chords=[chord({len:12,playMode:'arp',rate:2,hold:1})];
  expect(repeatNoteEvents(loop,0,{time:1,stepSec:.1},4).map(e=>e.note)).toEqual([67]);
  p.chords=[chord({len:12,playMode:'arp',rate:2,hold:3})];
  const carried=repeatNoteEvents({...loop,start:5},0,{time:1,stepSec:.1},4);
  expect(carried.map(e=>e.note)).toEqual([60,64,67]);
  expect(carried.map(e=>+e.duration.toFixed(2))).toEqual([.1,.3,.4]);
 });
 it('transposes and splits placed chords with progression edits',()=>{
  const p={...project,patterns:{lead:pattern(undefined,[chord({start:12,len:8})])}};
  const next=transposeChord(p,{startBar:0,bars:1},0,1,1);
  expect(next.patterns.lead.chords.map(c=>[c.start,c.len,c.root.d,c.root.o])).toEqual([[12,4,1,1],[16,4,0,0]]);
 });
 it('books arpeggio notes on successive audio-clock steps through the real scheduler',()=>{
  const p=pattern(undefined,[chord({len:4,playMode:'arp',direction:'up',hold:1,rate:1})]),events=[];
  let time=0,tick;
  const scheduler=createScheduler({now:()=>time,bank:()=>({patterns:[p],lengths:[4],tempos:[],chain:[],current:0}),tempo:()=>120,swing:()=>.5,flam:()=>.5,
   events:(pattern,step,c)=>placedChordEvents(pattern,step,{...c,key}),emit:notes=>events.push(...notes),lookahead:.01,timers:{set:fn=>(tick=fn,1),clear:()=>{}}});
  scheduler.start(0,'pattern');
  for(let i=1;i<4;i++){time=i*.125;tick();}
  scheduler.stop();
  expect(events.map(e=>e.note)).toEqual([60,64,67,60]);
  expect(events.map(e=>e.time)).toEqual([0,.125,.25,.375]);
  expect(events.every(e=>e.duration===.125)).toBe(true);
 });
});
