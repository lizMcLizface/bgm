import {cleanRack} from './params';
import {eqResponse,filterResponse,compressionDb} from './effectFaceModel';
it('shows flat EQ at unity and the actual chosen band gain at its center',()=>{
 const v=cleanRack();for(const sr of [44100,48000,96000])for(const f of [30,180,1000,6000,18000])expect(eqResponse(v,f,sr)).toBeCloseTo(0,6);
 expect(eqResponse({...v,'inserts.midGain':9},1000)).toBeCloseTo(9,6);expect(eqResponse({...v,'inserts.lowGain':-8},20)).toBeLessThan(-7);expect(eqResponse({...v,'inserts.highGain':6},20000)).toBeGreaterThan(5);
});
it('shows the actual filter type, cutoff and slope rather than a decorative invariant line',()=>{
 const v={...cleanRack(),'filter.type':1,'filter.cutoff':1000};expect(filterResponse(v,100)).toBeGreaterThan(-1);expect(filterResponse(v,10000)).toBeLessThan(-30);
 const cuts={...v,'filter.type':0,'filter.low':200,'filter.high':5000};expect(filterResponse({...cuts,'filter.slope':1},40)).toBeLessThan(filterResponse(cuts,40)-20);
});
it('models configured compressor knee and ratio continuously',()=>{
 expect(compressionDb(-40,-24,4,0)).toBe(-40);expect(compressionDb(-8,-24,4,0)).toBe(-20);
 expect(compressionDb(-24,-24,4,12)).toBeLessThan(-24);
 expect(compressionDb(-30-1e-6,-24,4,12)).toBeCloseTo(compressionDb(-30+1e-6,-24,4,12),4);
});
