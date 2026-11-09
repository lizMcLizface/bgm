// Direct serial legacy-kernel driver, also used for browser stem agreement.
// These timings exclude Web Audio nodes/worklet scheduling and are labeled so.
import {insertsPacket,partEvents,drumEvents,tickFrame} from './sixRoleFixture';
import {insertsActive} from '../synth-lab/insertsConfig';
import * as legacyTransitions from './legacyPatchTransition';
let transitions=legacyTransitions;
// Load the unchanged legacy transition module through the host's normal asset
// path (browser) or filesystem (Node), rather than importing public/ via Vite.
export function configureLegacyTransitions(module){transitions=module;}
export function distribution(values){if(!values.length)return {count:0};const v=[...values].sort((a,b)=>a-b),q=p=>v[Math.min(v.length-1,Math.ceil(v.length*p)-1)];return {count:v.length,p50:q(.5),p95:q(.95),p99:q(.99),max:v.at(-1),mean:v.reduce((a,b)=>a+b,0)/v.length};}
export class LegacyRoleKernel{
 constructor(modules,f,part,rate,maxBlock=128){if(!transitions)throw Error('Load legacy transition contracts before preparing roles');const {PatchTransition,flattenFM,coreDiscrete,fmDiscrete,coreLog,fmLog}=transitions;this.part=part;this.rate=rate;this.clock=0;this.maxBlock=maxBlock;this.left=new Float32Array(maxBlock);this.right=new Float32Array(maxBlock);const e=this.e=new WebAssembly.Instance(modules[part.kind],{}).exports;
  if(part.kind==='core'){
   e.engine_init(rate);for(const v of part.packet)e.engine_param(...v);
   this.transition=new PatchTransition(part.packet,part.performance,(scope,index,value)=>e.engine_param(scope,index,value),()=>{},coreDiscrete,coreLog,rate);
   for(const edit of part.edits)this.transition.schedule(edit.packet,part.performance,tickFrame(f,edit.tick,rate),edit.seconds);
   for(const event of partEvents(f,part,rate))if(!e.engine_event(...event))throw Error('Core queue rejected fixture event');
   this.l=new Float32Array(e.memory.buffer,e.engine_left(),2048);this.r=new Float32Array(e.memory.buffer,e.engine_right(),2048);
  }else if(part.kind==='fm'){
   e.fm_init(rate);for(const p of part.packet.globals)e.fm_param(...p);for(const p of part.packet.operators)e.fm_op(...p);for(const p of part.packet.routes)e.fm_route(...p);for(const p of part.packet.carriers)e.fm_carrier(...p);
   this.transition=new PatchTransition(flattenFM(part.packet),part.performance,(scope,index,value)=>{if(scope===0)e.fm_param(index,value);else if(scope===1)e.fm_op(Math.floor(index/32),index%32,value);else if(scope===2)e.fm_route(Math.floor(index/8),index%8,value);else e.fm_carrier(index,value);},()=>{},fmDiscrete,fmLog,rate);
   for(const edit of part.edits)this.transition.schedule(flattenFM(edit.packet),part.performance,tickFrame(f,edit.tick,rate),edit.seconds);
   for(const event of partEvents(f,part,rate))if(!e.fm_event(...event))throw Error('FM queue rejected fixture event');
   this.l=new Float32Array(e.memory.buffer,e.fm_output(0),2048);this.r=new Float32Array(e.memory.buffer,e.fm_output(1),2048);
  }else{
   e.init(rate);for(const h of drumEvents(f,part,rate))if(!e.hit(h.drum,h.frame,h.duration,h.velocity,h.vary,h.tone,h.decay,h.hit,h.model))throw Error('Percussion queue rejected fixture hit');
   const p=e.output_ptr();this.l=new Float32Array(e.memory.buffer,p,128);this.r=new Float32Array(e.memory.buffer,p+128*4,128);
  }
  if(insertsActive(part.inserts)){const x=this.insert=new WebAssembly.Instance(modules.inserts,{}).exports;x.inserts_init(rate);for(const pair of insertsPacket(part.inserts))x.inserts_param(...pair);x.inserts_settle();this.i=[0,1].map(ch=>new Float32Array(x.memory.buffer,x.inserts_input(ch),2048));this.o=[0,1].map(ch=>new Float32Array(x.memory.buffer,x.inserts_output(ch),2048));}
 }
 render(frames){if(!Number.isInteger(frames)||frames<0||frames>this.maxBlock||frames>128&&this.part.kind==='percussion')throw Error('Invalid legacy block size');
  for(let at=0;at<frames;){this.transition?.tick(this.clock);const n=this.transition?this.transition.span(this.clock,frames-at):frames-at;
   if(this.part.kind==='core')this.e.engine_render(n);else if(this.part.kind==='fm')this.e.fm_render(n);else this.e.process(n);
   for(let i=0;i<n;i++){const gain=this.transition?this.transition.gain(this.clock+i):1;this.left[at+i]=this.l[i]*gain;this.right[at+i]=this.r[i]*gain;}this.clock+=n;at+=n;
  }
  if(this.insert){for(let i=0;i<frames;i++){this.i[0][i]=this.left[i];this.i[1][i]=this.right[i];}this.insert.inserts_render(frames);for(let i=0;i<frames;i++){this.left[i]=this.o[0][i];this.right[i]=this.o[1][i];}}
 }
 stats(){const e=this.e;return this.part.kind==='percussion'?{frame:e.stat(5),steals:e.stat(2),dropped:e.stat(3),late:e.stat(4),peakActive:e.stat(6),latencyFrames:0,memory:e.memory.buffer.byteLength+(this.insert?.memory.buffer.byteLength??0)}:{frame:this.clock,steals:this.part.kind==='core'?e.engine_stat(1):e.fm_stat(1),dropped:this.part.kind==='core'?e.engine_stat(2):e.fm_stat(2),late:this.part.kind==='core'?e.engine_stat(3):e.fm_stat(3),latencyFrames:this.part.kind==='fm'?e.fm_stat(6):0,memory:e.memory.buffer.byteLength+(this.insert?.memory.buffer.byteLength??0)};}
}
