class TapePortableLiveCapture extends AudioWorkletProcessor{
 constructor(){super();this.calls=0;this.frames=0;this.peaks=new Float64Array(4);this.energy=new Float64Array(4);this.nonzero=new Uint32Array(4);this.port.onmessage=({data})=>{if(data?.kind==='stats')this.port.postMessage({kind:'stats',request:data.request,calls:this.calls,frames:this.frames,peaks:Array.from(this.peaks),energy:Array.from(this.energy),nonzero:Array.from(this.nonzero)});};}
 process(inputs,outputs){for(const plane of outputs[0])plane.fill(0);const input=inputs[0]??[];for(let ch=0;ch<4;ch++)if(input[ch])for(const sample of input[ch]){this.peaks[ch]=Math.max(this.peaks[ch],Math.abs(sample));this.energy[ch]+=sample*sample;if(sample!==0)this.nonzero[ch]++;}this.calls++;this.frames+=128;return true;}
}
registerProcessor('tape-portable-live-health-capture-v1',TapePortableLiveCapture);
