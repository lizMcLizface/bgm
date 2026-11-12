import{NativeContextClockCodec,nativeContextClockDescriptors}from'../src/modular-audio/nativeContextClockCodec.js';
/** Numerical review only. Actual input and two literal original Native outputs share a strict
 * Source7a ledger. Raw AudioWorklet currentFrame is diagnostic, never authority. */
class InstrumentDelayLiveCapture extends AudioWorkletProcessor{
 static get parameterDescriptors(){return nativeContextClockDescriptors();}
 constructor({processorOptions:p}){super();if(![1,2].includes(p.channels)||!Number.isInteger(p.frames)||p.frames<128||p.frames>524288||p.frames%128)throw Error('Delay authority capture shape/budget differs');this.channels=p.channels;this.frames=p.frames;this.offset=0;this.firstFrame=null;this.quanta=0;this.done=false;this.codec=null;this.data=Array.from({length:p.channels*5},()=>new Float32Array(p.frames));this.port.onmessage=({data})=>{try{if(data.kind==='dispose'){this.done=true;return;}if(data.kind!=='native-clock-spec'||this.codec)throw Error('Delay authority capture requires one actual clock binding');this.codec=new NativeContextClockCodec(data.spec,{allowGaps:false,requireInitialCycleZero:true});if(data.spec.epochFrame!==0)throw Error('Delay authority capture must start at Native frame0');this.port.postMessage({kind:'clock-bound',spec:data.spec});}catch(error){this.fail(error);}};}
 fail(error){if(this.done)return;this.done=true;this.port.postMessage({kind:'error',error:String(error),offset:this.offset,firstFrame:this.firstFrame,clock:this.codec?.snapshot()??null});}
 process(inputs,outputs,parameters){outputs[0][0].fill(0);if(this.done)return false;try{
  if(!this.codec)throw Error('Delay authority capture pulled before its clock-bound handshake');
  const frame=this.codec.next(parameters,{allowPending:true});if(frame===null)return true;
  if(frame!==this.offset)throw Error('Delay authority capture has missing, repeated or skipped Native frames');
  if(inputs.length!==5||inputs.some(input=>input.length!==this.channels||input.some(plane=>plane.length!==128)))throw Error('Delay authority capture needs complete actual input/output layouts');
  this.firstFrame??=frame;for(let port=0;port<5;port++)for(let channel=0;channel<this.channels;channel++)this.data[port*this.channels+channel].set(inputs[port][channel],this.offset);
  this.offset+=128;this.quanta++;if(this.offset===this.frames){this.done=true;this.port.postMessage({kind:'captured',firstFrame:this.firstFrame,lastFrame:frame,offset:this.offset,frames:this.frames,quanta:this.quanta,clock:this.codec.snapshot(),lastRawFrame:typeof currentFrame==='number'?currentFrame:null,rawClockAuthority:false,data:this.data},this.data.map(plane=>plane.buffer));return false;}return true;
 }catch(error){this.fail(error);return false;}}
}
registerProcessor('instrument-delay-live-capture-v1',InstrumentDelayLiveCapture);
