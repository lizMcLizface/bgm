// Owned FM control contract v1. Preparation and refresh stay off process().
import {PatchTransition,flattenFM,fmDiscrete,fmLog} from './legacyPatchTransition.js';
const frame=n=>Number.isSafeInteger(n)&&n>=0;
const integer=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function packet(p){
 if(!p||typeof p!=='object')throw Error('Missing FM packet');
 for(const [name,len,valid]of [
  ['globals',2,r=>integer(r[0],0,59)],
  ['operators',3,r=>integer(r[0],0,7)&&integer(r[1],0,21)],
  ['routes',3,r=>integer(r[0],0,7)&&integer(r[1],0,7)&&(r[0]<r[1]||r[2]===0)],
  ['carriers',2,r=>integer(r[0],0,7)]
 ]){const rows=p[name];if(!Array.isArray(rows)||rows.length>256||rows.some(r=>!Array.isArray(r)||r.length!==len||!r.every(finite)||!Number.isFinite(Math.fround(r.at(-1)))||!valid(r)))throw Error(`Invalid FM ${name}`);const keys=rows.map(r=>r.slice(0,-1).join(':'));if(new Set(keys).size!==keys.length)throw Error(`Duplicate FM ${name}`);}
 return p;
}
function performance(p){if(!p||!integer(p.mode,0,2)||!finite(p.portamento)||p.portamento<0||p.portamento>3||!['always','overlap'].includes(p.glide))throw Error('Invalid FM performance');}
export function validateFmSpec(raw){
 const p=JSON.parse(JSON.stringify(raw));if(p?.version!==1)throw Error('Invalid owned FM version');packet(p.patch);performance(p.performance);
 if(!Array.isArray(p.events)||!Array.isArray(p.edits)||p.edits.length>32||p.events.length+p.edits.length+1>4096)throw Error('FM resource bounds');
 for(const e of p.events){if(!Array.isArray(e)||e.length!==5||!integer(e[0],0,6)||!integer(e[1],0,0xffffffff)||!frame(e[2])||!finite(e[3])||!finite(e[4]))throw Error('Invalid FM event');if([0,1,5].includes(e[0])&&!e[1])throw Error('FM note ID required');if(e[0]===6&&e[1]>2)throw Error('Invalid FM mode');
  if(([0,5].includes(e[0])&&(e[3]<0||e[3]>127))||(e[0]===0&&(e[4]<0||e[4]>1))||([2,3].includes(e[0])&&(e[3]<0||e[3]>1))||(e[0]===5&&(e[4]<0||e[4]>8))||(e[0]===6&&(e[3]<0||e[3]>3||e[4]<0||e[4]>1)))throw Error('FM event value bounds');
 }
 for(const e of p.edits){packet(e.patch);performance(e.performance);if(!frame(e.frame)||!finite(e.seconds)||e.seconds<0||e.seconds>2)throw Error('Invalid FM transition');}
 return p;
}
export const saveFmSpec=p=>JSON.stringify(validateFmSpec(p),null,2)+'\n';
export const loadFmSpec=text=>validateFmSpec(JSON.parse(text));
export class OwnedFm {
 constructor(engine,spec,rate){
  if(!finite(rate)||rate<8000||rate>192000||engine.fm_owned_api()!==1)throw Error('Owned FM ABI/rate');
  this.e=engine;this.spec=validateFmSpec(spec);this.rate=rate;this.handle=engine.fm_owned_new(rate);if(!this.handle)throw Error('FM preparation failed');
  this.left=new Float32Array(2048);this.right=new Float32Array(2048);
  try{this.configure();this.refresh();}catch(e){this.dispose();throw e;}
 }
 configure(){
  this.clock=0;this.peakActive=0;const e=this.e,h=this.handle,p=this.spec.patch;
  for(const x of p.globals)e.fm_owned_param(h,...x);for(const x of p.operators)e.fm_owned_op(h,...x);for(const x of p.routes)e.fm_owned_route(h,...x);for(const x of p.carriers)e.fm_owned_carrier(h,...x);
  const applyPerformance=(p,at)=>{if(!e.fm_owned_event(h,6,p.mode,at,p.portamento,Number(p.glide==='always')))throw Error('FM performance queue full');};
  applyPerformance(this.spec.performance,0);
  this.transition=new PatchTransition(flattenFM(p),this.spec.performance,(scope,index,value)=>{
   if(scope===0)e.fm_owned_param(h,index,value);else if(scope===1)e.fm_owned_op(h,Math.floor(index/32),index%32,value);else if(scope===2)e.fm_owned_route(h,Math.floor(index/8),index%8,value);else e.fm_owned_carrier(h,index,value);
  },applyPerformance,fmDiscrete,fmLog,this.rate);
  for(const x of this.spec.edits)this.transition.schedule(flattenFM(x.patch),x.performance,x.frame,x.seconds);
  for(const x of this.spec.events)if(!e.fm_owned_event(h,...x))throw Error('FM event queue full');
 }
 alive(){if(!this.handle)throw Error('Disposed FM');}
 refresh(){this.alive();this.l=new Float32Array(this.e.memory.buffer,this.e.fm_owned_output(this.handle,0),2048);this.r=new Float32Array(this.e.memory.buffer,this.e.fm_owned_output(this.handle,1),2048);}
 render(frames){this.alive();if(!integer(frames,0,2048)||!frame(this.clock+frames))throw Error('FM block bounds');
  for(let at=0;at<frames;){this.transition.tick(this.clock);const n=this.transition.span(this.clock,frames-at);this.e.fm_owned_render(this.handle,n);for(let i=0;i<n;i++){const gain=this.transition.gain(this.clock+i);this.left[at+i]=this.l[i]*gain;this.right[at+i]=this.r[i]*gain;}this.clock+=n;at+=n;this.peakActive=Math.max(this.peakActive,this.e.fm_owned_stat(this.handle,0));}
 }
 stats(){this.alive();const e=this.e,h=this.handle;return {active:e.fm_owned_stat(h,0),peakActive:this.peakActive,steals:e.fm_owned_stat(h,1),dropped:e.fm_owned_stat(h,2),late:e.fm_owned_stat(h,3),frame:e.fm_owned_stat(h,4),latencyFrames:e.fm_owned_stat(h,6)};}
 reset(){this.alive();this.e.fm_owned_init(this.handle,this.rate);this.configure();this.left.fill(0);this.right.fill(0);}
 panic(){this.alive();this.e.fm_owned_panic(this.handle);this.transition.clear();}
 dispose(){if(this.handle){this.e.fm_owned_free(this.handle);this.handle=0;this.l=this.r=null;}}
}
