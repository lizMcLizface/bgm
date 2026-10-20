// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,rms,peak,brightness} from './offline';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const P={tune:0,cutoff:1,res:2,envmod:3,decay:4,accent:5,wave:6,volume:7,drive:8,slide:9,tempo:10,swing:11};
const bass=(set={})=>createOfflineSynth(module,{model:11,params:[[203,0],...Object.entries(set).map(([k,v])=>[P[k],v])]});
const REST=0,NOTE=1,TIE=2,ACC=1,SLIDE=2,UP=4,DOWN=8;
const put=(v,s,kind,note=0,flags=0,p=0)=>v.seq(1,p*16+s,kind+4*note+256*flags);
// pitch by autocorrelation
function pitch(x,sr=48000,lo=40,hi=400){let best=0,at=0;for(let lag=Math.floor(sr/hi);lag<=Math.ceil(sr/lo);lag++){let s=0;for(let i=0;i+lag<x.length;i++)s+=x[i]*x[i+lag];if(s>best){best=s;at=lag;}}return sr/at;}

test('a played key sounds at the right pitch, and the step sequencer plays the programmed notes',()=>{
 const v=bass({cutoff:3000,res:0,envmod:0});
 v.k.syn_note_on(1,45,1);v.seconds(.1);expect(Math.abs(1200*Math.log2(pitch(v.seconds(.2)[0])/110))).toBeLessThan(15);
 const s=bass({cutoff:3000,res:0,envmod:0,tempo:120});
 put(s,0,NOTE,12);put(s,4,NOTE,19);s.seq(0,1);
 const [l]=s.seconds(1.0);
 expect(Math.abs(1200*Math.log2(pitch(l.subarray(2000,12000))/130.81))).toBeLessThan(15);   // C3
 expect(Math.abs(1200*Math.log2(pitch(l.subarray(26000,36000))/196.0))).toBeLessThan(15);   // G3
});

test('octave up and down flags shift a step by an octave',()=>{
 const f=flags=>{const s=bass({cutoff:3000,res:0,envmod:0});put(s,0,NOTE,12,flags);s.seq(0,1);return pitch(s.seconds(.2)[0].subarray(1500,9000));};
 expect(f(UP)/f(0)).toBeCloseTo(2,1);expect(f(DOWN)/f(0)).toBeCloseTo(.5,1);
});

test('gates are about 60% of a step; a tie holds the note across steps',()=>{
 const run=kind=>{const s=bass({tempo:120,cutoff:2500,envmod:0,res:0});put(s,0,NOTE,12);if(kind)put(s,1,TIE);s.seq(0,1);return s.seconds(.3)[0];};
 const win=(x,a,b)=>rms(x.subarray(a,b));
 const gap=run(0);expect(win(gap,2000,5000)).toBeGreaterThan(win(gap,5500,6000)*3); // 60% of 6000 frames = 3600: quiet by 5500
 const tied=run(1);expect(win(tied,6500,7500)).toBeGreaterThan(win(gap,6500,7500)*5+1e-3); // still sounding after the next step's start
 expect(win(tied,10600,11300)).toBeLessThan(win(tied,6500,7500)*.3);     // and released after 60% of the second step
});

test('a slide glides to the next note without re-triggering the envelope',()=>{
 const run=flags=>{const s=bass({tempo:120,cutoff:1500,envmod:.8,res:.3,decay:.3,slide:.01});put(s,0,NOTE,0,flags);put(s,1,NOTE,12);s.seq(0,1);return s.seconds(.3)[0];};
 const slid=run(SLIDE),plain=run(0);
 // plain: silent gap before step 1 at frame 6000; slid: sound carries through
 const rmsAt=(x,a)=>rms(x.subarray(a,a+300));
 expect(rmsAt(slid,5700)).toBeGreaterThan(rmsAt(plain,5700)*4);
 // the second note's onset is softer when slid (no new envelope peak)
 expect(brightness(slid.subarray(6100,9000))).toBeLessThan(brightness(plain.subarray(6100,9000))*0.97);
 // the pitch reaches the new note
 expect(Math.abs(1200*Math.log2(pitch(slid.subarray(8500,9500),48000,40,400)/(65.41*2))) ).toBeLessThan(25);
});

test('accents are louder, and consecutive accents build',()=>{
 const run=flags=>{const s=bass({tempo:120,accent:.8,cutoff:900,envmod:.5});for(let i=0;i<4;i++)put(s,i,NOTE,12,flags);s.seq(0,1);return s.seconds(1.0)[0];};
 const a=run(ACC),n=run(0);
 expect(rms(a.subarray(200,3200))).toBeGreaterThan(rms(n.subarray(200,3200))*1.2);
 expect(rms(a.subarray(18200,21200))).toBeGreaterThan(rms(a.subarray(200,3200))*1.02); // the fourth in a row is stronger than the first
});

test('the filter envelope opens on each note and closes again; resonance and drive change the tone',()=>{
 const s=bass({tempo:60,cutoff:300,envmod:1,res:.6,decay:.25});put(s,0,NOTE,12);s.seq(0,1);
 const [l]=s.seconds(.6);
 expect(brightness(l.subarray(300,2400))).toBeGreaterThan(brightness(l.subarray(14000,16000))*1.5);
 const clean=bass({drive:0,cutoff:1500});clean.k.syn_note_on(1,40,1);const dirty=bass({drive:.9,cutoff:1500});dirty.k.syn_note_on(1,40,1);
 const crest=x=>peak(x)/rms(x);expect(crest(dirty.seconds(.3)[0].subarray(4000))).toBeLessThan(crest(clean.seconds(.3)[0].subarray(4000))*.95);
});

test('block-size independence, bounded output, and a stopped machine is silent',()=>{
 const run=chunk=>{const s=bass({tempo:133,swing:.58,res:.9,envmod:1,accent:1,drive:.5});for(let i=0;i<16;i++)put(s,i,i%5===4?REST:i%3===2?TIE:NOTE,(i*5)%24,(i%2?ACC:0)|(i%4===1?SLIDE:0));s.seq(0,1);return s.seconds(4,chunk)[0];};
 const a=run(128),b=run(1000);
 let worst=0;for(let i=0;i<a.length;i++){worst=Math.max(worst,Math.abs(a[i]-b[i]));if(!Number.isFinite(a[i]))throw Error('non-finite');}
 expect(worst).toBeLessThan(1e-4);expect(peak(a)).toBeLessThan(1.01);expect(peak(a)).toBeGreaterThan(.1);
 const s=bass();put(s,0,NOTE,12);expect(peak(s.seconds(.5)[0])).toBe(0);
});

test('pattern length and per-pattern tempo apply to the bass line too',()=>{
 const s=bass({tempo:120});put(s,0,NOTE,12);s.seq(5,8,0);s.seq(8,0,240);s.seq(0,1);
 const [l]=s.seconds(1);
 const at=a=>rms(l.subarray(a,a+800));
 expect(at(24200)).toBeGreaterThan(.03);expect(at(20000)).toBeLessThan(.003);expect(at(12000)).toBeLessThan(.003); // eight 16ths at 240 bpm = 24000 frames
});
