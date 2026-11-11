// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from './runtime';
import {SYNTHS} from '../synths/models';
import {builtinWaves} from '../synths/vs/waves';
import {packWaves,DEFAULT_WAVES} from '../synths/wt/waves';
const wasm=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
// Prefer the preserved pre-owned baseline during migration; a clean checkout
// still verifies the independent published native legacy ABI, never Graph19 twice.
const referencePath=process.env.CLASSIC_REFERENCE_WASM??(fs.existsSync('.tmp/classics-before-owned.wasm')?'.tmp/classics-before-owned.wasm':'public/synths/classics.wasm');
const original=new WebAssembly.Module(fs.readFileSync(referencePath));
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const synths=Object.values(SYNTHS).filter(s=>Number.isInteger(s.model)).sort((a,b)=>a.model-b.model);
const exports=()=>new WebAssembly.Instance(wasm,{}).exports;
function config(model,polyphony=8){const s=synths.find(s=>s.model===model),p=s.presets[0];return {version:1,model,polyphony,parameters:(s.params.toEnginePairs??s.params.toPairs)(p.values),...(model===7?{waves:Array.from(builtinWaves())}:model===12?{waves:Array.from(packWaves(p.waves??DEFAULT_WAVES))}:{})};}
const event=(event,id,a=0,b=0,frame=37,owner=1,target=1)=>({kind:'classic',target,owner,event,id,a,b,frame});
const schedule=model=>[event(0,1,model>=8&&model!==11&&model!==12?36:60.25,.7),event(3,1,.35,0,777),event(2,0,.15,0,1003),event(0,2,model>=8&&model!==11&&model!==12?38:67,.5,1079),event(1,1,0,0,4017),event(1,2,0,0,5001),event(5,200,.1,0,6011)];
function patch(c,events=schedule(c.model),unrelated=false){return {version:1,modules:[{id:1,type:'legacy.classic',version:1,parameters:{gain:1},config:c},...(unrelated?[{id:9,type:'ref.tone',version:1,parameters:{}}]:[]),{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:[...events,...(unrelated?[13,41,129,1783,4001,7000].map((frame,i)=>({kind:'gate',target:9,owner:99,value:i%2===0,frame})):[])]};}
function render(g,total,blocks=[1,37,203,127,11,509]){const out=new Float32Array(total*2);let at=0,step=0;while(at<total){const n=Math.min(total-at,blocks[step++%blocks.length]);g.render(n);for(let i=0;i<n;i++){out[(at+i)*2]=g.left[i];out[(at+i)*2+1]=g.right[i];}at+=n;}return out;}
function native(c,events,total){
 const e=new WebAssembly.Instance(original,{}).exports;expect(e.syn_init(48000,c.model)).toBe(1);
 if(c.waves){new Float32Array(e.memory.buffer,e.syn_wave_ptr(),c.waves.length).set(c.waves);e.syn_wave_commit();}for(const p of c.parameters)e.syn_param(...p);
 let pending=events.slice().sort((a,b)=>a.frame-b.frame),held=new Set(),at=0;const out=new Float32Array(total*2);
 function apply(v){switch(v.event){case 0:if(held.size>=c.polyphony){const id=held.values().next().value;e.syn_note_off(id);held.delete(id);}held.add(v.id);e.syn_note_on(v.id,v.a,v.b);break;case 1:held.delete(v.id);e.syn_note_off(v.id);break;case 2:e.syn_control(v.id,v.a);break;case 3:e.syn_pressure(v.id,v.a);break;case 4:pending=[];held.clear();e.syn_panic();break;case 5:e.syn_param(v.id,v.a);break;case 6:e.syn_seq(v.id,v.a,v.b);break;}}
 while(at<total){const end=Math.min(total,(Math.floor(at/128)+1)*128);while(at<end){while(pending.length&&pending[0].frame<=at)apply(pending.shift());const next=Math.min(end,pending[0]?.frame??end),n=next-at;e.syn_render(n);const left=new Float32Array(e.memory.buffer,e.syn_left(),n),right=new Float32Array(e.memory.buffer,e.syn_right(),n);for(let i=0;i<n;i++){out[(at+i)*2]=left[i];out[(at+i)*2+1]=right[i];}at=next;}}return out;
}
const exact=(a,b)=>{expect(a.length).toBe(b.length);let error=0;for(let i=0;i<a.length;i++)error=Math.max(error,Math.abs(a[i]-b[i]));expect(error).toBe(0);};

it.each(synths.map(s=>s.model))('keeps model%i exact against original canonical callbacks despite unrelated graph gates, odd blocks and saved/reloaded waves',model=>{
 const c=config(model),p=patch(c),saved=loadPatch(savePatch(p,contracts),contracts),g=new ReferenceGraph(exports(),saved,contracts,48000),h=new ReferenceGraph(exports(),patch(c,schedule(model),true),contracts,48000);
 try{const expected=native(c,schedule(model),8197),a=render(g,8197),b=render(h,8197,[2048]);exact(a,expected);exact(b,expected);expect(g.stats()).toMatchObject({frame:8197,applied:7,late:0,overflow:0});expect(g.pitchedStats(1)).toMatchObject({frame:8197,late:0,dropped:0,latencyFrames:0});g.reset();for(const e of p.events)g.enqueue(e);exact(render(g,8197,[113]),expected);}finally{g.dispose();h.dispose();}
});
it.each([1,2,8])('preserves actual host held-Set cap%i before native voice stealing',polyphony=>{
 for(const {model}of synths){const c=config(model,polyphony),drum=[8,9,10,13].includes(model),events=Array.from({length:12},(_,i)=>event(0,i+1,(drum?36:48)+i,.55,37+i*19));events.push(...Array.from({length:12},(_,i)=>event(1,i+1,0,0,4000+i*7)));const g=new ReferenceGraph(exports(),patch(c,events),contracts,48000);try{exact(render(g,7001),native(c,events,7001));}finally{g.dispose();}}
});
it('keeps graph handles independent in one memory and cancels only its owner including cached PCM',()=>{
 const e=exports(),p=patch(config(1),[event(0,1,60,.7),event(0,2,64,.6,4096)]),a=new ReferenceGraph(e,p,contracts,48000),b=new ReferenceGraph(e,p,contracts,48000),control=new ReferenceGraph(exports(),p,contracts,48000);a.refresh();b.refresh();
 try{exact(render(a,1025),render(b,1025));render(control,1025);a.cancel(999);exact(render(a,37),render(b,37));render(control,37);a.cancel(1);const muted=render(a,1000);expect(muted.every(v=>v===0)).toBe(true);exact(render(b,1000),render(control,1000));expect(a.stats().frame).toBe(2062);expect(a.engine.graph_pitch_stat(a.handle,1,11)).toBe(0);expect(a.engine.graph_pitch_stat(a.handle,1,13)).toBe(0);a.dispose();exact(render(b,3000),render(control,3000));}finally{a.dispose();b.dispose();control.dispose();}
});
it('clamps late bookings to the generated boundary, counts them and rejects another owner until reset',()=>{
 const g=new ReferenceGraph(exports(),patch(config(2),[]),contracts,48000);try{g.render(1);expect(g.engine.graph_pitch_stat(g.handle,1,8)).toBe(128);g.enqueue(event(0,1,60,.7,37));expect(g.stats().late).toBe(1);expect(g.pitchedStats(1).late).toBe(1);expect(()=>g.enqueue(event(0,2,64,.7,256,2))).toThrow();expect(g.engine.graph_pitch_stat(g.handle,1,11)).toBe(1);g.render(127);expect(g.stats().applied).toBe(0);g.render(1);expect(g.stats().applied).toBe(1);g.reset();g.enqueue(event(0,1,60,.7,37,2));expect(g.engine.graph_pitch_stat(g.handle,1,12)).toBe(2);}finally{g.dispose();}
});
it('mirrors timed native panic clearing into the graph queue and preserves later fresh bookings',()=>{
 const events=[event(0,1,60,.7),event(4,0,0,0,777),event(0,2,64,.7,1003)],g=new ReferenceGraph(exports(),patch(config(1),events),contracts,48000);try{exact(render(g,2048),native(config(1),events,2048));expect(g.stats().applied).toBe(2);expect(g.engine.graph_pitch_stat(g.handle,1,11)).toBe(0);g.enqueue(event(0,3,67,.7,2176));g.render(256);expect(g.stats().applied).toBe(3);}finally{g.dispose();}
});
it('rejects malformed model/parameters/owner contracts and bounds prebooked queues without partial graph insertion',()=>{
 for(const edit of [p=>p.modules[0].config.model=14,p=>p.modules[0].config.parameters=[[179,1]],p=>p.modules[0].config.polyphony=0,p=>p.events.push(event(0,9,60,.7,256,2)),p=>p.events.push(event(6,0,1,0,256))]){const p=patch(config(1));edit(p);expect(()=>validatePatch(p,contracts)).toThrow();}
 const g=new ReferenceGraph(exports(),patch(config(1),[]),contracts,48000);try{for(let i=0;i<4000;i++)g.enqueue(event(2,2,.2,0,10000+i));expect(()=>g.enqueue(event(2,2,.2,0,20000))).toThrow();expect(g.engine.graph_pitch_stat(g.handle,1,11)).toBe(4000);expect(g.stats().overflow).toBe(0);expect(g.engine.graph_pitch_stat(g.handle,1,10)).toBe(1);g.cancel(1);expect(g.engine.graph_pitch_stat(g.handle,1,11)).toBe(0);g.render(2048);expect(g.stats().applied).toBe(0);}finally{g.dispose();}
});
it('preflights a full global graph queue before claiming a classic owner or prebooking its source queue',()=>{
 const p=patch(config(1),[],true);p.events=[];const g=new ReferenceGraph(exports(),p,contracts,48000);try{for(let i=0;i<4096;i++)g.enqueue({kind:'gate',frame:10000+i,target:9,owner:99,value:i%2===0});expect(()=>g.enqueue(event(0,1,60,.7,5000))).toThrow();expect(g.engine.graph_pitch_stat(g.handle,1,11)).toBe(0);expect(g.engine.graph_pitch_stat(g.handle,1,12)).toBe(0);expect(g.stats().overflow).toBe(1);g.cancel(99);g.enqueue(event(0,1,60,.7,37,2));expect(g.engine.graph_pitch_stat(g.handle,1,12)).toBe(2);}finally{g.dispose();}
});
