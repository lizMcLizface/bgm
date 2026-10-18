import {noteEvents} from './noteEvents';
it('books offline note gates, tuning and single-attack chord glide targets before rendering',()=>{
 const notes=[{time:1,midi:60,velocity:.7,duration:4,detune:20,expression:{pitchTargets:[{time:2,midi:64},{time:4,midi:67}]}}],e=noteEvents(notes,1000);
 expect(e[0]).toEqual([0,1,1000,60.2,.7]);expect(e[1]).toEqual([1,1,5000,0,0]);expect(e.slice(2)).toEqual([[5,1,1000,64.2,2],[5,1,3000,67.2,2]]);expect(e.filter(x=>x[0]===0)).toHaveLength(1);
});
it('translates slide-from notes and gate expression without retriggering',()=>{
 const e=noteEvents([{time:0,midi:64,velocity:.5,duration:1,expression:{slideFromMidi:60,slideSeconds:.4,gateScale:.9}}],1000);expect(e).toEqual([[0,1,0,60,.5],[1,1,900,0,0],[5,1,0,64,.4]]);
});
it('keeps slow pitch motion continuous and filters malformed targets',()=>{
 const e=noteEvents([{time:0,midi:60,velocity:.5,duration:3,expression:{pitchMotion:{phase:1,depth:25,rate:.2},pitchTargets:[{time:2,midi:64},{time:-1,midi:0},{time:NaN,midi:0}]}}],48000);expect(e.flat().every(Number.isFinite)).toBe(true);expect(e.filter(x=>x[0]===0)).toHaveLength(1);expect(e.filter(x=>x[0]===5)).toHaveLength(36);expect(e[0][3]).toBeGreaterThan(60);expect(e.at(-1)[3]).toBeGreaterThan(64);
});
