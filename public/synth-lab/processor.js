import {PatchTransition,flattenFM,coreDiscrete,fmDiscrete,coreLog,fmLog} from './patch-transition.js?v=044d1f7d18507e03';
// Thin Web Audio bridge; all sample generation and event execution are Rust/Wasm.
class SynthProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}) {
  super();this.failed=false;this.auditStats=!!o.auditStats;this.auditPeak=0;this.resyncs=0;this.skippedFrames=0;
  try{this.engine=new WebAssembly.Instance(o.module,{}).exports;
  if(this.engine.engine_api?.()!==1)throw Error('Synth kernel API mismatch. Rebuild the engine and reload.');
  this.engine.engine_init(sampleRate);
  this.offline=!!o.offline;this.aligned=this.offline;this.stopFrame=this.offline&&Number.isFinite(o.stopFrame)?o.stopFrame:null;
  for(const [scope,index,value]of o.parameters)this.engine.engine_param(scope,index,value);

  const performance=o.performance??{mode:0,portamento:0,glide:'overlap'};
  this.clock=0;
  this.transition=new PatchTransition(o.parameters,performance,(scope,index,value)=>this.engine.engine_param(scope,index,value),
   (p,frame)=>this.engine.engine_event(6,p?.mode??0,frame,p?.portamento??0,p?.glide==='always'?1:0),coreDiscrete,coreLog,sampleRate);
  if(performance.mode)this.engine.engine_event(6,performance.mode,0,performance.portamento,performance.glide==='always'?1:0);
  for(const p of o.patches??[])this.transition.schedule(p.values,p.performance??performance,p.frame,p.seconds);
  for(const event of o.events??[])this.engine.engine_event(...event);
  const memory=this.engine.memory.buffer;this.left=new Float32Array(memory,this.engine.engine_left(),2048);this.right=new Float32Array(memory,this.engine.engine_right(),2048);
  this.left128=this.left.subarray(0,128);this.right128=this.right.subarray(0,128);
  this.port.onmessage=({data})=>{try{
   if(data.type==='parameters')this.transition.schedule(data.values,data.performance??this.transition.performance,Math.max(this.clock,Number.isFinite(data.frame)?data.frame:currentFrame),data.seconds??.06);
   else if(data.type==='events')for(const event of data.values)this.engine.engine_event(...event);
   else if(data.type==='panic'){this.transition.clear();this.engine.engine_panic();}
   else if(data.type==='dispose')this.stop();
  }catch(error){this.fail(error);}};
  this.report=0;this.port.postMessage({type:'ready'});
  }catch(error){this.fail(error);}
 }
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.engine=null;this.transition?.clear();this.transition=null;this.left=this.right=this.left128=this.right128=null;}
 fail(error){this.port.postMessage({type:'error',message:String(error)});this.stop();}
 process(_inputs,outputs){
  if(this.failed)return false;
  try{
   // Repeated browser stamps must not rewind samples already rendered.
   if(!this.offline&&(!this.aligned||currentFrame>this.clock)){if(this.aligned){this.resyncs++;this.skippedFrames+=currentFrame-this.clock;}this.engine.engine_set_frame(currentFrame);this.clock=currentFrame;this.aligned=true;}
   const output=outputs[0];if(!output?.length)return true;const n=output[0].length;
   for(let at=0;at<n;){
    this.transition.tick(this.clock);const count=this.transition.span(this.clock,Math.min(2048,n-at));this.engine.engine_render(count);
    if(!this.transition.active&&this.transition.outputGain===1){output[0].set(count===128?this.left128:this.left.subarray(0,count),at);if(output[1])output[1].set(count===128?this.right128:this.right.subarray(0,count),at);}else for(let i=0;i<count;i++){const gain=this.transition.gain(this.clock+i);output[0][at+i]=this.left[i]*gain;if(output[1])output[1][at+i]=this.right[i]*gain;}
    at+=count;this.clock+=count;
   }
   if(this.auditStats)this.auditPeak=Math.max(this.auditPeak,this.engine.engine_stat(0));
   this.report+=n;if(!this.offline&&this.report>=sampleRate){this.report=0;this.port.postMessage({type:'stats',resyncs:this.resyncs,skippedFrames:this.skippedFrames,active:this.engine.engine_stat(0),steals:this.engine.engine_stat(1),dropped:this.engine.engine_stat(2),late:this.engine.engine_stat(3),frame:this.engine.engine_stat(4),peak:this.engine.engine_stat(5),memory:this.engine.memory.buffer.byteLength,simdFrames:this.engine.engine_simd_frames?.()??0});}
   if(this.stopFrame!==null&&this.engine.engine_stat(4)>=this.stopFrame){if(this.auditStats)this.port.postMessage({type:'stats',resyncs:this.resyncs,skippedFrames:this.skippedFrames,final:true,active:this.engine.engine_stat(0),peakActive:this.auditPeak,steals:this.engine.engine_stat(1),dropped:this.engine.engine_stat(2),late:this.engine.engine_stat(3),frame:this.engine.engine_stat(4),memory:this.engine.memory.buffer.byteLength,simdFrames:this.engine.engine_simd_frames?.()??0});this.stop();return false;}
   return true;
  }catch(error){this.fail(error);return false;}
 }
}
registerProcessor('calmbgm-subtractive',SynthProcessor);
