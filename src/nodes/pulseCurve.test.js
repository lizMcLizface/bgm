import {dutyCycleCurve} from './pulseCurve';
test('asymmetric pulses retain their AC step and duty cycle but have zero mean',()=>{
 for(const duty of [.01,.2,.35,.5,.8,.99]) {
  const c=dutyCycleCurve(duty),n=c.length;let area=(c[0]+c[n-1])/2;for(let i=1;i<n-1;i++)area+=c[i];
  expect(Math.abs(area/(n-1))).toBeLessThan(1e-7);
  expect(c[0]-c[n-1]).toBeCloseTo(2,6);expect(c.every(Number.isFinite)).toBe(true);
  const k=c.findIndex(x=>x===c.at(-1));expect(Math.abs(k/(n-1)-duty)).toBeLessThan(1/(n-1));
  // Every sample changes by the same constant; no harmonic or envelope rewrite.
  const offset=1-c[0];for(let i=0;i<n;i++)expect(c[i]).toBeCloseTo((i/(n-1)<duty?1:-1)-offset,6);
 }
});
test('half-duty pulses retain the old shape and malformed duty inputs stay finite',()=>{
 const c=dutyCycleCurve(.5);expect(c[0]).toBe(1);expect(c.at(-1)).toBe(-1);expect(dutyCycleCurve(NaN)).toEqual(c);
 expect(dutyCycleCurve(-4)).toEqual(dutyCycleCurve(.01));expect(dutyCycleCurve(4)).toEqual(dutyCycleCurve(.99));
});
