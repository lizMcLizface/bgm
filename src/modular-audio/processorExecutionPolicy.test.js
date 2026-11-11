// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {it,expect,vi} from 'vitest';
import {ReferenceGraph} from './runtime';
import {assertSerialRealtimeAllowed} from './executionPolicy';
import {workerOptions,WorkerPcmQueue,sourceViews,graphSnapshot,sourceSelection} from './workerProtocol';
import {AlignedSourcePool} from './poolProtocol';
import {ProcessTiming} from './processTiming';
import {sixSourceDag} from './pitchedFixture';
import {planSourcePool} from './poolPlan';
import {ownedVoiceFxSpec} from './ownedVoiceFx';
const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const freezePatch={version:1,modules:[{id:1,type:'host.audio',version:1,parameters:{}},{id:42,type:'voice.freeze',version:1,parameters:{},config:ownedVoiceFxSpec('freeze',{mix:.7,length:.25},531)},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:42,port:'program.in'}},{id:2,kind:'audio',from:{module:42,port:'audio.out'},to:{module:18,port:'program.in'}}],events:[]};
const cases=[
  ['reference','public/modular-audio/processor.js',{}],
  ['DAG sources','public/modular-audio/dag-sources-processor.js',{endFrame:128,roles:fixture.parts.map(p=>p.role)}],
  ['ensemble bridge','public/modular-audio/ensemble-bridge-processor.js',{endFrame:128,mode:'percussion',sourceId:6}],
  ['serial worker output','src/modular-audio/workerOutputProcessor.js',{endFrame:128,mode:'serial',options:{}}],
  ['dependent pool master','src/modular-audio/poolOutputProcessor.js',{endFrame:128,options:{},groups:[[1,5],[2,3],[4,6]]}],
];
function actualClass(file,{wasm=WebAssembly}={}){
  let Type;const messages=[],context=vm.createContext({WebAssembly:wasm,ReferenceGraph,assertSerialRealtimeAllowed,workerOptions,WorkerPcmQueue,sourceViews,graphSnapshot,sourceSelection,AlignedSourcePool,ProcessTiming,sampleRate:48000,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close:vi.fn()};}},registerProcessor:(_name,C)=>Type=C});
  // Imports are supplied explicitly; the constructor/process bodies are the
  // actual checked-in processors, not a rewritten substitute implementation.
  vm.runInContext(fs.readFileSync(file,'utf8').replace(/^import[^;]+;\s*$/gm,''),context);return {Type,messages};
}
it.each(cases)('%s constructor rejects Freeze and descriptor-marked worker-only DSP before instantiating Wasm',(_name,file,options)=>{
  expect(contracts.modules.find(d=>d.type==='voice.freeze').execution).toBe('worker-only');
  for(const [patch,descriptors]of [[freezePatch,contracts],[{modules:[{id:42,type:'voice.freeze',version:1}]},{modules:[]}],[{modules:[{id:42,type:'future.heavy',version:2}]},{modules:[{type:'future.heavy',version:2,execution:'worker-only'}]}]]){
    const Instance=vi.fn(()=>{throw Error('Wasm must not be instantiated');}),{Type,messages}=actualClass(file,{wasm:{Instance}}),p=new Type({processorOptions:{...options,patch,contracts:descriptors,module}});expect(p.stopped).toBe(true);expect(Instance).not.toHaveBeenCalled();expect(messages).toHaveLength(1);expect(messages[0]).toMatchObject({type:'error',message:expect.stringMatching(/Worker executor required/)});expect(p.process([],[[new Float32Array(128),new Float32Array(128)]])).toBe(false);
  }
});
it.each(cases)('%s retains successful ordinary realtime preparation',(_name,file,options)=>{
  const patch=sixSourceDag(fixture,48000),master=file.includes('poolOutput'),{Type,messages}=actualClass(file),p=new Type({processorOptions:{...options,patch:master?planSourcePool(patch,contracts).master:patch,contracts,module}});try{expect(messages.some(d=>d.type==='error')).toBe(false);expect(messages.some(d=>d.type==='ready')).toBe(true);expect(p.stopped).toBe(false);}finally{p.port.onmessage({data:{type:'dispose'}});}
});
it('worker output permits worker-only DSP when it consumes worker PCM instead of running serial DSP',()=>{
  const Instance=vi.fn(()=>{throw Error('No local DSP');}),{Type,messages}=actualClass('src/modular-audio/workerOutputProcessor.js',{wasm:{Instance}}),p=new Type({processorOptions:{endFrame:128,mode:'worker',startPaused:true,options:{},patch:{modules:[{id:42,type:'voice.freeze',version:1}]},contracts:{modules:[]}}});try{expect(messages[0].type).toBe('ready');expect(p.stopped).toBe(false);expect(Instance).not.toHaveBeenCalled();expect(p.process([],Array.from({length:8},()=>[new Float32Array(128),new Float32Array(128)]))).toBe(true);}finally{p.port.onmessage({data:{type:'dispose'}});}
});
