/* Owned Rust effect processor. 61003cb61b59b2f0 is filled by its builder. */
/** Translate the host's reported epoch into distinct canonical render callbacks.
 * Native clock/cursor probes show that a resumed AudioWorklet global frame may
 * remain stale while native audio advances. Each actual callback owns one quantum.
 * A forward host epoch can skip pulls; it does not create missing DSP samples.
 */
class HostRenderClock {
 constructor({quantum=128,maxLagFrames=8192}={}) {
  if(!Number.isSafeInteger(quantum)||quantum<=0||!Number.isSafeInteger(maxLagFrames)||maxLagFrames<quantum||maxLagFrames%quantum)throw Error('Invalid host render clock bounds');
  this.quantum=quantum;this.maxLagFrames=maxLagFrames;this.globalFrame=null;this.renderFrame=null;this.calls=0;this.recoveredCallbacks=0;this.maxObservedLagFrames=0;this.forwardGapFrames=0;
 }
 next(globalFrame) {
  if(!Number.isSafeInteger(globalFrame)||globalFrame<0||globalFrame%this.quantum)throw Error('Host render clock requires a canonical global frame');
  if(this.globalFrame!==null&&globalFrame<this.globalFrame)throw Error('Host render global frame moved backwards');
  const expected=this.renderFrame===null?globalFrame:this.renderFrame+this.quantum,frame=Math.max(globalFrame,expected),lag=frame-globalFrame;
  if(!Number.isSafeInteger(frame+this.quantum)||lag>this.maxLagFrames)throw Error('Host render clock exceeded declared stale-frame limit');
  if(lag)this.recoveredCallbacks++;
  if(lag>this.maxObservedLagFrames)this.maxObservedLagFrames=lag;
  if(globalFrame>expected)this.forwardGapFrames+=globalFrame-expected;
  this.globalFrame=globalFrame;this.renderFrame=frame;this.calls++;return frame;
 }
 snapshot(){return{quantum:this.quantum,maxLagFrames:this.maxLagFrames,globalFrame:this.globalFrame,renderFrame:this.renderFrame,calls:this.calls,recoveredCallbacks:this.recoveredCallbacks,maxObservedLagFrames:this.maxObservedLagFrames,forwardGapFrames:this.forwardGapFrames};}
}

const LIVE_RANGES=[[0,1],[1,20],[-18,18],[.001,1],[.01,1]],EMPTY_INPUT=[];
class LiveVoiceCompressorProcessor extends AudioWorkletProcessor{
 constructor(options){super();this.disposed=false;this.failed=null;this.handle=0;this.renderClock=new HostRenderClock();this.queueHead=0;this.queueCount=0;this.queueFrames=new Float64Array(256);this.queueIndices=new Uint8Array(256);this.queueValues=new Float64Array(256);this.queueSequences=new Float64Array(256);this.trace=new Float64Array(256*5);this.traceCount=0;this.traceTotal=0;this.late=0;this.lastAppliedFrame=null;this.lastSequence=0;this.waitFrames=0;
  try{const p=options.processorOptions;if(p.engineVersion!=='61003cb61b59b2f0'||!['instrument','voicefx'].includes(p.hostLifetime))throw Error('Live compressor processor/profile mismatch');this.e=new WebAssembly.Instance(p.module,{}).exports;if(this.e.voice_comp_live_api()!==1)throw Error('Live compressor ABI mismatch');this.handle=this.e.voice_comp_live_new(sampleRate,Number(p.hostLifetime==='voicefx'));if(!this.handle)throw Error('Live compressor allocation failed');for(const[i,value]of[[0,0],[1,4],[2,0],[3,.003],[4,.25]])this.check(this.e.voice_comp_live_initial(this.handle,i,value));this.check(this.e.voice_comp_live_prepare(this.handle,p.originFrame));for(const c of p.commands??[]){if(!this.valid(c.index,c.value,c.frame))throw Error('Invalid initial compressor control');this.check(this.e.voice_comp_live_sync(this.handle,c.frame));this.apply(c.index,c.value,c.frame,c.sequence??0);}this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.voice_comp_live_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.voice_comp_live_output(this.handle,ch),2048));this.port.onmessage=event=>this.message(event.data);this.port.postMessage({kind:'ready',engineVersion:'61003cb61b59b2f0',stats:this.snapshot()});}
  catch(error){this.fail(error);}
 }
 check(value){if(!value)throw Error('Live compressor operation rejected');}
 valid(index,value,frame){const r=LIVE_RANGES[index];return Number.isInteger(index)&&!!r&&typeof value==='number'&&Number.isFinite(value)&&value>=r[0]&&value<=r[1]&&Number.isSafeInteger(frame)&&frame>=0&&frame<=9007199254738944&&frame%128===0;}
 apply(index,value,requestedFrame,sequence){this.check(this.e.voice_comp_live_param(this.handle,index,value));const frame=this.e.voice_comp_live_stat(this.handle,1);if(frame>requestedFrame)this.late++;this.lastAppliedFrame=frame;this.lastSequence=sequence;const at=(this.traceTotal%256)*5;this.trace[at]=frame;this.trace[at+1]=index;this.trace[at+2]=value;this.trace[at+3]=sequence;this.trace[at+4]=requestedFrame;this.traceTotal++;this.traceCount=Math.min(256,this.traceTotal);}
 drain(frame){while(this.queueCount&&this.queueFrames[this.queueHead]<=frame){const i=this.queueHead;this.apply(this.queueIndices[i],this.queueValues[i],this.queueFrames[i],this.queueSequences[i]);this.queueHead=(i+1)%256;this.queueCount--;}}
 sync(){const frame=this.e.voice_comp_live_stat(this.handle,1);if(currentFrame>frame)this.check(this.e.voice_comp_live_sync(this.handle,currentFrame));this.drain(this.e.voice_comp_live_stat(this.handle,1));}
 snapshot(includeTrace=false){const names=['peak','frame','latencyFrames','reductionDb','makeupGain','processedFrames','active','started','prepared','controlPhase','coreTargets','makeupTargets','intrinsicLatencyFrames','commands'],stats={};if(this.handle)for(let i=0;i<names.length;i++)stats[names[i]]=this.e.voice_comp_live_stat(this.handle,i);return{...stats,engineVersion:'61003cb61b59b2f0',renderClock:this.renderClock.snapshot(),queuedControls:this.queueCount,lateControls:this.late,lastAppliedFrame:this.lastAppliedFrame,lastSequence:this.lastSequence,waitFrames:this.waitFrames,error:this.failed,disposed:this.disposed,...(includeTrace?{trace:Array.from({length:this.traceCount},(_,i)=>{const at=((this.traceTotal-this.traceCount+i)%256)*5;return Array.from(this.trace.subarray(at,at+5));})}:{}),targets:this.handle?Array.from({length:5},(_,i)=>this.e.voice_comp_live_value(this.handle,i)):null};}
 message(data){if(this.disposed)return;try{if(data?.kind==='dispose'){if(this.handle)this.e.voice_comp_live_free(this.handle);this.handle=0;this.disposed=true;this.queueCount=0;this.port.postMessage({kind:'disposed',request:data.request});return;}if(this.failed){this.port.postMessage({kind:'error',request:data?.request,error:this.failed});return;}this.sync();if(data?.kind==='control'){if(!Array.isArray(data.entries)||data.entries.length<1||data.entries.length>5||data.entries.some(p=>!Array.isArray(p)||p.length!==2||!this.valid(p[0],p[1],data.frame))||!Number.isSafeInteger(data.sequence)||data.sequence<0)throw Error('Invalid live compressor control packet');const frame=this.e.voice_comp_live_stat(this.handle,1);if(data.frame>frame){if(this.queueCount+data.entries.length>256)throw Error('Live compressor future-control queue full');for(const[index,value]of data.entries){const at=(this.queueHead+this.queueCount)%256;this.queueFrames[at]=data.frame;this.queueIndices[at]=index;this.queueValues[at]=value;this.queueSequences[at]=data.sequence;this.queueCount++;}}else for(const[index,value]of data.entries)this.apply(index,value,data.frame,data.sequence);}
   else if(data?.kind==='reset')this.check(this.e.voice_comp_live_reset(this.handle));
   else if(data?.kind!=='stats'&&data?.kind!=='flush')throw Error('Unknown live compressor command');
   if(data.request!==undefined)this.port.postMessage({kind:'stats',request:data.request,stats:this.snapshot(!!data.includeTrace)});
  }catch(error){this.port.postMessage({kind:'rejected',request:data?.request,error:String(error)});}}
 fail(error){this.failed=String(error);if(this.handle){this.e.voice_comp_live_free(this.handle);this.handle=0;}this.port.postMessage({kind:'error',error:this.failed});}
 process(inputs,outputs){const out=outputs[0];if(!out?.length)return!this.disposed;if(this.disposed||this.failed){for(const a of out)a.fill(0);return false;}try{const n=out[0].length;if(n!==128)throw Error('Live compressor profile requires128-frame Web Audio quanta');const renderFrame=this.renderClock.next(currentFrame),frame=this.e.voice_comp_live_stat(this.handle,1);if(renderFrame<frame){for(const a of out)a.fill(0);this.waitFrames+=n;return true;}this.check(this.e.voice_comp_live_sync(this.handle,renderFrame));this.drain(renderFrame);const input=inputs[0]??EMPTY_INPUT,channels=input.length===1?1:2,left=input[0],right=input[1];for(let i=0;i<n;i++){this.input[0][i]=left?left[i]:0;this.input[1][i]=right?right[i]:0;}this.check(this.e.voice_comp_live_render(this.handle,n,channels));for(let ch=0;ch<out.length;ch++)for(let i=0;i<n;i++)out[ch][i]=this.output[Math.min(ch,1)][i];return true;}catch(error){for(const a of out)a.fill(0);this.fail(error);return false;}}
}
registerProcessor('owned-voice-compressor-live-61003cb61b59b2f0',LiveVoiceCompressorProcessor);
