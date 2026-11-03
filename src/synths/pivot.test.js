import {fromLowestKeyPivot,ladderMakeupVolume,PIVOT_OCTAVES} from './pivot';

test('moving the key-tracking pivot from C2 to C4 raises the cutoff 2 octaves per unit of tracking',()=>{
 expect(PIVOT_OCTAVES).toBe(2);
 expect(fromLowestKeyPivot(100,1)).toBeCloseTo(400);
 expect(fromLowestKeyPivot(100,.5)).toBeCloseTo(200);
 expect(fromLowestKeyPivot(100,0)).toBe(100);
 expect(fromLowestKeyPivot(30000,1)).toBe(40000);          // clamped to the control's range
 expect(fromLowestKeyPivot(8,1)).toBeCloseTo(80);          // the old table clamped to 20 Hz first
});

test('the ladder make-up volume restores the gain of 1 + 0.3 k',()=>{
 expect(ladderMakeupVolume(0)).toBe(1);
 expect(ladderMakeupVolume(.5)**2).toBeCloseTo(1+.3*4.6*.5);
});
