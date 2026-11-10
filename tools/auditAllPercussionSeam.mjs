// Pre-adapter boundary audit. Negative cases intentionally demonstrate the
// current configuration gap; they are not accepted All percussion previews.
// Revisit these expectations when a validated owned kit contract is added.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ReferenceGraph} from '../public/modular-audio/runtime.js';
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const graphModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const legacyModule=new WebAssembly.Module(fs.readFileSync('public/synth-lab/percussion.wasm'));
const total=48000,rate=48000;
const h={kind:'hit',frame:6000,target:6,owner:6,drum:0,velocity:.7,duration:.5,vary:.15,tone:0,decay:1,hit:11,model:0};
const digest=out=>crypto.createHash('sha256').update(Buffer.from(out[0].buffer)).update(Buffer.from(out[1].buffer)).digest('hex');
function legacy(event,{preset=0,level=1,tone=0,decay=1}={}){
 const e=new WebAssembly.Instance(legacyModule,{}).exports;e.init(rate);
 e.voice_preset(preset);for(let i=0;i<14;i++){e.level(i,level);e.tone_param(i,tone);e.decay_param(i,decay);}
 assert.equal(e.hit(event.drum,event.frame,event.duration,event.velocity,event.vary,event.tone,event.decay,event.hit,event.model),1);
 const v=new Float32Array(e.memory.buffer,e.output_ptr(),256),out=[new Float32Array(total),new Float32Array(total)];
 for(let at=0;at<total;){const n=Math.min(113,total-at);e.process(n);out[0].set(v.subarray(0,n),at);out[1].set(v.subarray(128,128+n),at);at+=n;}return out;
}
function graph(event,config){
 const p={version:1,modules:[{id:6,type:'legacy.percussion',version:1,parameters:{gain:1},...(config?{config}:{})},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:6,port:'audio.out'},to:{module:18,port:'program.in'}}],events:[event]};
 const g=new ReferenceGraph(new WebAssembly.Instance(graphModule,{}).exports,p,contracts,rate,512),out=[new Float32Array(total),new Float32Array(total)];
 try{for(let at=0;at<total;){const n=Math.min(509,total-at);g.render(n);out[0].set(g.left.subarray(0,n),at);out[1].set(g.right.subarray(0,n),at);at+=n;}assert.deepEqual(g.stats(),{frame:total,late:0,overflow:0,applied:1});return out;}finally{g.dispose();}
}
function result(name,l,g,expectedEqual){let peakLegacy=0,peakGraph=0,maxDifference=0;for(let ch=0;ch<2;ch++)for(let i=0;i<total;i++){assert(Number.isFinite(l[ch][i])&&Number.isFinite(g[ch][i]));peakLegacy=Math.max(peakLegacy,Math.abs(l[ch][i]));peakGraph=Math.max(peakGraph,Math.abs(g[ch][i]));maxDifference=Math.max(maxDifference,Math.abs(l[ch][i]-g[ch][i]));}const legacyHash=digest(l),graphHash=digest(g);assert.equal(legacyHash===graphHash,expectedEqual,name);return {name,expectedEqual,exactEqual:legacyHash===graphHash,legacyHash,graphHash,peakLegacy,peakGraph,maxDifference};}
const rows=[result('raw default kernel remains exact',legacy(h),graph(h),true),result('fixed Felt palette at unity resolves exactly',legacy(h,{preset:1}),graph(h),true),result('Crisp semantic kick needs punch-slot resolution',legacy(h,{preset:2}),graph(h),false),result('Crisp explicit punch slot resolves exactly',legacy(h,{preset:2}),graph({...h,drum:12}),true),result('Hand palette needs explicit model resolution',legacy(h,{preset:4}),graph(h),false),result('Hand explicit model resolves exactly',legacy(h,{preset:4}),graph({...h,model:2}),true),result('attaching unsupported kit config cannot carry levels',legacy(h,{preset:1,level:.25}),graph(h,{version:1,voicePreset:1,levels:Array(14).fill(.25)}),false)];
const report={kind:'all.percussion-seam.audit',version:1,checkedAtUtc:new Date().toISOString(),scope:'Node Wasm source PCM only; no native Web Audio, FX, browser, phone or adapter acceptance',rate,total,sourceModuleId:6,event:h,graphPercussionParameters:contracts.modules.find(m=>m.type==='legacy.percussion').parameters.map(p=>p.id),graphExports:WebAssembly.Module.exports(graphModule).filter(e=>/percussion|hit/.test(e.name)).map(e=>e.name),tests:rows,conclusion:'Current graph proves raw legacy kernels, but does not prepare selected palette or per-drum kit levels. Resolve semantic identity and add validated owned configuration before All integration; do not silently substitute.'};
fs.writeFileSync('reports/modular_audio/m4c-percussion-seam-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
