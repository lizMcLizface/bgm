// Review-only native control taps; never used by the application player.
class PluckedLiveCapture extends AudioWorkletProcessor{
 constructor(options){super();const p=options.processorOptions;this.start=p.start;this.frames=p.frames;this.at=0;this.calls=0;this.done=false;this.pcm=Array.from({length:p.channels},()=>new Float32Array(this.frames));this.globalFrames=new Float64Array(Math.ceil(this.frames/128));}
 process(inputs,outputs){for(const c of outputs[0])c.fill(0);if(this.done||currentFrame<this.start)return true;this.globalFrames[this.calls++]=currentFrame;const n=Math.min(128,this.frames-this.at);for(let c=0;c<this.pcm.length;c++){const input=inputs[0][c];if(input)for(let i=0;i<n;i++)this.pcm[c][this.at+i]=input[i];}this.at+=n;if(this.at===this.frames){this.done=true;this.port.postMessage({type:'complete',start:this.start,frames:this.frames,globalFrames:this.globalFrames,pcm:this.pcm},[...this.pcm.map(a=>a.buffer),this.globalFrames.buffer]);}return true;}
}
registerProcessor('plucked-live-capture',PluckedLiveCapture);
