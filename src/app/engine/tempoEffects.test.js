import {effectTiming,scheduleEffectTiming} from './tempoEffects';
import defaults from './presetDefaults';
test('tempo timing uses felt beats, musical divisions and node limits without mutating free values',()=>{
 const p={...defaults,delayTime:.37,pingPongDelayTime:.8,tremoloRate:3.7,autoPanRate:.22},before=structuredClone(p);
 const t=effectTiming(p,.5);expect(t.delayTime).toBe(.375);expect(t.pingPongDelayTime).toBe(.75);expect(t.tremoloRate).toBe(4);expect(t.autoPanRate).toBe(.25);
 expect(effectTiming(p,0)).toMatchObject({delayTime:.37,pingPongDelayTime:.8,tremoloRate:3.7,autoPanRate:.22});
 for(const beat of [.15,.5,1,3]) {const t=effectTiming(p,beat);expect(t.delayTime).toBeGreaterThan(0);expect(t.delayTime).toBeLessThanOrEqual(1);expect(t.filterLfoRate).toBeGreaterThanOrEqual(.01);}
 expect(effectTiming({...p,delayTime:0},.5).delayTime).toBe(0);expect(p).toEqual(before);
});
const fixture=()=>{
 const param=()=>({cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
 const inst={preset:{...defaults,delayTime:.37,delayAmount:.2,tremoloDepth:.2,tremoloRate:3.7},
  delay:{delay:{delayTime:param()}},pingPong:{leftDelay:{delayTime:param()},preDelay:{delayTime:param()},rightDelay:{delayTime:param()}},
  motion:{tremoloLfo:{frequency:param()},panLfo:{frequency:param()}},filterLfo:{frequency:param()}};
 return inst;
};
test('scheduled timing uses audio-clock targets and free mode cancels future timing without changing the patch',()=>{
 const inst=fixture(),before=structuredClone(inst.preset);
 scheduleEffectTiming(inst,0,1);expect(inst.delay.delay.delayTime.cancelScheduledValues).not.toHaveBeenCalled();
 scheduleEffectTiming(inst,.5,10);expect(inst.delay.delay.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(.375,10,.025);
 expect(inst.pingPong.leftDelay.delayTime.setTargetAtTime).not.toHaveBeenCalled();expect(inst.tempoTailReserve).toBe(true);
 scheduleEffectTiming(inst,.75,12);scheduleEffectTiming(inst,0,11);
 expect(inst.delay.delay.delayTime.cancelScheduledValues).toHaveBeenLastCalledWith(11);
 expect(inst.delay.delay.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(.37,11,.025);
 expect(inst.motion.tremoloLfo.frequency.setTargetAtTime).toHaveBeenLastCalledWith(3.7,11,.025);expect(inst.preset).toEqual(before);
});
