// @vitest-environment node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {OwnedRackFx,ownedRackFxSpec,RACK_FX_PARAMETERS} from './ownedRackFx';
import {OwnedVoiceFx,ownedVoiceFxSpec,VOICE_FX_PARAMETERS} from './ownedVoiceFx';
import {verifyWorker} from './workerVerification';
import {sixSourceDag} from './pitchedFixture';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
const graphModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),rackModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/rack-fx.wasm')),voiceModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/voice-fx.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const kinds=['crusher','pitch','zplane','shimmer','freeze'],voice=kind=>kind==='shimmer'||kind==='freeze',type=kind=>`${voice(kind)?'voice':'rack'}.${kind}`,descriptors=kind=>(voice(kind)?VOICE_FX_PARAMETERS:RACK_FX_PARAMETERS)[kind],tick=(seconds,rate)=>Math.ceil(seconds*rate/128)*128;
const spec=kind=>voice(kind)?ownedVoiceFxSpec(kind,kind==='freeze'?{mix:.7123456789123,length:.25123456789,fade:.12123456789}:{mix:.4123456789123,decay:2.123456789,climb:.39123456789,tone:6100.123456789},531):ownedRackFxSpec(kind,kind==='crusher'?{bits:5.123456789,divide:7.123456789,mix:.7123456789}:kind==='pitch'?{semitones:7.123456789,cents:-13.123456789,mix:.6123456789}:{a:12,b:3,morph:.37123456789,q:.6123456789,mix:.8123456789});
const control=(kind,rate)=>kind==='freeze'?[[tick(.4,rate),'hold',1],[tick(.75,rate),'hold',0],[tick(.9,rate),'length',.30123456789],[tick(.9,rate),'hold',1]]:kind==='shimmer'?[[128,'climb',.27123456789],[256,'decay',3.123456789],[384,'tone',5100.123456789]]:kind==='zplane'?[[128,'a',5],[256,'morph',.7123456789],[384,'b',12]]:kind==='crusher'?[[128,'bits',9.123456789],[256,'divide',3.123456789],[384,'mix',.3123456789]]:[[128,'semitones',-5.123456789],[256,'cents',31.123456789],[384,'mix',.4123456789]];
const patch=(kind,config=spec(kind),events=[])=>({version:1,modules:[{id:1,type:'host.audio',version:1,parameters:{}},{id:9,type:'ref.tone',version:1,parameters:{}},{id:10,type:type(kind),version:1,parameters:{},config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:10,port:'program.in'}},{id:2,kind:'audio',from:{module:10,port:'audio.out'},to:{module:18,port:'program.in'}}],events:[{kind:'gate',target:9,owner:91,frame:13,value:true},{kind:'gate',target:9,owner:91,frame:41,value:false},...events]});
const make=(p,rate=48000,e=new WebAssembly.Instance(graphModule,{}).exports)=>new ReferenceGraph(e,p,contracts,rate,512);
const signal=(frame,ch,rate,kind)=>frame<rate*(kind==='freeze'?1.1:.2)?Math.fround(.13*Math.sin(frame*(.013+ch*.006))+.035*Math.cos(frame*.041+ch)):0;
function render(g,kind,total,rate,cadence=[1,37,509,113,203,127]){const out=[new Float32Array(total),new Float32Array(total)];for(let frame=0,call=0;frame<total;call++){const n=Math.min(total-frame,cadence[call%cadence.length]),input=g.inputs.get(1);for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++)input[i*2+ch]=signal(frame+i,ch,rate,kind);g.render(n);out[0].set(g.left.subarray(0,n),frame);out[1].set(g.right.subarray(0,n),frame);frame+=n;}return out;}
const pcmHash=pcm=>crypto.createHash('sha256').update(Buffer.concat(pcm.map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)))).digest('hex');
function reference(kind,config,events,total,rate){const e=new WebAssembly.Instance(voice(kind)?voiceModule:rackModule,{}).exports,d=new (voice(kind)?OwnedVoiceFx:OwnedRackFx)(e,config,rate),out=[new Float32Array(total),new Float32Array(total)];try{for(let frame=0;frame<total;frame+=128){for(const [at,name,value]of events)if(at===frame)d.patch([[descriptors(kind).findIndex(p=>p[0]===name),value]]);for(let ch=0;ch<2;ch++)for(let i=0;i<128;i++)d.input[ch][i]=signal(frame+i,ch,rate,kind);d.render(128);if(frame+128<total)for(let ch=0;ch<2;ch++)out[ch].set(d.output[ch].subarray(0,128),frame+128);}return out;}finally{d.dispose();}}
it.each(kinds.flatMap(kind=>[44100,48000,96000].map(rate=>[kind,rate])))('preserves actual owned %s DSP at %i Hz with canonical latency, f64 controls and foreign event splits', (kind,rate)=>{
  const config=spec(kind),edits=control(kind,rate),events=edits.map(([frame,parameter,value])=>({kind:'parameter',frame,target:10,owner:77,parameter,value})),p=loadPatch(savePatch(patch(kind,config,events),contracts),contracts),g=make(p,rate),total=tick(kind==='freeze'?1.25:.7,rate)+128;
  try{
    for(const [index,value]of config.parameters)expect(g.baseValue(10,descriptors(kind)[index][0])).toBe(value);
    const actual=render(g,kind,total,rate),expected=reference(kind,config,edits,total,rate);expect(pcmHash(actual)).toBe(pcmHash(expected));expect(actual[0].some(value=>value!==0)).toBe(true);expect(g.latency(10)).toBe(128);expect(g.latency(18)).toBe(128);expect(g.effectStats(10)).toMatchObject({latencyFrames:128,phase:0,frame:total});
    for(const [,name]of edits)expect(g.baseValue(10,name)).toBe(edits.filter(e=>e[1]===name).at(-1)[2]);expect(g.stats()).toMatchObject({late:0,overflow:0,applied:events.length+2});
  }finally{g.dispose();}
});
it.each(kinds)('retains %s exact latest targets through partial-block reset, independent handles and fresh save/reload',kind=>{
  const config=spec(kind),p=patch(kind,config,[]),e=new WebAssembly.Instance(graphModule,{}).exports,a=make(p,48000,e),b=make(loadPatch(savePatch(p,contracts),contracts),48000,e);a.refresh();b.refresh();try{
    expect(pcmHash(render(a,kind,503,48000))).toBe(pcmHash(render(b,kind,503,48000)));const index=kind==='crusher'?2:0,name=descriptors(kind)[index][0],value=.34567891234567;
    a.enqueue({kind:'parameter',target:10,owner:77,parameter:name,value,frame:0});render(a,kind,10,48000);expect(a.baseValue(10,name)).toBe(value);expect(a.stats().late).toBe(1);expect(b.baseValue(10,name)).toBe(config.parameters.find(p=>p[0]===index)[1]);const otherFrame=b.stats().frame;
    a.reset();expect(a.baseValue(10,name)).toBe(value);expect(a.effectStats(10)).toMatchObject({phase:0,frame:0});expect(b.stats().frame).toBe(otherFrame);
    const latest=structuredClone(config);latest.parameters=latest.parameters.map(([i,v])=>[i,i===index?value:v]);const restored=make(loadPatch(savePatch(patch(kind,latest,[]),contracts),contracts));try{expect(pcmHash(render(a,kind,8192,48000))).toBe(pcmHash(render(restored,kind,8192,48000)));}finally{restored.dispose();}
  }finally{a.dispose();b.dispose();}
});
it('enforces exact control boundaries and immutable complete configuration, including custom ZPlane rows',()=>{
  const p=patch('zplane'),bad=structuredClone(p);bad.modules.find(n=>n.id===10).config.custom.a.pop();expect(()=>validatePatch(bad,contracts)).toThrow('shapes');const missing=patch('shimmer');missing.modules.find(n=>n.id===10).config.parameters.pop();expect(()=>validatePatch(missing,contracts)).toThrow('configuration');
  const mismatched=patch('pitch');mismatched.modules.find(n=>n.id===10).config.kind='crusher';expect(()=>validatePatch(mismatched,contracts)).toThrow();const parameter=patch('crusher');parameter.modules.find(n=>n.id===10).parameters.mix=.5;expect(()=>validatePatch(parameter,contracts)).toThrow('complete');
  const g=make(p);try{expect(g.engine.graph_rack_shape_row(g.handle,10,64,0,100,100,1)).not.toBe(0);expect(()=>g.enqueue({kind:'parameter',target:10,owner:77,frame:13,parameter:'morph',value:.5})).toThrow('128-frame');}finally{g.dispose();}
  const freeze=patch('freeze');freeze.events.push({kind:'parameter',target:10,owner:77,frame:128,parameter:'hold',value:.5});expect(()=>validatePatch(freeze,contracts)).toThrow('Freeze hold');
});
it.each(kinds)('raw %s ABI cannot bypass the complete initial target/configuration contract',kind=>{
  const e=new WebAssembly.Instance(graphModule,{}).exports,g=e.graph_new(48000,512),d=contracts.modules.find(d=>d.type===type(kind)),host=contracts.modules.find(d=>d.type==='host.audio'),output=contracts.modules.find(d=>d.type==='ref.output');try{
    expect(e.graph_node(g,1,host.code,1)).toBe(0);expect(e.graph_node(g,10,d.code,1)).toBe(0);expect(e.graph_node(g,18,output.code,1)).toBe(0);expect(e.graph_audio_port(g,1,1,0,10,0)).toBe(0);expect(e.graph_audio_port(g,2,10,1,18,0)).toBe(0);
    expect(e.graph_base(g,10,0,.5)).not.toBe(0);if(voice(kind))expect(e.graph_voice_fx_config(g,10,531)).toBe(0);const [index,value]=spec(kind).parameters[0];expect(e.graph_fx_initial(g,10,index,value)).toBe(0);expect(e.graph_fx_initial(g,10,index,value)).not.toBe(0);expect(e.graph_prepare(g)).not.toBe(0);
  }finally{e.graph_free(g);}
});
it('executes seeded Freeze in an actual dedicated worker while keeping serial realtime capability guards separate',async()=>{
  const original=globalThis.MessageChannel;globalThis.MessageChannel=MessageChannel;const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),rate=48000,p=sixSourceDag(fixture,rate),config=spec('freeze');p.modules.push({id:71,type:'voice.freeze',version:1,parameters:{},config});p.connections.find(e=>e.to.module===18).from.module=71;p.connections.push({id:101,kind:'audio',from:{module:17,port:'audio.out'},to:{module:71,port:'program.in'}});p.events.push(...control('freeze',rate).map(([frame,parameter,value])=>({kind:'parameter',target:71,owner:77,frame,parameter,value})));
  try{const result=await verifyWorker({fixture,contracts,modules:{graph:graphModule}},rate,{patch:loadPatch(savePatch(p,contracts),contracts),seconds:1.25,options:{blockFrames:512,poolBlocks:4,scheduling:'message'},makeWorker:()=>new BrowserThreadWorker()});expect(result.pass).toBe(true);expect(result.sameCadenceMaxAbs).toBe(0);expect(result.nonFinite).toBe(0);}finally{globalThis.MessageChannel=original;}
},30000);
