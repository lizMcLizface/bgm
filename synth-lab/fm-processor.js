import {PatchTransition,flattenFM,coreDiscrete,fmDiscrete,coreLog,fmLog} from './patch-transition.js?v=044d1f7d18507e03';
class FmProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}) {
  super();this.failed=false;this.auditStats=!!o.auditStats;this.auditPeak=0;
  try{this.fm=new WebAssembly.Instance(o.module,{}).exports;
  if(this.fm.fm_api?.()!==1)throw Error('FM kernel API mismatch.');
  this.fm.fm_init(sampleRate);this.configure(o.patch);

  const performance=o.performance??{mode:0,portamento:0,glide:'overlap'};
  this.clock=0;
  this.transition=new PatchTransition(flattenFM(o.patch),performance,(scope,index,value)=>{if(scope===0)this.fm.fm_param(index,value);else if(scope===1)this.fm.fm_op(Math.floor(index/32),index%32,value);else if(scope===2)this.fm.fm_route(Math.floor(index/8),index%8,value);else this.fm.fm_carrier(index,value);},
   (p,frame)=>this.fm.fm_event(6,p?.mode??0,frame,p?.portamento??0,p?.glide==='always'?1:0),fmDiscrete,fmLog,sampleRate);
  if(performance.mode)this.fm.fm_event(6,performance.mode,0,performance.portamento,performance.glide==='always'?1:0);
  for(const p of o.patches??[])this.transition.schedule(flattenFM(p.patch),p.performance??performance,p.frame,p.seconds);
  for(const e of o.events??[])this.fm.fm_event(...e);
  const mem=this.fm.memory.buffer;this.output=[0,1].map(c=>new Float32Array(mem,this.fm.fm_output(c),2048));this.views=this.output.map(x=>x.subarray(0,128));
  this.offline=!!o.offline;this.aligned=this.offline;this.stopFrame=this.offline&&Number.isFinite(o.stopFrame)?o.stopFrame:null;this.frames=0;this.rendered=0;
  this.port.onmessage=({data})=>{try{
   if(data.type==='parameters')this.transition.schedule(flattenFM(data.patch),data.performance??this.transition.performance,Math.max(this.clock,Number.isFinite(data.frame)?data.frame:currentFrame),data.seconds??.06);
   if(data.type==='events')for(const e of data.values)this.fm.fm_event(...e);
   if(data.type==='panic'){this.transition.clear();this.fm.fm_panic();}
   if(data.type==='dispose')this.stop();
  }catch(e){this.fail(e);}};
  }catch(e){this.fail(e);}
 }
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.fm=null;this.transition?.clear();this.transition=null;this.output=this.views=null;}
 configure(p){for(const pair of p.globals)this.fm.fm_param(...pair);for(const triple of p.operators)this.fm.fm_op(...triple);for(const triple of p.routes)this.fm.fm_route(...triple);for(const pair of p.carriers)this.fm.fm_carrier(...pair);}
 fail(e){this.port.postMessage({type:'error',message:String(e)});this.stop();}
 process(_input,outputs){
  if(this.failed)return false;
  try{
   if(!this.aligned){this.fm.fm_set_frame(currentFrame);this.clock=currentFrame;this.aligned=true;}
   const out=outputs[0];if(!out?.length)return true;
   for(let at=0;at<out[0].length;){
    this.transition.tick(this.clock);const count=this.transition.span(this.clock,Math.min(2048,out[0].length-at));this.fm.fm_render(count);
    if(!this.transition.active&&this.transition.outputGain===1){for(let c=0;c<out.length;c++)out[c].set(count===128?this.views[c]:this.output[c].subarray(0,count),at);}else for(let i=0;i<count;i++){const gain=this.transition.gain(this.clock+i);for(let c=0;c<out.length;c++)out[c][at+i]=this.output[c][i]*gain;}
    at+=count;this.clock+=count;
   }
   if(this.auditStats)this.auditPeak=Math.max(this.auditPeak,this.fm.fm_stat(0));
   this.rendered+=out[0].length;this.frames+=out[0].length;if(!this.offline&&this.frames>=sampleRate){this.frames=0;this.port.postMessage({type:'stats',active:this.fm.fm_stat(0),steals:this.fm.fm_stat(1),dropped:this.fm.fm_stat(2),late:this.fm.fm_stat(3),peak:this.fm.fm_stat(5),latencyFrames:this.fm.fm_stat(6),memory:this.fm.memory.buffer.byteLength,simdFrames:this.fm.fm_simd_frames?.()??0});}
   if(this.stopFrame!==null&&this.rendered>=this.stopFrame){if(this.auditStats)this.port.postMessage({type:'stats',final:true,active:this.fm.fm_stat(0),peakActive:this.auditPeak,steals:this.fm.fm_stat(1),dropped:this.fm.fm_stat(2),late:this.fm.fm_stat(3),frame:this.clock,memory:this.fm.memory.buffer.byteLength,simdFrames:this.fm.fm_simd_frames?.()??0});this.stop();return false;}
   return true;
  }catch(e){this.fail(e);return false;}
 }
}
registerProcessor('calmbgm-fm',FmProcessor);
