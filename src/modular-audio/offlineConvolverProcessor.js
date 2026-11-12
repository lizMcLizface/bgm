import{OwnedConvolver,validateOwnedConvolverSpec}from'./ownedConvolver.js';
/** Offline reference host only. Long FFT boundaries have no realtime admission. */
export class OfflineConvolverProcessor{
 constructor(options,port,rate){this.port=port;this.disposed=false;this.error=null;this.calls=0;this.unit=null;this.finalStats=null;port.onmessage=({data})=>this.message(data);try{
  const p=options;if(p.execution!=='offline-continuous-program-v1'||p.hostVersion!=='__HOST_VERSION__'||p.kernelVersion!=='__KERNEL_VERSION__'||!(p.module instanceof WebAssembly.Module)||!Number.isInteger(p.expectedFrames)||p.expectedFrames<1||p.expectedFrames>2147483647)throw Error('Offline convolution identity/execution differs');
  validateOwnedConvolverSpec(p.spec);if(p.spec.sampleRate!==rate)throw Error('Offline convolution rate differs');this.frames=p.expectedFrames;this.channels=p.spec.inputChannels;this.outputChannels=Math.max(this.channels,p.spec.ir.length);this.unit=new OwnedConvolver(new WebAssembly.Instance(p.module,{}).exports,p.spec);this.port.postMessage({kind:'ready',stats:this.snapshot()});
 }catch(error){this.fail(error);}}
 snapshot(){return{hostVersion:'__HOST_VERSION__',kernelVersion:'__KERNEL_VERSION__',execution:'offline-continuous-program-v1',expectedFrames:this.frames,calls:this.calls,disposed:this.disposed,error:this.error,dsp:this.unit?.stats()??this.finalStats};}
 release(){if(this.unit){this.finalStats=this.unit.stats();this.unit.dispose();this.unit=null;}}
 fail(error){if(this.error)return;this.error=String(error);this.release();this.port.postMessage({kind:'error',error:this.error,stats:this.snapshot()});}
 message(data){if(data?.kind==='dispose'){this.release();this.disposed=true;this.port.postMessage({kind:'disposed',request:data.request,stats:this.snapshot()});return;}if(data?.kind==='stats'){this.port.postMessage({kind:'stats',request:data.request,stats:this.snapshot()});return;}this.fail(Error('Unknown offline convolution operation'));}
 process(inputs,outputs){const out=outputs[0]??[];if(this.disposed||this.error){for(const c of out)c.fill(0);return false;}try{
  const input=inputs[0]??[];if(input.length!==this.channels||out.length!==this.outputChannels||input.some(c=>c.length!==128)||out.some(c=>c.length!==128)||input.some(c=>c.some(x=>!Number.isFinite(x)))||this.calls>=Math.ceil(this.frames/128))throw Error('Offline continuous-program input/layout/budget differs');
  for(let ch=0;ch<this.channels;ch++)this.unit.input[ch].set(input[ch]);this.unit.render(128);for(const plane of this.unit.output)for(let i=0;i<128;i++)if(!Number.isFinite(plane[i]))throw Error('Nonfinite offline convolution output before publication');for(let ch=0;ch<out.length;ch++)out[ch].set(this.unit.output[ch].subarray(0,128));this.calls++;return true;
 }catch(error){for(const c of out)c.fill(0);this.fail(error);return false;}}
}
