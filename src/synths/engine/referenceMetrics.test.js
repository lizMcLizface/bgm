// @vitest-environment node
import {profileReference,compareReferences} from './referenceMetrics.js';

const sr=48000;
const tone=(hz=440,gain=.2,phase=0)=>Float32Array.from({length:sr},(_,i)=>gain*Math.sin(2*Math.PI*hz*i/sr+phase));

test('gain and oscillator phase do not masquerade as timbre or envelope differences',()=>{
 const r=compareReferences([tone()],[tone(440,.1,1.2)],sr);
 expect(r.gainToMatchDb).toBeCloseTo(6.0206,2);
 expect(Math.abs(r.pitchErrorCents)).toBeLessThan(1);
 expect(r.envelopeErrorDb).toBeLessThan(.15);
 expect(r.spectralShapeErrorDb).toBeLessThan(.15);
});

test('stereo power survives phase cancellation',()=>{
 const x=tone(),negative=x.map(v=>-v),mono=profileReference([x],sr),stereo=profileReference([x,negative],sr);
 expect(stereo.rmsDb).toBeCloseTo(mono.rmsDb,8);
 expect(stereo.pitchHz).toBeCloseTo(440,0);
 expect(compareReferences([x],[x,negative],sr).spectralShapeErrorDb).toBeLessThan(1e-6);
});

test('detuning, changed harmonics and changed decay produce independent measurable errors',()=>{
 const x=tone(),tuned=compareReferences([x],[tone(445)],sr);
 expect(tuned.pitchErrorCents).toBeCloseTo(1200*Math.log2(445/440),0);
 const bright=x.map((v,i)=>v+.1*Math.sin(2*Math.PI*880*i/sr));
 expect(compareReferences([x],[bright],sr).spectralShapeErrorDb).toBeGreaterThan(5);
 const decay=x.map((v,i)=>v*Math.exp(-i/sr*4));
 expect(compareReferences([x],[decay],sr).envelopeErrorDb).toBeGreaterThan(5);
});

test('silence is unmeasurable and malformed or mismatched audio is rejected',()=>{
 const zero=new Float32Array(sr),r=compareReferences([zero],[tone()],sr);
 expect(r.pitchErrorCents).toBeNull();expect(r.spectralShapeErrorDb).toBeNull();expect(r.gainToMatchDb).toBeNull();
 expect(()=>compareReferences([tone()],[tone().subarray(1)],sr)).toThrow(/same number/);
 expect(()=>profileReference([Float32Array.of(NaN)],sr)).toThrow(/finite/);
 expect(()=>profileReference([],sr)).toThrow(/nonempty/);
});
