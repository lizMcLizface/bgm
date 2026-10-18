// @vitest-environment node
import fs from 'node:fs';
import {initialPatch,parameterTriples} from './patch';
import {initialFM,fmPacket} from './fmPatch';
import {sanitizeNoteBehavior,noteBehaviorEvent} from './noteBehavior';
const modules=Object.fromEntries(['core','fm'].map(k=>[k,new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${k}.wasm`))]));
function engine(kind,mode=2,portamento=0,glide='overlap',rate=48000){
 const e=new WebAssembly.Instance(modules[kind],{}).exports,fm=kind==='fm',api=fm?'fm':'engine';e[api+'_init'](rate);
 if(fm){const p=initialFM();Object.assign(p.global,{algorithm:3,operators:4,quality:1,feedback:0,index:0,gain:.3});p.carriers=[1,0,0,0,0,0];p.routes=p.routes.map(r=>r.map(()=>0));for(const op of p.operators)Object.assign(op,{ratio:1,level:1,attack:.1,decay1:.01,breakpoint:1,decay2:.01,sustain:1,release:.02,velocity:0});const packet=fmPacket(p);for(const t of packet.globals)e.fm_param(...t);for(const t of packet.operators)e.fm_op(...t);for(const t of packet.routes)e.fm_route(...t);for(const t of packet.carriers)e.fm_carrier(...t);}
 else{const p=initialPatch();Object.assign(p.global,{gain:.3,chorus:0});Object.assign(p.layers[0],{waveA:1,waveB:0,levelB:0,attack:.1,decay:.01,sustain:1,release:.02,cutoff:16000,filterAmount:0,velocityTone:0,drift:0});for(const t of parameterTriples(p))e.engine_param(...t);}
 const event=(...args)=>e[api+'_event'](...args),stat=i=>e[api+'_stat'](i);
 event(...noteBehaviorEvent({mode,portamento,glide}));
 const render=(frames,chunk=128)=>{const out=new Float32Array(frames);for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e[api+'_render'](n);out.set(new Float32Array(e.memory.buffer,fm?e.fm_output(0):e.engine_left(),n),at);}return out;};return {e,event,stat,render,rate};
}
const rms=x=>Math.sqrt(x.reduce((s,x)=>s+x*x,0)/x.length);
function hz(data,rate){const crossings=[];for(let i=1;i<data.length;i++)if(data[i-1]<0&&data[i]>=0)crossings.push(i-data[i]/(data[i]-data[i-1]));return (crossings.length-1)*rate/(crossings.at(-1)-crossings[0]);}
for(const kind of ['core','fm']){
 test(kind+': last-key priority, stale releases, repeated pitches and bounded held-key overflow',()=>{
  const x=engine(kind);x.event(0,1,0,57,.7);x.event(0,2,12000,69,.7);x.render(15000);expect(x.stat(0)).toBe(1);expect(hz(x.render(4000),x.rate)).toBeCloseTo(440,0);
  x.event(1,2,19000,0,0);x.render(3000);expect(hz(x.render(4000),x.rate)).toBeCloseTo(220,0);x.event(1,999,26000,0,0);x.render(2000);expect(x.stat(0)).toBe(1);
  for(let i=3;i<=40;i++)x.event(0,i,28000,57,.7);x.event(1,1,28001,0,0);x.render(500);expect(x.stat(0)).toBe(1);for(let i=3;i<=40;i++)x.event(1,i,28500,0,0);x.render(5000);expect(x.stat(0)).toBe(0);
 });
 test(kind+': legato preserves the envelope and retrigger rearticulates overlapping notes',()=>{
  const run=mode=>{const x=engine(kind,mode);x.event(0,1,0,57,.7);x.event(0,2,12000,57,.7);return x.render(16000);};const legato=run(2),retrigger=run(1);expect(rms(legato.slice(13000,14000))).toBeGreaterThan(rms(retrigger.slice(13000,14000))*2);expect(run(0)).not.toEqual(legato);
 });
 test(kind+': sustain, panic and behavior changes cannot leave held or future notes behind',()=>{
  const x=engine(kind);x.event(0,1,0,57,.7);x.event(2,0,1000,1,0);x.event(1,1,2000,0,0);x.render(12000);expect(x.stat(0)).toBe(1);x.event(2,0,12000,0,0);x.render(6000);expect(x.stat(0)).toBe(0);
  x.event(0,2,19000,60,.7);x.event(0,3,200000,72,.7);x.render(5000);x.e[kind==='fm'?'fm_panic':'engine_panic']();expect(rms(x.render(220000))).toBe(0);expect(x.stat(0)).toBe(0);
  x.event(0,4,250000,57,.7);x.event(6,0,251000,0,0);x.event(0,5,252000,69,.7);x.render(30000);expect(x.stat(0)).toBe(1);expect(hz(x.render(4000),x.rate)).toBeCloseTo(440,0);
 });
 test(kind+': portamento reaches its pitch and remains sample-exact across chunk sizes',()=>{
  for(const rate of [44100,48000,96000]){const run=chunk=>{const x=engine(kind,2,.2,'overlap',rate);x.event(0,1,0,57,.7);x.event(0,2,Math.round(rate*.3),69,.7);return x.render(Math.round(rate*.7),chunk);},a=run(128);expect(run(257)).toEqual(a);expect(hz(a.slice(Math.round(rate*.57)),rate)).toBeCloseTo(440,0);const moving=hz(a.slice(Math.round(rate*.37),Math.round(rate*.41)),rate);expect(moving).toBeGreaterThan(260);expect(moving).toBeLessThan(360);}
 });
 test(kind+': overlap-only glide resets after a gap while all-note glide moves from the preceding pitch',()=>{
  const run=glide=>{const x=engine(kind,2,.3,glide);x.event(0,1,0,57,.7);x.event(1,1,12000,0,0);x.event(0,2,20000,69,.7);return x.render(32000);};const overlap=run('overlap'),always=run('always');expect(hz(overlap.slice(23000,25000),48000)).toBeCloseTo(440,0);expect(hz(always.slice(23000,25000),48000)).toBeLessThan(320);
 });
}
test('performance is an additive bounded patch field; earlier numeric parameter IDs are unchanged',()=>{
 expect(sanitizeNoteBehavior()).toEqual({mode:0,portamento:0,glide:'overlap'});expect(sanitizeNoteBehavior({mode:99,portamento:90,glide:'invalid'})).toEqual({mode:2,portamento:3,glide:'overlap'});expect(noteBehaviorEvent({mode:2,portamento:.2,glide:'always'},55)).toEqual([6,2,55,.2,1]);
});
test('FM retrigger restarts its pitch envelope while legato continues the current envelope age',()=>{
 const run=mode=>{const x=engine('fm',mode);x.e.fm_param(15,12);x.e.fm_param(16,.1);x.event(0,1,0,57,.7);x.event(0,2,14400,69,.7);return x.render(20000);};
 const retrigger=run(1),legato=run(2);expect(hz(retrigger.slice(15400,16400),48000)).toBeGreaterThan(620);expect(hz(legato.slice(15400,16400),48000)).toBeCloseTo(440,0);
 const fresh=engine('fm',1),continued=engine('fm',1);fresh.e.fm_op(0,13,1);continued.e.fm_op(0,13,1);fresh.event(0,1,0,81,.7);continued.event(0,1,0,57,.7);continued.event(0,2,14400,81,.7);
 const a=fresh.render(3000),b=continued.render(17400).slice(14400);expect(rms(b.slice(1000,2000))/rms(a.slice(1000,2000))).toBeCloseTo(1,2);
});
