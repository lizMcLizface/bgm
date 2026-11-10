// Shared source-PCM audit material, never substituted into the workbench.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ReferenceGraph} from '../public/modular-audio/runtime.js';
export const voices=['felt','crisp','tr808','hand'];
export const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
export const graphModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const legacyModule=new WebAssembly.Module(fs.readFileSync('public/synth-lab/percussion.wasm'));
export function kit(voice='felt',edited=true){return {version:1,voice,drums:Array.from({length:14},(_,i)=>({on:!edited||i%6!==2,level:edited?(i===7?0:.15+i%5*.35):1,tone:edited?(i%5-2)*.45:0,decay:edited?.5+i%4*.5:1}))};}
export function hits(rate,reordered=false){
 const drums=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,5,4,5,13];
 const h=drums.map((drum,i)=>({kind:'hit',target:6,owner:6,frame:Math.round(rate*(.125+i*.027)),drum,velocity:.35+i%5*.13,duration:drum===5?3:.5,vary:(i%3-1)*.35,tone:.7,decay:.65,hit:101+i,model:2}));
 // Receive order remains meaningful for ties/stealing. Do not sort it for DSP.
 h[15].frame=h[14].frame+7;h[17].frame=h[16].frame;
 return reordered?[...h.filter((_,i)=>i%2),...h.filter((_,i)=>!(i%2))]:h;
}
export function patch(config,events){return {version:1,modules:[{id:6,type:'legacy.percussion',version:config?2:1,parameters:{gain:1},...(config?{config}:{})},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:6,port:'audio.out'},to:{module:18,port:'program.in'}}],events};}
export const newEngine=()=>new WebAssembly.Instance(graphModule,{}).exports;
export function renderGraph(p,rate,total,block=509){const g=new ReferenceGraph(newEngine(),p,contracts,rate,512);try{return {pcm:renderHandle(g,total,block),stats:g.stats(),percussion:g.percussionStats(6)};}finally{g.dispose();}}
export function renderHandle(g,total,block=509){const pcm=[new Float32Array(total),new Float32Array(total)];for(let at=0;at<total;){const n=Math.min(block,total-at);g.render(n);pcm[0].set(g.left.subarray(0,n),at);pcm[1].set(g.right.subarray(0,n),at);at+=n;}return pcm;}
export function renderLegacy(config,events,rate,total){
 const e=new WebAssembly.Instance(legacyModule,{}).exports;e.init(rate);
 if(config){e.voice_preset(voices.indexOf(config.voice)+1);config.drums.forEach((d,i)=>{e.level(i,d.on?d.level:0);e.tone_param(i,d.tone);e.decay_param(i,d.decay);});}
 for(const h of events)if(!e.hit(h.drum,h.frame,h.duration,h.velocity,h.vary,h.tone,h.decay,h.hit,h.model))throw Error('Legacy kit hit rejected');
 const v=new Float32Array(e.memory.buffer,e.output_ptr(),256),pcm=[new Float32Array(total),new Float32Array(total)];
 for(let at=0;at<total;){const n=Math.min(113,total-at);e.process(n);pcm[0].set(v.subarray(0,n),at);pcm[1].set(v.subarray(128,128+n),at);at+=n;}
 return pcm;
}
export const digest=pcm=>crypto.createHash('sha256').update(Buffer.from(pcm[0].buffer)).update(Buffer.from(pcm[1].buffer)).digest('hex');
