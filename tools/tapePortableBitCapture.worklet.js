class TapeWitnessBitCapture extends AudioWorkletProcessor{
 constructor({processorOptions:p}){super();if(!Number.isInteger(p.length)||p.length<128||p.length>65536||p.length%128)throw Error('Invalid bounded Tape bit capture');this.length=p.length;this.frame=0;this.bits=new Uint32Array(p.length);this.done=false;}
 process(inputs,outputs){for(const plane of outputs[0])plane.fill(0);if(this.done)return false;const input=inputs[0]??[];if(input.length!==1||input[0].length!==128){this.done=true;this.port.postMessage({kind:'capture-error',error:'Tape identical-capture mono layout differs',channels:input.length});return false;}this.bits.set(new Uint32Array(input[0].buffer,input[0].byteOffset,128),this.frame);this.frame+=128;if(this.frame===this.length){this.done=true;this.port.postMessage({kind:'captured-bits',frames:this.frame,bits:this.bits},[this.bits.buffer]);return false;}return true;}
}
registerProcessor('tape-witness-identical-bit-capture-v1',TapeWitnessBitCapture);
