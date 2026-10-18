// @vitest-environment node
import fs from 'node:fs';
import {RECIPES,clonePatch,parameterTriples} from './patch';
import {FM_RECIPES,cloneFM,fmPacket} from './fmPatch';
import {behaviorFixture} from './behaviorFixtures';
import {renderSpectralKernel} from './spectralEngine';
const modules=Object.fromEntries(['core','fm'].map(k=>[k,new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${k}.wasm`))]));
function render(kind,rate,quality,glide,handoff,midi=64,{clean=false,velocity=.65}={}){
 const fm=kind==='fm',p=fm?cloneFM(FM_RECIPES[7]):clonePatch(RECIPES[1]),e=new WebAssembly.Instance(modules[kind],{}).exports,api=fm?'fm':'engine';e[api+'_init'](rate);
 if(clean){if(fm){Object.assign(p.global,{feedback:0,vibrato:0,index:0});p.routes=p.routes.map(r=>r.map(()=>0));p.carriers=[1,0,0,0,0,0];for(const op of p.operators)Object.assign(op,{wave:0,ratio:1,attack:.02,decay1:.01,breakpoint:1,decay2:.01,sustain:1,velocity:1,keyScale:0,rateScale:0});}else{Object.assign(p.global,{model:0,chorus:0});Object.assign(p.layers[0],{waveA:1,waveB:0,levelB:0,cutoff:16000,filterAmount:0,velocityTone:0,velocityAmp:1,drift:0,attack:.02,decay:.01,sustain:1});}}
 if(fm){p.global.quality=quality;const packet=fmPacket(p);for(const t of packet.globals)e.fm_param(...t);for(const t of packet.operators)e.fm_op(...t);for(const t of packet.routes)e.fm_route(...t);for(const t of packet.carriers)e.fm_carrier(...t);}else for(const t of parameterTriples(p))e.engine_param(...t);
 const at=Math.round(.305*rate);e[api+'_event'](6,2,0,glide,0);e[api+'_event'](0,1,0,60,.65);
 if(handoff)e[api+'_event'](0,2,at,midi,velocity);else e[api+'_event'](5,1,at,midi,glide);
 const count=Math.round(rate*.7),out=new Float32Array(count);for(let i=0;i<count;i+=128){const n=Math.min(128,count-i);e[api+'_render'](n);out.set(new Float32Array(e.memory.buffer,fm?e.fm_output(0):e.engine_left(),n),i);}return out;
}
for(const kind of ['core','fm'])test(kind+': legato handoff matches a continuous held-ID glide without an extra output transient',()=>{
 for(const rate of [44100,48000,96000])for(const quality of kind==='fm'?[0,1,2]:[0])for(const [glide,midi]of [[.18,64],[0,60]]){
  const expected=render(kind,rate,quality,glide,false,midi),actual=render(kind,rate,quality,glide,true,midi);let difference=0;for(let i=0;i<actual.length;i++)difference=Math.max(difference,Math.abs(actual[i]-expected[i]));expect(difference,`${kind}/${rate}/${quality}/${glide}`).toBe(0);
 }
});
for(const kind of ['core','fm'])test(kind+': a legato velocity change reaches its new level without an attack impulse',()=>{
 const rms=x=>Math.sqrt(x.reduce((sum,x)=>sum+x*x,0)/x.length),step=(a,lo,hi)=>{let peak=0;for(let i=lo;i<hi;i++)peak=Math.max(peak,Math.abs(a[i]-a[i-1]));return peak;};
 for(const rate of [44100,48000,96000]){const steady=render(kind,rate,1,0,false,60,{clean:true}),changed=render(kind,rate,1,0,true,60,{clean:true,velocity:.25}),at=Math.round(rate*.305);
  expect(step(changed,at,at+Math.round(rate*.01))).toBeLessThan(step(steady,at-2000,at)*1.1);expect(rms(changed.slice(Math.round(rate*.55)))/rms(steady.slice(Math.round(rate*.55)))).toBeCloseTo(.25/.65,1);
 }
});
test('the complete hollow-reed overlap passage equals two continuously retuned phrases',()=>{
 for(const rate of [44100,48000,96000]){
  const f=behaviorFixture({sound:'reed',example:'overlap',rate}),row=f.rows[2],setup=[6,2,0,.18,0],reference=[];
  f.notes.forEach((n,i)=>{const id=Math.floor(i/8)*8+1,at=Math.round(n.time*rate);reference.push(i%8===0?[0,id,at,n.midi,n.velocity]:[5,id,at,n.midi,.18]);if(i%8===7)reference.push([1,id,Math.round((n.time+n.duration)*rate),0,0]);});
  const run=events=>renderSpectralKernel(modules.fm,{kind:'fm',patch:row.patch,notes:[],events:[setup,...events],seconds:f.seconds},rate,1),a=run(row.events),b=run(reference);let difference=0;
  for(let ch=0;ch<2;ch++)for(let i=0;i<a[ch].length;i++)difference=Math.max(difference,Math.abs(a[ch][i]-b[ch][i]));expect(difference,String(rate)).toBe(0);
 }
});
