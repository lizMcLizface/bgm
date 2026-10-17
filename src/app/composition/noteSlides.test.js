import {slideNotes} from './noteSlides';
import {pitchMotionCents} from '../engine/noteExpression';
const n=(midi,beat,length=.98,role='lead')=>({role,midi,beat,length,velocity:.7});
test('melodic slides are opt-in, deterministic, cross bars and preserve all written events',()=>{
 const previous=[n(67,3)],before=structuredClone(previous),events=[n(69,0),n(72,1),n(72,2),n(74,3)],plain=structuredClone(events);
 slideNotes(events,{previous,secondsPerBeat:.5,noteSlides:true});
 expect(events.every(e=>e.expression.pitchMotion&&!e.expression.slideFromMidi)).toBe(true);
 expect(events.map(({expression,...e})=>e)).toEqual(plain);expect(previous).toEqual(before);
 expect(slideNotes(structuredClone(plain))).toEqual(plain);expect(slideNotes(structuredClone(plain),{previous,secondsPerBeat:.5,noteSlides:true})).toEqual(events);
});
test('one changed chord tone slides and common tones remain fixed',()=>{
 const previous=[60,64,67].map(m=>n(m,3,.98,'pad')),events=[60,65,67].map(m=>n(m,0,2,'pad')),plain=structuredClone(events);
 slideNotes(events,{previous,chordSlides:true,secondsPerBeat:.5});
 expect(events.filter(e=>e.expression)).toHaveLength(1);expect(events.find(e=>e.midi===65).expression).toMatchObject({slideFromMidi:64});
 expect(events.map(({expression,...e})=>e)).toEqual(plain);
});
test('motion continues through attacks, bar boundaries and overlapping tails in every role',()=>{
 for(const role of ['lead','counter','pad','bass']) {
  const a=[n(60,3,2,role)],b=[n(64,0,1,role),n(67,0,1,role),n(69,1,1,role)];
  const options={secondsPerBeat:.5,noteSlides:true,padMotion:true,bassMotion:true};
  slideNotes(a,{...options,bar:0});slideNotes(b,{...options,bar:1});
  const ma=a[0].expression.pitchMotion,mb=b[0].expression.pitchMotion;
  const sample=(m,t)=>pitchMotionCents(m,t);
  // Same absolute moment: outgoing note's tail and incoming note agree,
  // including their rate of motion on each side of the attack.
  expect(sample(ma,.5)).toBeCloseTo(sample(mb,0),10);
  const delta=.001;
  expect((sample(ma,.5)-sample(ma,.5-delta))/delta).toBeCloseTo((sample(mb,delta)-sample(mb,0))/delta,1);
  expect(b[1].expression.pitchMotion).toEqual(mb);
  expect(sample(ma,.75)).toBeCloseTo(sample(mb,.25),10);
  for(let t=0;t<20;t+=.1)expect(Math.abs(sample(ma,t))).toBeLessThanOrEqual(35);
 }
});
test('voices have independent contours; rhythm and bass are independently opt-in',()=>{
 const events=['lead','counter','pad','bass'].map(role=>n(60,0,4,role));
 slideNotes(events,{padMotion:true});expect(events.filter(e=>e.expression).map(e=>e.role)).toEqual(['pad']);
 const all=['lead','counter','pad','bass'].map(role=>n(60,0,4,role));
 slideNotes(all,{noteSlides:true,padMotion:true,bassMotion:true});
 expect(new Set(all.map(e=>e.expression.pitchMotion.phase)).size).toBe(4);
});
