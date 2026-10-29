import {NOTES,SLOT,START,HOLD,chordFor,windowDb,levelsFromChannels,hashText,aWeight,summarise,powerMean} from './measure';
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
it('weights like an A-weighting curve: flat at 1 kHz, about -19 dB at 100 Hz, about -30 dB at 50 Hz',()=>{
 const sr=44100,rms=f=>{const x=Float64Array.from({length:sr},(_,i)=>Math.sin(2*Math.PI*f*i/sr)),y=aWeight(x,sr);let p=0;for(let i=sr>>1;i<sr;i++)p+=y[i]*y[i];return 10*Math.log10(p/(sr/2)*2);};
 expect(rms(1000)).toBeCloseTo(0,0);expect(rms(100)).toBeGreaterThan(-20.5);expect(rms(100)).toBeLessThan(-17.5);expect(rms(50)).toBeGreaterThan(-32);expect(rms(50)).toBeLessThan(-28);expect(rms(4000)).toBeGreaterThan(-1);expect(rms(4000)).toBeLessThan(3);
});
it('summarises a keyboard as power means, with peak taking each note at its loudest portion',()=>{
 expect(powerMean([-20,-20])).toBeCloseTo(-20);expect(powerMean([-20,-120])).toBeCloseTo(-23,0);
 const a={attack:[-10,-40],hold:[-30,-12],average:[-20,-20]},sum=summarise({a},true);expect(sum.peak).toBeCloseTo(powerMean([-10,-12]));expect(sum.attack).toBeCloseTo(powerMean([-10,-40]));expect(summarise({attack:[0]},true)).toBeNull();
});
