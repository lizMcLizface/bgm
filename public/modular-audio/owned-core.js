// Owned core control contract v1. Preparation and refresh stay off process().
import {PatchTransition,coreDiscrete,coreLog} from './legacyPatchTransition.js';
const frame=n=>Number.isSafeInteger(n)&&n>=0;
const integer=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function packet(p){
 if(!Array.isArray(p)||p.length>244||p.some(r=>!Array.isArray(r)||r.length!==3||!r.every(finite)||!Number.isFinite(Math.fround(r[2]))||!integer(r[0],0,2)||!integer(r[1],0,r[0]===0?11:115)))throw Error('Invalid core packet');
 const keys=p.map(r=>r[0]+':'+r[1]);if(new Set(keys).size!==keys.length)throw Error('Duplicate core parameter');return p;
}
function performance(p){if(!p||!integer(p.mode,0,2)||!finite(p.portamento)||p.portamento<0||p.portamento>3||!['always','overlap'].includes(p.glide))throw Error('Invalid core performance');}
export function validateCoreSpec(raw){
 const p=JSON.parse(JSON.stringify(raw));if(p?.version!==1)throw Error('Invalid owned core version');packet(p.patch);performance(p.performance);
 if(!Array.isArray(p.events)||!Array.isArray(p.edits)||p.edits.length>32||p.events.length+p.edits.length+1>4096)throw Error('core resource bounds');
 for(const e of p.events){if(!Array.isArray(e)||e.length!==5||!integer(e[0],0,6)||!integer(e[1],0,0xffffffff)||!frame(e[2])||!finite(e[3])||!finite(e[4]))throw Error('Invalid core event');if([0,1,5].includes(e[0])&&!e[1])throw Error('core note ID required');if(e[0]===6&&e[1]>2)throw Error('Invalid core mode');
  if(([0,5].includes(e[0])&&(e[3]<0||e[3]>127))||(e[0]===0&&(e[4]<0||e[4]>1))||([2,3].includes(e[0])&&(e[3]<0||e[3]>1))||(e[0]===5&&(e[4]<0||e[4]>8))||(e[0]===6&&(e[3]<0||e[3]>3||e[4]<0||e[4]>1)))throw Error('core event value bounds');
 }
 for(const e of p.edits){packet(e.patch);performance(e.performance);if(!frame(e.frame)||!finite(e.seconds)||e.seconds<0||e.seconds>2)throw Error('Invalid core transition');}
 return p;
}
export const saveCoreSpec=p=>JSON.stringify(validateCoreSpec(p),null,2)+'\n';
export const loadCoreSpec=text=>validateCoreSpec(JSON.parse(text));
export class OwnedCore {
 constructor(engine,spec,rate,transitionFactory=null){
  this.transitionFactory=transitionFactory;
  if(!finite(rate)||rate<8000||rate>192000||engine.core_owned_api()!==1)throw Error('Owned core ABI/rate');
  this.e=engine;this.spec=validateCoreSpec(spec);this.rate=rate;this.handle=engine.core_owned_new(rate);if(!this.handle)throw Error('core preparation failed');
  this.left=new Float32Array(2048);this.right=new Float32Array(2048);
  try{this.configure();this.refresh();}catch(e){this.dispose();throw e;}
 }
 configure(){
  this.clock=0;this.peakActive=0;const e=this.e,h=this.handle,p=this.spec.patch;
  for(const x of p)e.core_owned_param(h,...x);
  const applyPerformance=(p,at)=>{if(!e.core_owned_event(h,6,p.mode,at,p.portamento,Number(p.glide==='always')))throw Error('core performance queue full');};
  applyPerformance(this.spec.performance,0);
  this.transition?.dispose?.();
  this.transition=(this.transitionFactory??((...args)=>new PatchTransition(...args)))(p,this.spec.performance,(scope,index,value)=>e.core_owned_param(h,scope,index,value),applyPerformance,coreDiscrete,coreLog,this.rate);
  for(const x of this.spec.edits)this.transition.schedule(x.patch,x.performance,x.frame,x.seconds);
  for(const x of this.spec.events)if(!e.core_owned_event(h,...x))throw Error('core event queue full');
 }
 alive(){if(!this.handle)throw Error('Disposed core');}
 refresh(){this.alive();this.l=new Float32Array(this.e.memory.buffer,this.e.core_owned_output(this.handle,0),2048);this.r=new Float32Array(this.e.memory.buffer,this.e.core_owned_output(this.handle,1),2048);}
 render(frames){this.alive();if(!integer(frames,0,2048)||!frame(this.clock+frames))throw Error('core block bounds');
  for(let at=0;at<frames;){this.transition.tick(this.clock);const n=this.transition.span(this.clock,frames-at);this.e.core_owned_render(this.handle,n);if(this.transition.mix)this.transition.mix(this.l,this.r,this.left,this.right,at,n,this.clock);else for(let i=0;i<n;i++){const gain=this.transition.gain(this.clock+i);this.left[at+i]=this.l[i]*gain;this.right[at+i]=this.r[i]*gain;}this.clock+=n;at+=n;this.peakActive=Math.max(this.peakActive,this.e.core_owned_stat(this.handle,0));}
 }
 stats(){this.alive();const e=this.e,h=this.handle;return {active:e.core_owned_stat(h,0),peakActive:this.peakActive,steals:e.core_owned_stat(h,1),dropped:e.core_owned_stat(h,2),late:e.core_owned_stat(h,3),frame:e.core_owned_stat(h,4),latencyFrames:0};}
 reset(){this.alive();this.e.core_owned_init(this.handle,this.rate);this.configure();this.left.fill(0);this.right.fill(0);}
 panic(){this.alive();this.e.core_owned_panic(this.handle);this.transition.clear();}
 dispose(){this.transition?.dispose?.();if(this.handle){this.e.core_owned_free(this.handle);this.handle=0;this.l=this.r=null;}}
}
