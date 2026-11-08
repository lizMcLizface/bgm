import {drumStepEvents,editDrumLock,transformDrums,applyDrumBeat} from './drumSteps';
import {DRUM_LANES} from './drumLanes';
import {BEATS} from '../drums/beats';
const kick=()=>({drum:0,velocity:.8,duration:1}),ctx={time:1,stepSec:.1,swing:.5,cycle:0,fill:false,random:()=>.4};
it('shares probability, condition, timing, ratchet and parameter-lock playback with the drum machine',()=>{
 const pattern={steps:[{hits:[{...kick(),lock:{velocity:.6,ratchet:3,nudge:-.25,tune:.2,cond:'2:2'}}]}]};
 expect(drumStepEvents(pattern,0,ctx)).toEqual([]);
 const events=drumStepEvents(pattern,0,{...ctx,cycle:1});expect(events).toHaveLength(3);expect(events[0]).toMatchObject({time:.975,hit:{velocity:.6,params:{tune:.2}}});
 expect(events[1].time-events[0].time).toBeCloseTo(.1/3);expect(events[1].hit.velocity).toBeLessThan(.6);
 pattern.steps[0].hits[0].lock.prob=.1;expect(drumStepEvents(pattern,0,{...ctx,cycle:1})).toEqual([]);
});
it('keeps extra tracks and unselected lanes intact when editing, clearing and rotating one lane',()=>{
 const extra={drum:9,track:'mt',velocity:.5,duration:1},pattern={length:4,steps:[{hits:[kick(),extra]},null,null,null]};
 const edited=editDrumLock(pattern,0,DRUM_LANES[0],{velocity:.3});expect(pattern.steps[0].hits[0].lock).toBeUndefined();expect(edited.steps[0].hits[1]).toBe(extra);
 const rotated=transformDrums(edited,0,4,'right',DRUM_LANES[0]);expect(rotated.steps[0].hits).toEqual([extra]);expect(rotated.steps[1].hits[0].lock.velocity).toBe(.3);
 const cleared=transformDrums(edited,0,4,'clear',DRUM_LANES[0]);expect(cleared.steps[0].hits).toEqual([extra]);
});
it('loads original machine recipes into one progression without editing other regions',()=>{
 const pattern={length:48,steps:Array(48).fill(null)};pattern.steps[0]={hits:[kick()]};pattern.steps[40]={hits:[kick()]};
 const beat=BEATS.find(b=>b.id==='flam-parade'),loaded=applyDrumBeat(pattern,16,32,beat);
 expect(loaded.steps[0]).toBe(pattern.steps[0]);expect(loaded.steps[40]).toBe(pattern.steps[40]);
 expect(loaded.steps.slice(16,32).flatMap(s=>s?.hits??[]).some(h=>h.flam)).toBe(true);
 expect(pattern.steps[16]).toBeNull();
});
