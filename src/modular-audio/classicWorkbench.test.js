// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {compileWorkbenchSource,compileWorkbenchSet,compileWorkbenchAudition} from './workbenchPlan';
import {ReferenceGraph,savePatch,loadPatch} from './runtime';
import {SYNTHS} from '../synths/models';
import {CLASSIC_STACK_ALLOCATION} from './classicCompiler';
import {clonePatch,RECIPES} from '../synth-lab/patch';
import {kit} from '../../tools/percussionKitCases.mjs';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
const single=(model=1)=>{const synth=Object.values(SYNTHS).find(s=>s.model===model);return {kind:'classic',patch:{version:1,model,parameters:(synth.params.toEnginePairs??synth.params.toPairs)(synth.presets[0].values),polyphony:8,controls:[],tailSeconds:2}};};
const stack=(count=4)=>({kind:'classic-composite',patch:{version:1,allocation:CLASSIC_STACK_ALLOCATION,slots:Array.from({length:count},()=>single(4).patch)}});
const project=()=>({bars:1,stepsPerBar:16,seed:4,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns:{lead:{mode:'note',follow:'off',length:16,steps:[{n:[48,52,55,60,64].map(midi=>({midi})),len:4,vel:.6},...Array(15).fill(null)]},bass:{mode:'note',follow:'off',length:16,steps:[{n:[{midi:36}],len:4,vel:.6},...Array(15).fill(null)]},perc:{mode:'drums',length:16,steps:[{hits:[{drum:0,velocity:.5,duration:1}]}]}}});
const base=()=>({project:project(),part:{startBar:0,bars:1},bpm:120});
it('compiles an unchanged captured classic score and tuned audition on the public graph',()=>{
 const c={...base(),role:'bass',source:single(),tune:midi=>midi+.25},before=JSON.stringify(c),a=compileWorkbenchSource(c),b=compileWorkbenchAudition({...base(),sources:[{role:'lead',source:single(),tune:midi=>midi+.25}]});
 expect(a.graph.modules[0]).toMatchObject({type:'legacy.classic',config:{model:1,polyphony:8}});expect(a.graph.events[0]).toMatchObject({kind:'classic',event:0,id:1,a:36.25,frame:6000});expect(b.graph.events.find(e=>e.event===0).a).toBe(72.25);expect(JSON.stringify(c)).toBe(before);
 const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),g=new ReferenceGraph(new WebAssembly.Instance(module,{}).exports,loadPatch(savePatch(a.graph,contracts),contracts),contracts,48000);let peak=0;
 try{for(let at=0;at<a.endFrame;at+=509){const n=Math.min(509,a.endFrame-at);g.render(n);for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(g.left[i]),Math.abs(g.right[i]));}expect(peak).toBeGreaterThan(.001);expect(g.stats()).toMatchObject({applied:a.graph.events.length,late:0,overflow:0});}finally{g.dispose();}
});
it('reserves ordinary role IDs and drum6 while allocating four mono slots only to free pitched buses',()=>{
 const c={...base(),sources:[{role:'bass',source:single()},{role:'lead',source:stack()},{role:'perc',source:{kind:'percussion',kit:kit('hand',false),hitBase:0}}]},before=JSON.stringify(c),p=compileWorkbenchSet(c);
 expect(p.sources.map(s=>[s.role,s.slot,s.sourceId])).toEqual([['bass',undefined,5],['lead',0,1],['lead',1,2],['lead',2,3],['lead',3,4],['perc',undefined,6]]);expect(p.sources.filter(s=>s.role==='lead').map(s=>s.noteCount)).toEqual([2,1,1,1]);expect(p.graph.modules.filter(m=>m.type==='legacy.classic')).toHaveLength(5);expect(p.graph.events.every(e=>e.owner===e.target&&e.target>=1&&e.target<=6)).toBe(true);expect(p.endFrame).toBeLessThanOrEqual(120*48000);expect(JSON.stringify(c)).toBe(before);
 const audition=compileWorkbenchAudition(c);expect(audition.sources.filter(s=>s.role==='lead')).toHaveLength(4);expect(audition.audition.songUnchanged).toBe(true);
});
it('rejects composite sets that exhaust physical pitched buses before producing a route',()=>{
 const ordinary={kind:'subtractive',patch:clonePatch(RECIPES[0])};expect(()=>compileWorkbenchSet({...base(),sources:[{role:'lead',source:stack()},{role:'bass',source:single()},{role:'counter',source:ordinary}]})).toThrow('physical source buses');
 expect(()=>compileWorkbenchSource({...base(),role:'lead',source:stack(6)})).toThrow('five pitched');const long=single();long.patch.tailSeconds=120;expect(()=>compileWorkbenchSource({...base(),role:'lead',source:long})).toThrow('120 seconds');
});
it('delivers all six physical composite/classic/drum stems exactly through the real worker protocol',async()=>{
 const c={...base(),sources:[{role:'lead',source:stack()},{role:'bass',source:single()},{role:'perc',source:{kind:'percussion',kit:kit('hand',false),hitBase:0}}]},plan=compileWorkbenchSet(c),module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
 const singles=plan.sources.map(s=>{const m=plan.graph.modules.find(m=>m.id===s.sourceId),graph={version:1,modules:[m,{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:m.id,port:'audio.out'},to:{module:18,port:'program.in'}}],events:plan.graph.events.filter(e=>e.target===s.sourceId)};return {id:s.sourceId,g:new ReferenceGraph(new WebAssembly.Instance(module,{}).exports,graph,contracts,48000,512)};});
 const worker=new BrowserThreadWorker(),link=new MessageChannel();let frame=0,error=0,timer;const peaks=Array(6).fill(0);
 try{const stats=await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Classic composite worker timeout')),30000);worker.onerror=reject;worker.onmessage=({data:d})=>{if(d.type==='error')reject(Error(d.message));if(d.type==='stats')resolve(d);};
  link.port2.onmessage=({data:b})=>{try{if(b.type!=='block')return;expect(b.frame).toBe(frame);const pcm=new Float32Array(b.buffer);for(const {id,g}of singles){g.render(b.n);for(let i=0;i<b.n;i++)for(let ch=0;ch<2;ch++){const v=pcm[((id-1)*b.n+i)*2+ch],expected=ch?g.right[i]:g.left[i];error=Math.max(error,Math.abs(v-expected));peaks[id-1]=Math.max(peaks[id-1],Math.abs(v));}}frame+=b.n;link.port2.postMessage({type:'recycle',generation:91,slot:b.slot,buffer:b.buffer},[b.buffer]);if(frame===plan.endFrame)worker.postMessage({type:'stats',generation:91,request:1});}catch(e){reject(e);}};
  worker.postMessage({type:'init',module,contracts,patch:plan.graph,sourceIds:plan.sources.map(s=>s.sourceId),rate:48000,endFrame:plan.endFrame,options:{blockFrames:512,poolBlocks:12,generation:91,scheduling:'message'},port:link.port1},[link.port1]);
 });expect(error).toBe(0);expect(peaks.every(p=>p>.001)).toBe(true);expect(stats).toMatchObject({frame:plan.endFrame,badRecycles:0,graph:{applied:plan.graph.events.length,late:0,overflow:0}});expect(stats.roles).toHaveLength(6);
 }finally{clearTimeout(timer);worker.terminate();link.port2.close();for(const s of singles)s.g.dispose();}
},45000);
