class IowaLiveCapture extends AudioWorkletProcessor{
 constructor(options){super();const p=options.processorOptions;this.start=p.start;this.frames=p.frames;this.at=0;this.done=false;this.pcm=Array.from({length:p.channels},()=>new Float32Array(this.frames));}
 process(inputs,outputs){for(const c of outputs[0])c.fill(0);if(this.done||currentFrame<this.start)return true;const n=Math.min(128,this.frames-this.at);for(let c=0;c<this.pcm.length;c++){const input=inputs[0][c];if(input)for(let i=0;i<n;i++)this.pcm[c][this.at+i]=input[i];}this.at+=n;if(this.at===this.frames){this.done=true;this.port.postMessage({type:'complete',start:this.start,frames:this.frames,pcm:this.pcm},this.pcm.map(a=>a.buffer));}return true;}
}
registerProcessor('iowa-live-capture',IowaLiveCapture);
