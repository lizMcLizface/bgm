import {PatchTransition,flattenFM,fmDiscrete,fmLog} from './patch-transition.js?v=044d1f7d18507e03';
// Four independent stereo outputs. Only source computation is shared.
class FmBankProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}){
  super();this.slots=Array(4).fill(null);this.auditStats=!!o.auditStats;this.clock=o.offline?0:currentFrame;this.offline=!!o.offline;this.stopFrame=o.stopFrame??null;this.rendered=0;this.resyncs=0;this.skippedFrames=0;this.statsFrames=0;this.failed=false;
  try{this.fm=new WebAssembly.Instance(o.module,{}).exports;if(this.fm.bank_api?.()!==1)throw Error('FM bank API mismatch');this.fm.bank_init();this.fm.bank_vector_mode(o.vector===false?0:1);
   this.output=Array.from({length:4},(_,s)=>[0,1].map(c=>new Float32Array(this.fm.memory.buffer,this.fm.bank_output(s,c),2048)));
   this.port.onmessage=({data})=>{try{this.message(data);}catch(e){this.fail(e);}};
  }catch(e){this.fail(e);}
 }
 configure(s,p){for(const v of p.globals)this.fm.bank_param(s,...v);for(const v of p.operators)this.fm.bank_op(s,...v);for(const v of p.routes)this.fm.bank_route(s,...v);for(const v of p.carriers)this.fm.bank_carrier(s,...v);}
 message(d){
  if(d.type==='dispose-bank'){this.stop();return;}
  const s=d.slot;if(!Number.isInteger(s)||s<0||s>=4)return;
  if(d.type==='add'){
   if(this.slots[s])throw Error('Occupied FM bank slot');
   const p=d.performance??{mode:0,portamento:0,glide:'overlap'};this.fm.bank_slot_init(s,sampleRate,this.clock);this.configure(s,d.patch);
   const transition=new PatchTransition(flattenFM(d.patch),p,(scope,i,v)=>{if(scope===0)this.fm.bank_param(s,i,v);else if(scope===1)this.fm.bank_op(s,Math.floor(i/32),i%32,v);else if(scope===2)this.fm.bank_route(s,Math.floor(i/8),i%8,v);else this.fm.bank_carrier(s,i,v);},(p,f)=>this.fm.bank_event(s,6,p?.mode??0,f,p?.portamento??0,p?.glide==='always'?1:0),fmDiscrete,fmLog,sampleRate);
   this.slots[s]={token:d.token,transition,auditStats:!!d.auditStats||this.auditStats,peakActive:0};
   if(p.mode)this.fm.bank_event(s,6,p.mode,this.clock,p.portamento,p.glide==='always'?1:0);
   for(const p of d.patches??[])transition.schedule(flattenFM(p.patch),p.performance,p.frame,p.seconds);
   for(const e of d.events??[])this.fm.bank_event(s,...e);
   this.port.postMessage({type:'ready',slot:s,token:d.token});return;
  }
  const state=this.slots[s];if(!state||state.token!==d.token)return;
  if(d.type==='events')for(const e of d.values)this.fm.bank_event(s,...e);
  else if(d.type==='parameters')state.transition.schedule(flattenFM(d.patch),d.performance??state.transition.performance,Math.max(this.clock,Number.isFinite(d.frame)?d.frame:currentFrame),d.seconds??.06);
  else if(d.type==='panic'){state.transition.clear();this.fm.bank_panic(s);}
  else if(d.type==='dispose'){state.transition.clear();this.fm.bank_release(s);this.slots[s]=null;}
 }
 stats(final=false){for(let s=0;s<4;s++){const state=this.slots[s];if(!state)continue;this.port.postMessage({type:'stats',resyncs:this.resyncs,skippedFrames:this.skippedFrames,slot:s,token:state.token,final,active:this.fm.bank_stat(s,0),peakActive:state.peakActive,steals:this.fm.bank_stat(s,1),dropped:this.fm.bank_stat(s,2),late:this.fm.bank_stat(s,3),frame:this.clock,peak:this.fm.bank_stat(s,5),latencyFrames:this.fm.bank_stat(s,6),memory:this.fm.memory.buffer.byteLength,bank:true,vectorFrames:this.fm.bank_stat(s,7),laneSamples:this.fm.bank_stat(s,8)});}}
 stop(){this.failed=true;for(const s of this.slots??[])s?.transition.clear();this.slots=[];this.port.onmessage=null;this.port.close();this.fm=null;this.output=null;}
 fail(e){this.port.postMessage({type:'error',message:String(e)});this.stop();}
 process(_input,outputs){if(this.failed)return false;try{
  const length=outputs[0]?.[0]?.length??128;
  // Real-time slots registered between quanta inherit this shared clock.
  if(!this.offline&&(this.rendered===0||this.clock!==currentFrame)){if(this.rendered>0){this.resyncs++;this.skippedFrames+=Math.max(0,currentFrame-this.clock);}this.clock=currentFrame;for(let s=0;s<4;s++)if(this.slots[s])this.fm.bank_set_frame(s,this.clock);}
  for(let at=0;at<length;){let n=Math.min(2048,length-at);
   for(const s of this.slots)if(s){s.transition.tick(this.clock);n=s.transition.span(this.clock,n);}
   this.fm.bank_render(n);
   for(let s=0;s<4;s++){const state=this.slots[s],out=outputs[s];if(!state||!out)continue;
    if(!state.transition.active&&state.transition.outputGain===1){for(let c=0;c<out.length;c++)out[c].set(this.output[s][c].subarray(0,n),at);}
    else for(let i=0;i<n;i++){const gain=state.transition.gain(this.clock+i);for(let c=0;c<out.length;c++)out[c][at+i]=this.output[s][c][i]*gain;}
    if(state.auditStats)state.peakActive=Math.max(state.peakActive,this.fm.bank_stat(s,0));
   }
   this.clock+=n;at+=n;
  }
  this.rendered+=length;this.statsFrames+=length;if(!this.offline&&this.statsFrames>=sampleRate){this.statsFrames=0;this.stats();}
  if(this.offline&&this.stopFrame!==null&&this.rendered>=this.stopFrame){this.stats(true);this.stop();return false;}
  return true;
 }catch(e){this.fail(e);return false;}}
}
registerProcessor('calmbgm-fm-bank',FmBankProcessor);
