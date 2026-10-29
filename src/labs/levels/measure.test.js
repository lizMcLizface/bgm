import {NOTES,SLOT,START,HOLD,chordFor,windowDb,levelsFromChannels,hashText} from './measure';
it('reads a full-scale sine as about -3 dBFS and silence as the floor',()=>{
 const sr=1000,sine=Float32Array.from({length:sr},(_,i)=>Math.sin(2*Math.PI*50*i/sr));
 expect(windowDb(sine,sine,0,sr)).toBeCloseTo(-3,0);expect(windowDb(new Float32Array(sr),new Float32Array(sr),0,sr)).toBe(-120);expect(windowDb(sine,sine,sr,2*sr)).toBe(-120);
});
it('measures each slot in its own windows, so a change after one second only shows in the later window',()=>{
 const sr=1000,left=new Float32Array(Math.ceil((NOTES.length*SLOT+2)*sr));
 for(let i=Math.round((START+1)*sr);i<Math.round((START+HOLD)*sr);i++)left[i]=.5;
 const levels=levelsFromChannels(left,left,sr,1);
 expect(levels.attack[0]).toBe(-120);expect(levels.hold[0]).toBeCloseTo(-6,0);expect(levels.average[0]).toBeGreaterThan(-120);expect(levels.average[0]).toBeLessThan(levels.hold[0]);
});
it('spans the 88-key range and keeps chords on the keyboard',()=>{
 expect(NOTES[0]).toBe(21);expect(NOTES.at(-1)).toBe(108);
 expect(chordFor(60)).toEqual([60,64,67]);expect(Math.max(...NOTES.flatMap(chordFor))).toBeLessThanOrEqual(108);
});
it('hashes identical text identically and changed text differently',()=>{
 expect(hashText('{\"gain\":.2}')).toBe(hashText('{\"gain\":.2}'));expect(hashText('{\"gain\":.2}')).not.toBe(hashText('{\"gain\":.21}'));expect(hashText('')).toHaveLength(8);
});
