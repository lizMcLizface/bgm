// @vitest-environment node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {it,expect,describe} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch} from '../../public/modular-audio/runtime.js';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const fixture=JSON.parse(fs.readFileSync('public/modular-audio/sidechain-patch.json'));
const clone=p=>JSON.parse(JSON.stringify(p));
const engine=()=>new WebAssembly.Instance(module,{}).exports;
function run(p,rate=48000,block=113,total=48000){const g=new ReferenceGraph(engine(),p,contracts,rate),out=[new Float32Array(total),new Float32Array(total)];try{for(let at=0;at<total;){const n=Math.min(block,total-at);g.render(n);out[0].set(g.left.subarray(0,n),at);out[1].set(g.right.subarray(0,n),at);at+=n;}return {out,meters:g.meters(),stats:g.stats()};}finally{g.dispose();}}
function keyed(){const p=clone(fixture);p.modules=p.modules.filter(n=>[11,13,14,16].includes(n.id));p.connections=p.connections.filter(e=>[21,23].includes(e.id));p.connections.push({id:26,kind:'audio',from:{module:14,port:'audio.out'},to:{module:16,port:'program.in'}});p.events=p.events.filter(e=>e.kind!=='connection');p.modules.find(n=>n.id===14).parameters.keyMode=1;return p;}
const set=(p,id,key,value)=>p.modules.find(n=>n.id===id).parameters[key]=value;
const magnitude=(out,i)=>Math.hypot(out[0][i],out[1][i]);
describe('owned percussion and real kick sidechain',()=>{
 it('preserves all 27 original legacy PCM goldens, including reordered bookings and stealing',()=>{expect(execFileSync(process.execPath,['tools/auditPercussionOwned.mjs'],{encoding:'utf8'})).toContain('27 exact');},30000);
 it.each([44100,48000,96000])('replays saved key automation identically across partitions at %i Hz',rate=>{
  const saved=loadPatch(savePatch(fixture,contracts),contracts),a=run(fixture,rate,127),b=run(saved,rate,511);expect(a.out).toEqual(b.out);expect(a.stats).toEqual({frame:48000,late:0,overflow:0,applied:7});expect(a.out[1][37]).not.toBe(0);expect(a.out[0].every(Number.isFinite)).toBe(true);
 });
 it('ducks only the program and applies the same gain to both channels',()=>{
  const p=keyed(),a=run(p);expect(magnitude(a.out,10000)).toBeLessThan(.075);
  for(const i of [4011,5000,8000,10001,13001]){const phase=i*220/48000*Math.PI*2;expect(Math.abs(a.out[0][i]*Math.cos(phase)-a.out[1][i]*Math.sin(phase))).toBeLessThan(4e-8);}
  p.events=p.events.filter(e=>e.kind!=='gate');expect(run(p).out.every(ch=>ch.every(v=>v===0))).toBe(true);
 });
 it('takes kick after mute, before solo/fader, with explicit Ghost',()=>{
  const p=keyed(),normal=run(p).out;set(p,13,'gain',2);expect(run(p).out).toEqual(normal);set(p,13,'soloExcluded',1);expect(run(p).out).toEqual(normal);
  set(p,13,'mute',1);const muted=run(p);expect(magnitude(muted.out,10000)).toBeCloseTo(.2,6);set(p,13,'ghost',1);expect(run(p).out).toEqual(normal);
 });
 it('distinguishes absent and silent keys, and Auto uses connection state',()=>{
  const p=keyed();p.events=p.events.filter(e=>e.kind!=='hit');set(p,14,'keyMode',2);const silent=run(p);expect(magnitude(silent.out,10000)).toBeCloseTo(.2,6);expect(silent.meters[14]).toMatchObject({missingKey:0,externalKey:1});
  p.connections=p.connections.filter(e=>e.id!==23);const automatic=run(p);expect(automatic.meters[14].externalKey).toBe(0);expect(magnitude(automatic.out,10000)).toBeLessThan(.1);
  set(p,14,'keyMode',1);const absent=run(p);expect(absent.meters[14]).toMatchObject({missingKey:1,externalKey:1});expect(magnitude(absent.out,10000)).toBeCloseTo(.2,6);
 });
 it('releases safely when disconnected at the exact event sample',()=>{
  const p=keyed();p.events=p.events.filter(e=>e.kind!=='hit'||e.frame===4003);p.events.push({frame:12013,target:14,owner:1,kind:'connection',edge:23,value:false});
  const reference=run(keyed()).out,actual=run(p);expect(actual.out[0].slice(0,12013)).toEqual(reference[0].slice(0,12013));expect(actual.meters[14].missingKey).toBe(1);
  expect(magnitude(actual.out,40000)).toBeGreaterThan(magnitude(actual.out,13000));
 });
 it('exposes only actual kick voices on the separate tap',()=>{
  const p=keyed();p.modules=p.modules.filter(n=>[13,16].includes(n.id));p.connections=[{id:1,kind:'audio',from:{module:13,port:'kick.out'},to:{module:16,port:'program.in'}}];p.events=p.events.filter(e=>e.kind==='hit').map(e=>({...e,drum:1}));
  expect(run(p).out.every(ch=>ch.every(v=>v===0))).toBe(true);p.events[0].drum=0;expect(run(p).out[0].some(v=>v!==0)).toBe(true);
 });
 it('modulates the real engine output at audio rate while leaving its key pre-fader',()=>{
  const p=clone(fixture);p.modules=p.modules.filter(n=>[12,13,16].includes(n.id));p.connections=p.connections.filter(e=>e.kind==='modulation');p.connections.push({id:1,kind:'audio',from:{module:13,port:'audio.out'},to:{module:16,port:'program.in'}});p.events=p.events.filter(e=>e.kind==='hit');
  const modulated=run(p).out;p.connections=p.connections.filter(e=>e.kind==='audio');const dry=run(p).out;
  for(const i of [4023,5001,10003,16021])for(let ch=0;ch<2;ch++){const ratio=(.15+.1*(Math.sin(i*2/48000*Math.PI*2)+1)/2)/.15;expect(Math.abs(modulated[ch][i]-dry[ch][i]*ratio)).toBeLessThan(8e-8);}
 });
 it('keeps two real synth handles independent and cancels only the owner',()=>{
  const p=keyed();p.modules=p.modules.filter(n=>[13,16].includes(n.id));p.connections=[{id:1,kind:'audio',from:{module:13,port:'audio.out'},to:{module:16,port:'program.in'}}];p.events=p.events.filter(e=>e.kind==='hit');
  const e=engine();expect(e.init).toBeUndefined();const a=new ReferenceGraph(e,p,contracts,48000),silent=clone(p);silent.events=[];const b=new ReferenceGraph(e,silent,contracts,48000);a.refresh();
  try{for(let i=0;i<40;i++){a.render(128);b.render(128);}expect(a.left.some(v=>v!==0)).toBe(true);expect(b.left.every(v=>v===0)).toBe(true);a.cancel(2);for(let i=0;i<10;i++)a.render(128);expect(a.left.every(v=>v===0)).toBe(true);a.reset();a.render(128);expect(a.left.every(v=>v===0)).toBe(true);}finally{a.dispose();b.dispose();}
 });
 it('validates boolean/key-mode parameters, key cycles and illegal connection edits',()=>{
  const p=keyed();set(p,14,'keyMode',.5);expect(()=>new ReferenceGraph(engine(),p,contracts,48000)).toThrow('parameter');set(p,14,'keyMode',1);p.events.push({frame:10,target:14,owner:1,kind:'connection',edge:21,value:false});expect(()=>savePatch(p,contracts)).toThrow('event');
  p.events.pop();p.connections.find(e=>e.id===23).from={module:14,port:'audio.out'};expect(()=>savePatch(p,contracts)).toThrow('cycle');
 });
});
