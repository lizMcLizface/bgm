// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms} from './offline';
import {stageCurve,shapeRows,NATIVE_BEND,SHAPE_KEYS,envelopePoints,activeShape} from '../ui/envShape';
import * as juno from '../juno/params';
import * as prophet from '../prophet/params';
import * as jupiter from '../jupiter/params';
import * as minimoog from '../minimoog/params';
import * as obxa from '../obxa/params';
import * as cs80 from '../cs80/params';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const make=(model,params,values)=>createOfflineSynth(module,{model,params:params.toPairs(params.sanitize(values))});
// RMS of each 10 ms window of the left channel
const contour=(a,sr=48000)=>Array.from({length:Math.floor(a.length/(sr/100))},(_,i)=>rms(a.subarray(i*sr/100,(i+1)*sr/100)));
const custom=(env,{bend,smooth=[0,0,0],steps=0})=>{const k=SHAPE_KEYS[env];return {[k.mode]:1,...Object.fromEntries(k.bend.map((key,i)=>[key,bend[i]])),...Object.fromEntries(k.smooth.map((key,i)=>[key,smooth[i]])),[k.steps]:steps};};

test('stage curves run from 0 to 1, bend 0 is linear and the native bends match the analog envelope',()=>{
 for(const bend of [-1,-.3,0,.15,.5,1])for(const smooth of [0,.5,1])for(const steps of [0,4]){
  expect(stageCurve(0,bend,smooth,steps)).toBeCloseTo(0,5);expect(stageCurve(1,bend,smooth,steps)).toBeCloseTo(1,5);
  let last=-1;for(let i=0;i<=64;i++){const y=stageCurve(i/64,bend,smooth,steps);expect(y).toBeGreaterThanOrEqual(last-1e-6);last=y;}
 }
 expect(stageCurve(.3,0,0,0)).toBeCloseTo(.3,6);
 // RC charging towards 1.3, stopped at 1
 for(const x of [.2,.5,.8])expect(stageCurve(x,NATIVE_BEND.attack,0,0)).toBeCloseTo(1.3*(1-Math.exp(-1.466*x)),2);
 // smoothing makes an S: slow at both ends
 expect(stageCurve(.1,0,1,0)).toBeLessThan(.1);expect(stageCurve(.9,0,1,0)).toBeGreaterThan(.9);
 // hard steps hold flat, then smoothing rounds them back towards a ramp
 expect(stageCurve(.3,0,0,4)).toBeCloseTo(.25,2);expect(stageCurve(.45,0,0,4)).toBeCloseTo(.5,2);
 expect(stageCurve(.375,0,1,4)).toBeCloseTo(.375,3);
});

test('shape rows sit at ids 180–195 with the model as default and the native bends as the starting curve',()=>{
 const rows=[...shapeRows('amp'),...shapeRows('filter',{linearAttack:true})];
 expect(rows.map(r=>r[1])).toEqual(Array.from({length:16},(_,i)=>180+i));
 expect(rows[0][5]).toBe(0);expect(rows[8+1][5]).toBe(0);
 const shape=activeShape(juno.defaultValues(),'amp',juno.BY_KEY);
 expect(shape.custom).toBe(false);expect(shape.bend[0]).toBe(0);
 const pts=envelopePoints(shape,.6);expect(pts[0]).toEqual([0,0]);expect(pts.at(-1)[1]).toBeCloseTo(0,6);
});

test('every ADSR model plays the same with shapes on Model, and a custom attack bend changes the rise',()=>{
 const cases=[
  [MODELS.juno,juno,{attack:.4,decay:2,sustain:1,release:.1,chorus:0,reverbMix:0,spread:0,velVca:0},'amp'],
  [MODELS.prophet5,prophet,{aAttack:.4,aSustain:1,reverbMix:0,chorusMix:0},'amp'],
  [MODELS.jupiter8,jupiter,{e2Attack:.4,e2Sustain:1,reverbMix:0,chorusMix:0},'amp'],
  [MODELS.minimoog,minimoog,{aAttack:.4,aSustain:1,reverbMix:0,chorusMix:0},'amp'],
  [MODELS.obxa,obxa,{aAttack:.4,aSustain:1,reverbMix:0,chorusMix:0},'amp'],
  [MODELS.cs80,cs80,{'i.a':.4,'i.s':1,'ii.a':.4,'ii.s':1,reverbMix:0,chorusMix:0},'amp'],
 ];
 for(const [model,params,base,env] of cases){
  const play=values=>{const s=make(model,params,values);s.k.syn_note_on(1,57,.8);return contour(s.seconds(.6)[0]);};
  const plain=play(base),model0=play({...base,[SHAPE_KEYS[env].mode]:0,[SHAPE_KEYS[env].bend[0]]:-1});
  expect(model0).toEqual(plain);
  const slow=play({...base,...custom(env,{bend:[-1,.5,.5]})}),fast=play({...base,...custom(env,{bend:[1,.5,.5]})});
  // 100 ms into a 400 ms attack: a fast start is far ahead of a slow one
  expect(fast[10]).toBeGreaterThan(slow[10]*3);
  // both arrive at the same sustained level
  expect(Math.abs(fast[55]/slow[55]-1)).toBeLessThan(.05);
 }
});

test('a custom envelope with the native bends sounds like the model, and its release ends on time',()=>{
 const base={aAttack:.05,aDecay:.3,aSustain:.5,aRelease:.3,reverbMix:0,chorusMix:0};
 const play=values=>{const s=make(MODELS.prophet5,prophet,values);s.k.syn_note_on(1,57,.8);const held=s.seconds(.5)[0];s.k.syn_note_off(1);return [contour(held),contour(s.seconds(.5)[0])];};
 const [heldModel,relModel]=play(base);
 const [heldCustom,relCustom]=play({...base,...custom('amp',{bend:[NATIVE_BEND.attack,NATIVE_BEND.fall,NATIVE_BEND.fall]})});
 for(const i of [2,10,30,45])expect(Math.abs(heldCustom[i]/heldModel[i]-1)).toBeLessThan(.08);
 expect(relCustom[10]/relModel[10]).toBeGreaterThan(.85);
 // exactly silent after the release time; the native tail only fades
 expect(Math.max(...relCustom.slice(32))).toBeLessThan(1e-6);
});

test('the filter envelope takes its own shape, and steps quantise the sweep',()=>{
 const base={cutoff:200,fEnv:1,fAttack:.4,fSustain:1,aAttack:.001,aSustain:1,res:0,reverbMix:0,chorusMix:0};
 const play=values=>{const s=make(MODELS.prophet5,prophet,values);s.k.syn_note_on(1,45,.8);return contour(s.seconds(.5)[0]);};
 const slow=play({...base,...custom('filter',{bend:[-1,.5,.5]})}),fast=play({...base,...custom('filter',{bend:[1,.5,.5]})});
 expect(fast[12]).toBeGreaterThan(slow[12]*1.2);
 const stepped=play({...base,...custom('filter',{bend:[0,.5,.5],steps:4})});
 // inside a step the level holds; across a step edge it jumps
 const d=i=>Math.abs(stepped[i+1]-stepped[i]);
 expect(d(3)).toBeLessThan(d(4)+d(5)+d(14)+d(15));
});
