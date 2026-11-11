// Review only: capture program-source PCM, never LFO/control signals.
class MotionProgramCapture extends AudioWorkletProcessor{
 constructor({processorOptions:{length,channels}}){super();if(!Number.isInteger(length)||length<128||length>2000000||length%128||![1,2].includes(channels))throw Error('Invalid bounded Motion reference capture');this.length=length;this.channels=channels;this.frame=0;this.data=Array.from({length:channels},()=>new Float32Array(length));}
 process(inputs,outputs){for(const out of outputs[0])out.fill(0);const input=inputs[0]??[];for(let ch=0;ch<this.channels;ch++)if(input[ch])this.data[ch].set(input[ch],this.frame);this.frame+=128;if(this.frame>=this.length){this.port.postMessage({kind:'captured',frames:this.frame,data:this.data},this.data.map(x=>x.buffer));return false;}return true;}
}
registerProcessor('motion-review-program-capture-v1',MotionProgramCapture);
