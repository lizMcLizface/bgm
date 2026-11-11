// Rust owns interpolation, discrete switching and the per-sample structural fade.
// JavaScript only validates/prepares packets, dispatches kernel controls and copies PCM.
export class RustPatchTransition {
 constructor(engine,values,performance,apply,onPerformance,fm,rate){
  if(engine.patch_transition_api?.()!==1)throw Error('Missing Rust patch transition ABI');
  this.e=engine;this.apply=apply;this.onPerformance=onPerformance;this.performance=performance;
  this.handle=engine.patch_transition_new(Number(fm),rate,performance.mode,performance.portamento,Number(performance.glide==='always'));
  if(!this.handle)throw Error('Rust patch transition preparation failed');
  try{this.refresh();this.stagePacket(values);if(!engine.patch_transition_seed(this.handle,values.length))throw Error('Invalid initial transition packet');}catch(e){this.dispose();throw e;}
 }
 refresh(){const e=this.e,h=this.handle;this.stage=new Float64Array(e.memory.buffer,e.patch_transition_stage(h),1536);this.audio=new Float32Array(e.memory.buffer,e.patch_transition_audio(h),4096);this.changeBuffer=e.memory.buffer;this.changes=new Float64Array(e.memory.buffer,e.patch_transition_changes(h),16929*5);}
 stagePacket(values){if(!Array.isArray(values)||values.length>512||values.some(r=>!Array.isArray(r)||r.length!==3||r.some(v=>!Number.isFinite(v))))throw Error('Invalid patch transition packet');if(this.stage.buffer!==this.e.memory.buffer)this.refresh();for(let i=0;i<values.length;i++)this.stage.set(values[i],i*3);}
 schedule(values,performance,frame,seconds=.06){
  if(!Number.isFinite(frame)||frame<0||!Number.isFinite(seconds)||seconds<0||seconds>2)throw Error('Invalid patch transition');
  this.stagePacket(values);if(!this.e.patch_transition_schedule(this.handle,values.length,Math.round(frame),seconds,performance.mode,performance.portamento,Number(performance.glide==='always')))throw Error('Rust patch transition packet or queue limit');
 }
 tick(frame){const e=this.e,h=this.handle;if(!e.patch_transition_tick(h,frame))throw Error('Invalid Rust transition frame');const n=e.patch_transition_count(h);if(this.changeBuffer!==e.memory.buffer||!this.changes){this.changeBuffer=e.memory.buffer;this.changes=new Float64Array(e.memory.buffer,e.patch_transition_changes(h),16929*5);}for(let i=0;i<n;i++){const at=i*5,s=this.changes[at];if(s===4){this.performance={mode:this.changes[at+1],portamento:this.changes[at+2],glide:this.changes[at+4]?'always':'overlap'};this.onPerformance(this.performance,this.changes[at+3]);}else this.apply(s,this.changes[at+1],this.changes[at+2]);}}
 span(frame,count){const n=this.e.patch_transition_span(this.handle,frame,count);if(!n)throw Error('Invalid Rust transition span');return n;}
 mix(l,r,left,right,at,n,frame){if(this.audio.buffer!==this.e.memory.buffer)this.refresh();for(let i=0;i<n;i++){this.audio[i]=l[i];this.audio[2048+i]=r[i];}if(!this.e.patch_transition_mix(this.handle,frame,n))throw Error('Invalid Rust transition PCM range');for(let i=0;i<n;i++){left[at+i]=this.audio[i];right[at+i]=this.audio[2048+i];}}
 clear(){this.e.patch_transition_clear(this.handle);}
 dispose(){if(this.handle){this.e.patch_transition_free(this.handle);this.handle=0;this.changes=this.stage=this.audio=null;}}
}
