// @vitest-environment node
import {it,expect} from 'vitest';
import {ControlClock} from './controlSnapshot';
import {WalkPath} from './wander';
it('captures phase continuity across rate edits and remaining target smoothing',()=>{
 const c=new ControlClock(0,.25,.1);c.depth(10,0,.3);c.rate(.5,1);expect(c.phaseAt(1)).toBeCloseTo(.35,12);expect(c.phaseAt(2)).toBeCloseTo(.85,12);
 const s=c.capture(2);expect(s.initialDepth).toBeCloseTo(10*(1-Math.exp(-2/.3)),12);expect(s.targetDepth).toBe(10);c.depth(0,2,.3);expect(c.capture(2.3).initialDepth).toBeCloseTo(s.initialDepth/Math.E,12);expect(()=>c.capture(0)).toThrow('predates');
});
it('clones an edited Brownian path without consuming or changing its original future',()=>{
 const a=new WalkPath(109,30),b=new WalkPath(109,30);a.valueAt(83);b.valueAt(83);a.setPeriod(120);b.setPeriod(120);const count=a.knots.length,copy=a.clone();copy.valueAt(220);expect(a.knots.length).toBe(count);for(const t of [0,4,83.5,129,220,240]){expect(copy.valueAt(t)).toBe(a.valueAt(t));expect(a.valueAt(t)).toBe(b.valueAt(t));}
});
it('captures the native one-millisecond future frequency step and its initial 440 Hz phase',()=>{const c=new ControlClock(0,440);c.rate(4,.001,0);expect(c.capture(0)).toMatchObject({frequency:440,phase:0,points:[[.001,4]]});expect(c.phaseAt(.125)).toBeCloseTo((.44+.124*4)%1,12);expect(c.capture(.125).points).toEqual([]);c.rate(8,.126,.125);expect(c.capture(.125).points).toEqual([[.0010000000000000009,8]]);});
it('freezes unpulled sine phase, then resumes at the native source activation boundary',()=>{const c=new ControlClock(0,440);c.setActive(false,0);c.rate(4,.001,0);expect(c.capture(10).phase).toBe(0);c.setActive(true,10,10.01);expect(c.phaseAt(10.005)).toBe(0);expect(c.phaseAt(10.135)).toBeCloseTo(.5,12);c.setActive(false,10.135);c.rate(8,11);expect(c.capture(20).phase).toBeCloseTo(.5,12);c.setActive(true,20);expect(c.phaseAt(20.03125)).toBeCloseTo(.75,12);});
it('preserves a clamped initial walk endpoint and zero-variance RNG history',()=>{const a=new WalkPath(35,60);expect(a.knots[0]).toBe(-1.2000000000000002);a.valueAt(4);a.setPeriod(1e30);a.valueAt(8);const b=a.clone();a.setPeriod(30);b.setPeriod(30);expect(a.valueAt(40)).toBe(b.valueAt(40));});
