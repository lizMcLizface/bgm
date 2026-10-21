// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak} from './offline';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const machine=(model,params=[],sr=48000)=>createOfflineSynth(module,{sampleRate:sr,model,params:[[203,0],[133,0],...params]});
const LOOK=2400,FLAM=132,TEMPO=130,SWING=131,ACCENT=129,LEVEL=t=>t*8,DECAY=t=>t*8+2;
// seq command packing for the drums: pattern << 10 | track << 5 | step (track 16 = the accent row)
const step=(v,p,t,s,on=1)=>v.seq(1,p<<10|t<<5|s,on);
const onsets=(x,gap=2000,thr=2e-3)=>{const out=[];let last=-1e9;for(let i=0;i<x.length;i++)if(Math.abs(x[i])>thr&&i-last>gap){out.push(i);last=i;}else if(Math.abs(x[i])>thr)last=i;return out;};

test('steps land on their exact frame, whatever the block size',()=>{
 for(const chunk of [128,2048,333]){
  const v=machine(8);v.k.syn_param(TEMPO,120);
  for(const s of [0,4,8])step(v,0,8,s); // rim shots, quarter notes
  v.seq(0,1);
  const [l]=v.seconds(2.1,chunk);
  const at=onsets(l);
  expect(at.length).toBeGreaterThanOrEqual(4);
  [0,24000,48000].forEach((frame,i)=>expect(Math.abs(at[i]-(frame+LOOK))).toBeLessThanOrEqual(4)); // every step sounds 50 ms after it fires (room for the flam's grace note)
 }
});

test('the output does not depend on the block size',()=>{
 for(const [model,hat]of [[8,15],[9,7],[10,4]]){
  const run=chunk=>{const v=machine(model);v.k.syn_param(TEMPO,140);v.k.syn_param(SWING,.6);for(let s=0;s<16;s+=2){step(v,0,0,s);step(v,0,hat,s+1);}step(v,0,1,4);v.seq(0,1);return v.seconds(3,chunk)[0];};
  const a=run(128),b=run(1024);
  let worst=0;for(let i=0;i<a.length;i++)worst=Math.max(worst,Math.abs(a[i]-b[i]));
  expect(worst,`gapped hats on model ${model}`).toBeLessThan(1e-4);
 }
});

test('swing delays the off-beat 16ths: 66.7% is a triplet shuffle, 50% is straight',()=>{
 const run=swing=>{const v=machine(8);v.k.syn_param(TEMPO,120);v.k.syn_param(SWING,swing);step(v,0,8,0);step(v,0,8,1);v.seq(0,1);return onsets(v.seconds(.4)[0],1500);};
 const straight=run(.5),shuffled=run(.667);
 expect(straight[1]-straight[0]).toBeCloseTo(6000,-1);
 expect(shuffled[1]-shuffled[0]).toBeCloseTo(8000,-2);
});

test('the tempo parameter sets the step length',()=>{
 for(const bpm of [90,150]){
  const v=machine(8);v.k.syn_param(TEMPO,bpm);step(v,0,8,0);step(v,0,8,1);v.seq(0,1);
  const at=onsets(v.seconds(.6)[0],1000);
  expect(Math.abs(at[1]-at[0]-48000*60/(bpm*4))).toBeLessThanOrEqual(3);
 }
});

test('accent steps hit harder and a stopped machine plays nothing',()=>{
 const run=accent=>{const v=machine(8);v.k.syn_param(TEMPO,100);step(v,0,5,0);if(accent)step(v,0,16,0,3);v.seq(0,1);return peak(v.seconds(.3)[0]);};
 expect(run(true)).toBeGreaterThan(run(false)*1.25);
 const v=machine(8);step(v,0,0,0);expect(peak(v.seconds(.3)[0])).toBe(0);
 v.seq(0,1);v.seconds(.05);v.seq(0,0);v.seconds(3);const tail=v.seconds(1)[0];
 expect(onsets(tail,500,5e-3).length).toBe(0);
});

test('a new pattern waits for the bar line; a chain walks its patterns in order',()=>{
 const v=machine(8);v.k.syn_param(TEMPO,240); // a bar is 16 * 3000 frames = 1 s
 step(v,0,8,0);step(v,1,0,0); // pattern A: rim on 1; pattern B: kick on 1
 v.seq(0,1);v.seconds(.2);
 v.seq(2,1);                       // queue B in the middle of bar 1
 const bar1rest=v.seconds(.7)[0];  // up to just before the bar line
 expect(peak(bar1rest)).toBeLessThan(.02);
 const bar2=v.seconds(.4)[0];
 expect(peak(bar2)).toBeGreaterThan(.3);
 // chain A, A, B
 const c=machine(8);c.k.syn_param(TEMPO,240);step(c,0,8,0);step(c,1,0,0);
 c.seq(3,0,0);c.seq(3,1,0);c.seq(3,2,1);c.seq(4,3);c.seq(0,1);
 const [l]=c.seconds(3.05);
 const bars=[0,1,2].map(i=>l.subarray(i*48000,i*48000+12000));
 const lowEnergy=b=>{let s=0;for(let i=1;i<b.length;i++)s+=Math.abs(b[i]-b[i-1]);return rms(b)/(s/b.length+1e-9);};
 expect(lowEnergy(bars[2])).toBeGreaterThan(lowEnergy(bars[0])*3); // the kick bar is far less bright than the rim bars
});

test('the closed hat chokes the open hat',()=>{
 const tail=close=>{const v=machine(8);v.k.syn_note_on(1,36+14,1);v.seconds(.05);if(close)v.k.syn_note_on(2,36+15,1);v.seconds(.06);return rms(v.seconds(.1)[0]);};
 expect(tail(true)).toBeLessThan(tail(false)*.25);
});

test('every track of every kit is finite, bounded and decays; piano keys play the pads',()=>{
 for(const [model,count] of [[8,16],[9,11],[10,7]])for(let t=0;t<count;t++){
  const v=machine(model);v.k.syn_note_on(1,36+t,1);v.k.syn_note_on(2,36+24+t,.3);
  const [l,r]=v.seconds(3);
  for(const x of [...l,...r])if(!Number.isFinite(x))throw Error(`non-finite on ${model} track ${t}`);
  expect(peak(l)).toBeGreaterThan(.05);expect(peak(l)).toBeLessThan(1.2);
  expect(rms(l.subarray(l.length-4800))).toBeLessThan(.02); // everything has all but died within three seconds (the cymbals ring longest)
 }
});

test('level and decay knobs act per track; the kit survives a sample-rate change',()=>{
 const base=machine(8);base.k.syn_note_on(1,36,1);const a=peak(base.seconds(.3)[0]);
 const half=machine(8,[[LEVEL(0),.4]]);half.k.syn_note_on(1,36,1);expect(peak(half.seconds(.3)[0])).toBeLessThan(a*.65);
 const tail=d=>{const v=machine(8,[[DECAY(0),d]]);v.k.syn_note_on(1,36,1);v.seconds(.4);return rms(v.seconds(.2)[0]);};
 expect(tail(.9)).toBeGreaterThan(tail(.2)*2.5);
 for(const sr of [44100,96000]){const v=machine(8,[],sr);v.k.syn_note_on(1,36,1);const [l]=v.seconds(.5);expect(peak(l)).toBeGreaterThan(.2);}
});

test('808 kick: low, with a falling pitch; 909 kick is punchier',()=>{
 const run=model=>{const v=machine(model);v.k.syn_note_on(1,36,1);return v.seconds(.6)[0];};
 const crossRate=(x,a,b)=>{let c=0;for(let i=a+1;i<b;i++)if(x[i-1]<0&&x[i]>=0)c++;return c/((b-a)/48000);};
 const k8=run(8);
 expect(crossRate(k8,48*2,48*14)).toBeGreaterThan(crossRate(k8,48*200,48*350)*1.3); // the start is higher than the tail
 expect(crossRate(k8,48*200,48*350)).toBeGreaterThan(40);expect(crossRate(k8,48*200,48*350)).toBeLessThan(70);
 expect(peak(run(9))).toBeGreaterThan(.3);
});

test('a flam is a quiet grace note before the beat; the gap follows the Flam knob',()=>{
 const run=(value,flam=.5)=>{const v=machine(8);v.k.syn_param(TEMPO,120);v.k.syn_param(FLAM,flam);step(v,0,8,0,value);v.seq(0,1);return v.seconds(.3)[0];};
 const first=x=>x.findIndex(a=>Math.abs(a)>1e-3);
 const plain=run(1);expect(Math.abs(first(plain)-LOOK)).toBeLessThanOrEqual(4);   // the beat itself
 const gap=knob=>LOOK-first(run(2,knob));
 expect(gap(0)).toBeGreaterThan(48000*.009);expect(gap(1)).toBeLessThan(48000*.046);expect(gap(1)).toBeGreaterThan(gap(0)+600);
 const x=run(2);const g=first(x);
 expect(peak(x.subarray(g,g+200))).toBeLessThan(peak(x.subarray(LOOK,LOOK+400))*.7);   // grace is quieter
 expect(peak(x.subarray(LOOK,LOOK+400))).toBeGreaterThan(.2);                         // and the hit lands on the beat
});

test('accent steps have three strengths',()=>{
 const run=level=>{const v=machine(8,[]);v.k.syn_param(129,1);v.k.syn_param(TEMPO,100);step(v,0,5,0);if(level)step(v,0,16,0,level);v.seq(0,1);return peak(v.seconds(.3)[0]);};
 const [none,one,two,three]=[0,1,2,3].map(run);
 expect(one).toBeGreaterThan(none*1.1);expect(two).toBeGreaterThan(one*1.05);expect(three).toBeGreaterThan(two*1.05);
});

test('accent respects every drum level, including a muted track',()=>{
 for(const [model,count]of [[8,16],[9,11],[10,7]])for(let track=0;track<count;track++){
  const v=machine(model,[[LEVEL(track),0],[ACCENT,1]]);step(v,0,track,0);step(v,0,16,0,3);v.seq(0,1);
  expect(peak(v.seconds(.15)[0]),`model ${model}, track ${track}`).toBe(0);
 }
});

test('centre-position kicks have the short per-machine decay measured against the Roland demo targets',()=>{
 // T20 is measured from 5 ms RMS bins, relative to each hit's peak. This verifies
 // sustain rather than comparing absolute recording volume or oscillator phase.
 for(const sr of [44100,48000,96000])for(const [model,lo,hi]of [[8,.52,.78],[9,.12,.23],[10,.055,.13]]){
  const v=machine(model,[],sr);v.k.syn_note_on(1,36,1);const [x]=v.seconds(1.5),hop=Math.round(sr*.005),bins=[];
  for(let i=0;i+hop<=x.length;i+=hop)bins.push(rms(x.subarray(i,i+hop)));
  const threshold=Math.max(...bins)*.1,last=bins.findLastIndex(x=>x>=threshold),t20=(last+.5)*hop/sr;
  expect(t20,`model ${model} at ${sr} Hz`).toBeGreaterThan(lo);expect(t20).toBeLessThan(hi);
 }
});

test('Deep retains the original long kick independently of the other drum settings',()=>{
 for(const [model,lo,hi]of [[8,1,1.25],[9,.9,1.2],[10,.45,.62]]){
  const v=machine(model,[[133,1]]);v.k.syn_note_on(1,36,1);const [x]=v.seconds(1.5),bins=[];
  for(let i=0;i+240<=x.length;i+=240)bins.push(rms(x.subarray(i,i+240)));
  const threshold=Math.max(...bins)*.1,t20=(bins.findLastIndex(v=>v>=threshold)+.5)*.005;
  expect(t20).toBeGreaterThan(lo);expect(t20).toBeLessThan(hi);
  const snare=mode=>{const v=machine(model,[[133,mode]]);v.k.syn_note_on(1,37,1);return v.seconds(.3)[0];};
  expect(snare(1)).toEqual(snare(0));
 }
});

test('each pattern has its own length and its own tempo',()=>{
 const v=machine(8);v.k.syn_param(TEMPO,120);step(v,0,8,0);
 v.seq(5,4,0);                         // pattern A: four steps (one beat)
 v.seq(0,1);
 const at=onsets(v.seconds(1.1)[0],1000);
 expect(at.length).toBeGreaterThanOrEqual(3);expect(Math.abs(at[1]-at[0]-24000)).toBeLessThanOrEqual(6); // 4 steps of 6000 frames at 120 bpm
 const w=machine(8);w.k.syn_param(TEMPO,120);step(w,0,8,0);w.seq(8,0,240); // pattern A at 240 bpm whatever the global tempo
 w.seq(5,4,0);w.seq(0,1);
 const fast=onsets(w.seconds(.6)[0],1000);
 expect(Math.abs(fast[1]-fast[0]-12000)).toBeLessThanOrEqual(6); // 4 steps of 3000 frames at 240 bpm
});
