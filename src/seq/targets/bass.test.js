import {bassStepEvents,stepNote,ACCENT_VELOCITY,PLAIN_VELOCITY} from './bass';
import {createScheduler} from '../scheduler';
import {parseStep} from '../../synths/tb303/presets';

const line=text=>text.split(/\s+/).map(parseStep);
const play=(text,step,extra={})=>bassStepEvents({steps:line(text),length:text.split(/\s+/).length},step,{time:10,stepSec:.125,...extra});

test('a note is a note on and a note off at 60% of the step, with accent as a high velocity',()=>{
 const [on,off]=play('C - - -',0);
 expect(on).toEqual({type:'on',time:10,note:36,velocity:PLAIN_VELOCITY});
 expect(off.type).toBe('off');expect(off.time).toBeCloseTo(10+.125*.6,6);
 expect(play('C* - - -',0)[0].velocity).toBe(ACCENT_VELOCITY);
 expect(ACCENT_VELOCITY).toBeGreaterThan(.85);expect(PLAIN_VELOCITY).toBeLessThanOrEqual(.85);
});
test('steps that are not notes play nothing, and octave flags move the note by twelve',()=>{
 expect(play('C - _ -',1)).toEqual([]);expect(play('C - _ -',2)).toEqual([]);
 expect(stepNote(parseStep('D#^'))).toBe(36+3+12);expect(stepNote(parseStep('Gv'))).toBe(36+7-12);
});
test('ties hold the gate through the steps that follow',()=>{
 const [,off]=play('C _ _ D',0);
 expect(off.time).toBeCloseTo(10+.125*(2+.6),6);
});
test('a slide into the next note never closes the gate, so the next note starts legato; a slide into a rest closes it at the next step',()=>{
 expect(play('C~ D - -',0)).toHaveLength(1);
 const into=play('C~ - D -',0);expect(into).toHaveLength(2);expect(into[1].time).toBeCloseTo(10.125,6);
 expect(play('C - D -',0)).toHaveLength(2);
});
test('swing delays odd steps and wraps the look-ahead around the pattern length',()=>{
 const [on]=play('C C C C',1,{swing:.75});expect(on.time).toBeCloseTo(10+.0625,6);
 const wrapped=bassStepEvents({steps:line('C _ - C'),length:2},0,{time:0,stepSec:.1});
 expect(wrapped[1].time).toBeCloseTo(.1*(1+.6),6);
});
test('the core scheduler plays a bass pattern as timed notes on the audio clock',()=>{
 const sent=[];let now=0,tick=null;
 const bank={patterns:[line('C* - D~ E - - C _ - - - - - - - -')],lengths:[16],tempos:[0],chain:[],current:0};
 const scheduler=createScheduler({now:()=>now,bank:()=>bank,pattern:(p,ctx)=>({steps:p,length:ctx.bank.lengths[ctx.index]}),events:bassStepEvents,tempo:()=>120,swing:()=>.5,flam:()=>.5,emit:events=>sent.push(...events),
  timers:{set:fn=>{tick=fn;return 1;},clear:()=>{tick=null;}}});
 scheduler.start(0);
 for(let t=0;t<2.2;t+=.05){now=t;tick();}
 scheduler.stop();
 const ons=sent.filter(e=>e.type==='on');
 expect(ons.slice(0,4).map(e=>e.note)).toEqual([36,38,40,36]);
 expect(ons[0].velocity).toBe(ACCENT_VELOCITY);
 expect(ons[1].time-ons[0].time).toBeCloseTo(.25,6); // two steps at 120 bpm
});
