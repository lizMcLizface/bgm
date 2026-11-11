// @vitest-environment node
import fs from 'node:fs';import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {compilePluckedNotes} from './pluckedCompiler';
import {OwnedPluckedVoice} from './ownedPluckedVoice';
import {pianoFixture} from './pianoFixture';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),voiceModule=new WebAssembly.Module(fs.readFileSync('public/plucked-voice/voice.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const exports=()=>new WebAssembly.Instance(module,{}).exports;
function fixture(bodyType='guitar',control='none'){
 const source={patch:{version:1,voices:1,cutoff:7000,q:2,pitch:-100,pitchDecay:.2,frequencies:Array.from({length:128},(_,m)=>440*2**((m-69)/12)),settings:{bodyType,decay:.4,damping:.5,body:.6,resonance:1,position:.2,seed:42},gainEnv:{attack:.01,decay:.1,sustain:.6,release:.2,hold:0,holdLevel:1,attackShape:'linear',decayShape:'linear',releaseShape:'linear'},filterEnv:{attack:.02,decay:.1,release:.2,amount:600},controls:control==='none'?[]:['pitch','filter'].map((axis,i)=>({axis,kind:control,phase:.2,frequency:4,initialDepth:i?300:6,targetDepth:i?300:6,tau:0,points:control==='linear'?[[0,0],[.3,.5],[1,-.4],[120,.2]]:[]}))}},notes=[{midi:48,time:37/48000,duration:.5,velocity:.6,owner:1},{midi:60,time:1003/48000,duration:.5,velocity:.5,owner:2},{midi:67,time:.15,duration:.4,velocity:.7,owner:1}],c=compilePluckedNotes(source,notes);
 return {version:1,modules:[{id:1,type:'legacy.plucked',version:1,parameters:{gain:1},config:c.config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:c.events};
}
function pcm(g,total,blocks=[1,37,203,127,11,509]){const out=new Float32Array(total);for(let at=0,i=0;at<total;i++){const n=Math.min(blocks[i%blocks.length],total-at);g.render(n);out.set(g.left.subarray(0,n),at);at+=n;}return out;}
it.each(['guitar','harp','bass','kalimba'].flatMap(body=>['none','sine','linear'].map(control=>[body,control])))('keeps %s/%s plucked banks/controls exact across Graph events, partitions and saved replay', (body,control)=>{
 const p=fixture(body,control),saved=loadPatch(savePatch(p,contracts),contracts),e=exports(),g=new ReferenceGraph(e,saved,contracts,48000),other=structuredClone(p);other.modules.push({id:9,type:'ref.tone',version:1,parameters:{}});other.events.push(...[13,41,129,777,4017].map((frame,i)=>({kind:'gate',target:9,owner:99,value:i%2===0,frame})));const h=new ReferenceGraph(exports(),other,contracts,48000),native=new OwnedPluckedVoice(new WebAssembly.Instance(voiceModule,{}).exports,p.modules[0].config);
 try{const expected=pcm(native,64000,[113]),actual=pcm(g,64000);expect(actual).toEqual(expected);expect(pcm(h,64000,[2048])).toEqual(expected);expect(actual.some(v=>Math.abs(v)>.001)).toBe(true);expect(g.stats()).toMatchObject({frame:64000,applied:p.events.length,late:0,overflow:0});expect(g.pitchedStats(1)).toMatchObject({steals:2,frame:64000,latencyFrames:0});g.reset();for(const event of p.events)g.enqueue(event);expect(pcm(g,64000,[127])).toEqual(expected);}finally{g.dispose();h.dispose();native.dispose();}
});
it('keeps two Graph handles independent in one memory and cancels only matching current/future note owners',()=>{
 const p=fixture(),e=exports(),a=new ReferenceGraph(e,p,contracts,48000),b=new ReferenceGraph(e,p,contracts,48000),expected=new OwnedPluckedVoice(new WebAssembly.Instance(voiceModule,{}).exports,p.modules[0].config);a.refresh();b.refresh();
 try{const first=pcm(a,2048);expect(pcm(b,2048)).toEqual(first);expect(pcm(expected,2048)).toEqual(first);a.cancel(1);expected.cancel(1);expect(pcm(a,24000)).toEqual(pcm(expected,24000));const control=new ReferenceGraph(exports(),p,contracts,48000);try{pcm(control,2048);expect(pcm(b,24000)).toEqual(pcm(control,24000));a.dispose();expect(pcm(b,1024)).toEqual(pcm(control,1024));}finally{control.dispose();}}finally{a.dispose();b.dispose();expected.dispose();}
});
it.each(['plucked','piano-v3'])('rejects a late immutable %s onset before queue/stat mutation and remains renderable',kind=>{
 const p=kind==='plucked'?fixture():pianoFixture('electric',0,1),event=p.events[0];expect(p.modules[0].version).toBe(kind==='plucked'?1:3);p.events=[];const g=new ReferenceGraph(exports(),p,contracts,48000);
 try{g.render(128);const before=g.stats(),status=g.engine.graph_note(g.handle,event.frame,event.target,event.owner,event.event,event.note,event.a,event.b);expect(status).not.toBe(0);expect(g.stats()).toEqual(before);g.render(128);expect(g.stats()).toMatchObject({frame:256,late:0,applied:0,overflow:0});g.reset();g.enqueue(event);g.render(128);expect(g.stats()).toMatchObject({frame:128,applied:1,late:0});}finally{g.dispose();}
});
it.each(['plucked','piano-v3'])('rejects a duplicate same-owner future %s onset before changing queue statistics',kind=>{
 const p=kind==='plucked'?fixture():pianoFixture('electric',0,1),first=p.events[0],g=new ReferenceGraph(exports(),p,contracts,48000);try{const before=g.stats(),status=g.engine.graph_note(g.handle,first.frame,first.target,first.owner,first.event,first.note,first.a,first.b);expect(status).not.toBe(0);expect(g.stats()).toEqual(before);g.render(128);expect(g.stats()).toMatchObject({frame:128,applied:1,late:0,overflow:0});}finally{g.dispose();}
});
it('validates planned identity, timestamps, event kind and competing ownership before allocation/queue changes',()=>{
 for(const edit of [p=>p.modules[0].config.sampleRate=96000,p=>p.modules[0].config.voices=33,p=>p.modules[0].config.banks[0].bodyType='other',p=>p.events[0].frame++,p=>p.events[0].note=999,p=>p.events[0].event=1,p=>p.events.push({...p.events[0],owner:99})]){const p=fixture();edit(p);expect(()=>validatePatch(p,contracts)).toThrow();}
 const p=fixture();expect(()=>new ReferenceGraph(exports(),p,contracts,44100)).toThrow();const g=new ReferenceGraph(exports(),p,contracts,48000);try{expect(g.engine.graph_plucked_bank(g.handle,1,440,.5,.5,.2,.5,0,0,1,0)).not.toBe(0);expect(g.engine.graph_plucked_point(g.handle,1,1,0,0,1,0)).not.toBe(0);}finally{g.dispose();}
});
it('preflights immutable voice preparation and permits correcting an incomplete raw-ABI capture',()=>{
 const e=exports(),h=e.graph_new(48000,512),out=contracts.modules.find(m=>m.type==='ref.output'),type=contracts.modules.find(m=>m.type==='legacy.plucked'),success=v=>expect(v).toBe(0);try{
  success(e.graph_node(h,1,type.code,1));success(e.graph_node(h,18,out.code,1));success(e.graph_audio_port(h,1,1,0,18,0));success(e.graph_plucked_config(h,1,1,11000,0,0,.2));success(e.graph_plucked_bank(h,1,440,.5,.5,.2,.5,0,0,1,0));success(e.graph_plucked_spec(h,1,1,0,69,.6));expect(e.graph_prepare(h)).not.toBe(0);
  success(e.graph_plucked_point(h,1,1,0,0,0,0));success(e.graph_plucked_point(h,1,1,0,100,.6,0));success(e.graph_plucked_point(h,1,1,0,1000,0,0));success(e.graph_plucked_point(h,1,1,1,0,0,0));success(e.graph_plucked_lifetime(h,1,1,0,37,-1,1000));success(e.graph_prepare(h));success(e.graph_note(h,37,1,1,0,1,69,.6));success(e.graph_render(h,128));expect(e.graph_stat(h,3)).toBe(1);
 }finally{e.graph_free(h);}
});
