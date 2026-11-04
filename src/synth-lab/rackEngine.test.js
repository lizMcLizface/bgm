// @vitest-environment node
// The parameters added to the inserts and effects kernels for the effects rack: stereo spread, chorus feedback, phaser stages
// (inserts); echo low cut, echo ducking and reverb type (effects). Their defaults must leave the earlier sound unchanged, which the
// existing kernel tests pin; these check that each new control does what it says.
import fs from 'node:fs';
import {renderInserts} from './inserts';
import {defaultEffects,effectTriples} from './effectsConfig';

const insertsModule=new WebAssembly.Module(fs.readFileSync('public/synth-lab/inserts.wasm'));
const effectsModule=new WebAssembly.Module(fs.readFileSync('public/synth-lab/effects.wasm'));
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/Math.max(1,x.length));
const sine=(rate,hz,seconds,amp=.2)=>Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/rate));
const diff=(a,b)=>rms(a.map((v,i)=>v-b[i]));

const inserts=(settings,input=sine(48000,440,.6))=>renderInserts(insertsModule,[input,input],48000,settings);

test('stereo spread sets how far apart the left and right modulations run; zero makes the sides identical',()=>{
 for(const [on,spread] of [[{phaser:.8,phaserFeedback:.4},'phaserSpread'],[{flanger:.8,flangerFeedback:.4},'flangerSpread'],[{chorus:.7},'chorusSpread']]){
  const wide=inserts({...on}),mono=inserts({...on,[spread]:0});
  expect(diff(wide[0],wide[1]),spread+' default is stereo').toBeGreaterThan(.002);
  expect(diff(mono[0],mono[1]),spread+' 0 is mono').toBe(0);
 }
});

test('the phaser stage count changes the sound, six is the earlier fixed value and the output stays bounded',()=>{
 const base=inserts({phaser:1,phaserFeedback:.5}),six=inserts({phaser:1,phaserFeedback:.5,phaserStages:6});
 expect(diff(base[0],six[0])).toBe(0);
 for(const stages of [2,4,8,12]){
  const out=inserts({phaser:1,phaserFeedback:.5,phaserStages:stages});
  expect(out[0].every(Number.isFinite)).toBe(true);expect(Math.max(...out[0].map(Math.abs))).toBeLessThan(2);
  if(stages!==6)expect(diff(out[0],six[0])).toBeGreaterThan(.001);
 }
});

test('chorus feedback adds repeats of the modulated signal',()=>{
 const none=inserts({chorus:.7}),fed=inserts({chorus:.7,chorusFeedback:.5});
 expect(diff(none[0],fed[0])).toBeGreaterThan(.002);
 expect(fed[0].every(Number.isFinite)).toBe(true);
});

function effects(settings,{seconds,sends=[],dry=null,rate=48000}){
 const e=new WebAssembly.Instance(effectsModule,{}).exports;e.fx_init(rate);
 for(const pair of effectTriples({...defaultEffects(),...settings}))e.fx_param(...pair);
 const n=Math.round(seconds*rate),left=new Float32Array(n),right=new Float32Array(n),inputs=Array.from({length:6},(_,c)=>new Float32Array(e.memory.buffer,e.fx_input(c),2048));
 for(let at=0;at<n;at+=128){
  const count=Math.min(128,n-at);
  inputs.forEach((x,c)=>{x.fill(0);const source=sends.includes(c)?sends.source:c<2&&dry?dry:null;if(source)for(let i=0;i<count;i++)x[i]=source[(at+i)%source.length]??0;});
  e.fx_render(count);
  left.set(new Float32Array(e.memory.buffer,e.fx_output(0),count),at);right.set(new Float32Array(e.memory.buffer,e.fx_output(1),count),at);
 }
 return [left,right];
}
const burst=(rate,hz,ms)=>{const b=sine(rate,hz,ms/1000,.3);const all=new Float32Array(rate*4);all.set(b);return all;};

test('the echo low cut thins the repeats: a low note fades faster through the feedback',()=>{
 const rate=48000,source=burst(rate,80,60);
 const run=(feedbackLow)=>effects({delay:.8,delayMs:100,feedback:.7,tone:14000,reverb:0,dry:0,feedbackLow},{seconds:1.4,sends:Object.assign([4,5],{source}),rate});
 const open=run(0),cut=run(500);
 const tail=(x)=>rms(x[0].slice(Math.round(rate*.7),Math.round(rate*1.3)));
 expect(tail(open)).toBeGreaterThan(.002);
 expect(tail(cut)).toBeLessThan(tail(open)*.5);
});

test('echo ducking lowers the echoes while the dry signal is loud, and leaves them alone at zero',()=>{
 const rate=48000,tone=sine(rate,440,1,.3);
 const run=(duck)=>effects({delay:.8,delayMs:120,feedback:.3,reverb:0,dry:0,duck},{seconds:1,sends:Object.assign([4,5],{source:tone}),dry:tone,rate});
 const plain=run(0),ducked=run(1);
 const level=(x)=>rms(x[0].slice(Math.round(rate*.4)));
 expect(level(plain)).toBeGreaterThan(.02);
 expect(level(ducked)).toBeLessThan(level(plain)*.35);
});

test('reverb types are four different rooms, and the plate has no early reflections',()=>{
 const rate=48000,impulse=new Float32Array(rate);impulse[0]=.25;
 const run=(reverbType)=>effects({reverb:.4,decay:3,reverbType,delay:0,dry:0},{seconds:2.5,sends:Object.assign([2,3],{source:impulse}),rate});
 const classic=run(0),room=run(1),hall=run(2),plate=run(3);
 const window=(x,from,to)=>rms(x[0].slice(Math.round(rate*from),Math.round(rate*to)));
 expect(diff(classic[0],room[0])).toBeGreaterThan(1e-4);
 expect(window(plate,.026,.09)).toBeLessThan(window(classic,.026,.09));
 for(const [a,b] of [[classic,hall],[classic,plate],[room,hall],[room,plate],[hall,plate]])expect(diff(a[0],b[0])).toBeGreaterThan(1e-4);
 for(const out of [classic,room,hall,plate])expect(out[0].every(Number.isFinite)).toBe(true);
});
