// @vitest-environment node
import {renderString} from '../app/engine/pluckedString';
import {renderPiano,renderPianoBody} from '../app/engine/piano';
import {PROCEDURAL_RECIPES,proceduralPatch} from './proceduralPatch';
import {bufferDescriptors} from './proceduralBuffers';
import {sourceConfig,sourcePlan} from './sourcePlan';

// Two cascaded high-pass sections: compare attack brightness independently of gain.
function attackEnergy(data,rate){
 let a=0,b=0,high=0,total=0;const alpha=1-Math.exp(-2*Math.PI*3000/rate),count=Math.round(rate*.08);
 for(let i=0;i<count;i++){a+=alpha*(data[i]-a);b+=alpha*(a-b);high+=(data[i]-2*a+b)**2;total+=data[i]**2;}
 return {relativeHigh:high/total,rms:Math.sqrt(total/count)};
}
function pitch(data,rate,target){
 const start=Math.round(rate*.2),size=Math.round(rate*.3),center=rate/target,lo=Math.floor(center*.97),hi=Math.ceil(center*1.03);
 const corr=lag=>{let sum=0,a=0,b=0;for(let i=start;i<start+size;i++){sum+=data[i]*data[i+lag];a+=data[i]**2;b+=data[i+lag]**2;}return sum/Math.sqrt(a*b);};
 let best=lo;for(let lag=lo+1;lag<=hi;lag++)if(corr(lag)>corr(best))best=lag;
 const left=corr(best-1),mid=corr(best),right=corr(best+1);return rate/(best+.5*(left-right)/(left-2*mid+right));
}
test('rounded string contact reduces upper-band attack without losing tuning or note length',()=>{
 for(const rate of [44100,48000,96000])for(const p of PROCEDURAL_RECIPES.filter(p=>p.family==='pluck')){
  const freq=p.string.bodyType==='bass'?65.406:220,original=renderString(rate,freq,{...p.string,softness:0}),rounded=renderString(rate,freq,p.string);
  expect(rounded.length).toBe(original.length);let peak=0;for(const x of rounded){if(!Number.isFinite(x))throw Error('Non-finite string');peak=Math.max(peak,Math.abs(x));}
  expect(peak).toBeLessThanOrEqual(.701);expect(attackEnergy(rounded,rate).relativeHigh).toBeLessThan(attackEnergy(original,rate).relativeHigh*.15);
  expect(attackEnergy(rounded,rate).rms).toBeGreaterThan(.05);expect(Math.abs(1200*Math.log2(pitch(rounded,rate,freq)/freq)),`${p.name}/${rate}`).toBeLessThan(5);
 }
});
test('softer piano contact reduces the absolute strike edge while leaving held body unchanged',()=>{
 for(const rate of [44100,48000,96000])for(const p of PROCEDURAL_RECIPES.filter(p=>p.family==='piano')){
  const rounded=renderPiano(rate,523.251,p.piano),original=renderPiano(rate,523.251,{...p.piano,softness:0}),a=attackEnergy(original,rate),b=attackEnergy(rounded,rate);
  expect(rounded.length).toBe(original.length);expect(b.relativeHigh*b.rms**2).toBeLessThan(a.relativeHigh*a.rms**2);expect(b.rms).toBeGreaterThan(a.rms*.85);
  expect(renderPianoBody(rate,523.251,p.piano)).toEqual(renderPianoBody(rate,523.251,{...p.piano,softness:0}));
 }
});
test('omitted contact softness preserves old defaults and cached bodies share only the sustained PCM',()=>{
 for(const render of [renderString,renderPiano])expect(render(24000,220,{decay:.5})).toEqual(render(24000,220,{decay:.5,softness:0}));
 const p=PROCEDURAL_RECIPES[0],note={midi:60,velocity:.7},warm=bufferDescriptors(p,note,48000),old=bufferDescriptors({...p,piano:{...p.piano,softness:0}},note,48000);
 expect(warm[0].key).not.toEqual(old[0].key);expect(warm[1]).toEqual(old[1]);
 const string=PROCEDURAL_RECIPES[2];expect(bufferDescriptors(string,note,48000)[0].key).not.toEqual(bufferDescriptors({...string,string:{...string.string,softness:0}},note,48000)[0].key);
 expect(proceduralPatch('pluck').string.softness).toBe(0);
});
test('the URL attack comparison only changes contact and is retained in source plans',()=>{
 expect(sourceConfig().attack).toBe('rounded');expect(sourceConfig({attack:'original'}).attack).toBe('original');expect(sourceConfig({attack:'invalid'}).attack).toBe('rounded');
 for(const sound of ['felt','electric','held','guitar','harp','bass','mixed']){
  const a=sourcePlan({sound,attack:'rounded'}),b=sourcePlan({sound,attack:'original'});expect(b.config.attack).toBe('original');
  expect(a.parts.map(p=>p.notes)).toEqual(b.parts.map(p=>p.notes));
  for(let i=0;i<a.parts.length;i++)if(a.parts[i].kind==='procedural'){
   const warm=structuredClone(a.parts[i].patch),old=b.parts[i].patch;expect(old.string.softness).toBe(0);expect(old.piano.softness).toBe(0);
   warm.string.softness=0;warm.piano.softness=0;expect(warm).toEqual(old);
  }
 }
});
