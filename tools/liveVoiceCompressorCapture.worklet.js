class LiveCompressorCapture extends AudioWorkletProcessor{
 constructor({processorOptions:p}){super();this.start=p.start;this.frames=p.frames;this.at=0;this.done=false;this.pcm=Array.from({length:8},()=>new Float32Array(p.frames));this.clock=new Float64Array(64);this.clockCount=0;}
 process(inputs,outputs){for(const out of outputs[0])out.fill(0);if(this.done)return false;if(this.at===0&&currentFrame<this.start)return true;if(this.clockCount<this.clock.length)this.clock[this.clockCount++]=currentFrame;const n=Math.min(128,this.frames-this.at);for(let ch=0;ch<8;ch++){const input=inputs[0]?.[ch];if(input)for(let i=0;i<n;i++)this.pcm[ch][this.at+i]=input[i];}this.at+=n;if(this.at===this.frames){this.done=true;this.port.postMessage({kind:'complete',frames:this.frames,pcm:this.pcm,globalFrames:Array.from(this.clock.subarray(0,this.clockCount))},this.pcm.map(a=>a.buffer));return false;}return true;}
}
registerProcessor('live-compressor-capture',LiveCompressorCapture);
