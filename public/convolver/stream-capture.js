// BEGIN generated HostRenderClock authority
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
// END generated HostRenderClock authority
class ConvolverStreamCapture extends AudioWorkletProcessor{
 constructor(options){super();const p=options.processorOptions;if(!p||!Number.isSafeInteger(p.startFrame)||p.startFrame<0||!Number.isInteger(p.frames)||p.frames<1||p.frames>4194304||![1,2].includes(p.channels))throw Error('Invalid convolution capture bounds');this.hostClock=new HostRenderClock();this.startFrame=p.startFrame;this.frames=p.frames;this.pcm=Array.from({length:p.channels},()=>new Float32Array(p.frames));this.at=0;this.done=false;this.port.postMessage({type:'ready'});}
 process(inputs,outputs){if(this.done)return false;const callbackFrame=this.hostClock.next(currentFrame),input=inputs[0]??[],output=outputs[0];for(let i=0;i<output[0].length;i++){const frame=callbackFrame+i;if(frame<this.startFrame)continue;if(this.at>=this.frames)break;for(let ch=0;ch<this.pcm.length;ch++){const value=input[ch]?.[i]??0;this.pcm[ch][this.at]=value;output[ch][i]=value;}this.at++;}if(this.at===this.frames){this.done=true;this.port.postMessage({type:'captured',startFrame:this.startFrame,frames:this.frames,channels:this.pcm,hostClock:this.hostClock.snapshot()},this.pcm.map(p=>p.buffer));}return!this.done;}
}
registerProcessor('calmbgm-convolver-stream-capture',ConvolverStreamCapture);
