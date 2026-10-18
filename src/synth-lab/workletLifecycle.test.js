// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {initialPatch,parameterTriples} from './patch';
import {initialFM,fmPacket} from './fmPatch';
import {defaultEffects,effectTriples} from './effectsConfig';
import {insertsPacket} from './insertsConfig';

function processor(kind,offline=true,invalid=false,auditStats=false){
 const messages=[];let Processor;
 class Base {constructor(){this.port={onmessage:null,closed:false,postMessage:m=>messages.push(m),close(){this.closed=true;}};}}
 const file=kind==='core'?'processor.js':kind==='fm'?'fm-processor.js':kind==='inserts'?'inserts-processor.js':'effects-processor.js';
 vm.runInNewContext(fs.readFileSync('public/synth-lab/patch-transition.js','utf8').replace(/export /g,'')+';'+fs.readFileSync('public/synth-lab/'+file,'utf8').replace(/^import .*$/gm,''),{AudioWorkletProcessor:Base,WebAssembly,sampleRate:48000,currentFrame:0,registerProcessor:(_,type)=>{Processor=type;}});
 const module=invalid?{}:new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${kind}.wasm`));
 const options={module,offline,auditStats,stopFrame:256,endFrame:offline?256:null,events:[[0,1,0,69,.8]],parameters:kind==='core'?parameterTriples(initialPatch()):kind==='inserts'?insertsPacket({}):effectTriples(defaultEffects()),patch:fmPacket(initialFM())};
 return {instance:new Processor({processorOptions:options}),messages};
}
const output=()=>[[new Float32Array(128),new Float32Array(128)]];
const input=()=>Array.from({length:3},()=>[new Float32Array(128).fill(.1),new Float32Array(128).fill(.1)]);

test('offline worklets emit their final block then stop, close ports and release Wasm views',()=>{
 for(const kind of ['core','fm','effects','inserts']){
  const {instance:p}=processor(kind),last=output();expect(p.process(input(),output())).toBe(true);expect(p.process(input(),last)).toBe(false);
  expect([...last[0][0]].every(Number.isFinite)).toBe(true);expect([...last[0][0]].some(x=>Math.abs(x)>1e-8)).toBe(true);
  expect(p.port.closed).toBe(true);expect(p.port.onmessage).toBe(null);expect(p[kind==='core'?'engine':kind==='fm'?'fm':'fx']).toBe(null);
  expect(p.process(input(),output())).toBe(false);
 }
});

test('live worklets ignore offline deadlines and release resources on explicit disposal',()=>{
 for(const kind of ['core','fm','effects','inserts']){
  const {instance:p}=processor(kind,false);expect(p.process(input(),output())).toBe(true);expect(p.process(input(),output())).toBe(true);
  p.port.onmessage({data:{type:'dispose'}});expect(p.port.closed).toBe(true);expect(p.process(input(),output())).toBe(false);
 }
});

test('constructor failures report the actual cause and leave no half-initialized processor',()=>{
 for(const kind of ['core','fm','effects','inserts']){const {instance,messages}=processor(kind,true,true);expect(messages.some(m=>m.type==='error'&&m.message.includes('WebAssembly'))).toBe(true);expect(instance.port.closed).toBe(true);expect(instance.process(input(),output())).toBe(false);}
});
test('opt-in offline source telemetry reports final counters and sampled peak voices without changing PCM',()=>{
 for(const kind of ['core','fm']){const a=processor(kind),b=processor(kind,true,false,true);for(let i=0;i<2;i++){const x=output(),y=output();expect(a.instance.process([],x)).toBe(b.instance.process([],y));expect(y).toEqual(x);}const last=b.messages.find(m=>m.final);expect(last).toMatchObject({type:'stats',peakActive:1,steals:0,dropped:0,late:0});expect(last.memory).toBeGreaterThan(0);expect(a.messages.some(m=>m.final)).toBe(false);}
});
