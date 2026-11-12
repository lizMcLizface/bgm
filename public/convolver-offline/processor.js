// Static same-rate IR only. Production scheduling is worker-only until a
// separate callback deadline acceptance exists; offline reference calls allowed.
const CONVOLVER_MAX_IR=327680;
const CONVOLVER_LONG_MAX_IR=2097152;
const CONVOLVER_LONG_PROFILE='static-f64-half-spectrum-nonuniform-128-65536-v2';
const CONVOLVER_PROFILE='static-f64-nonuniform-128-8192-v1';
const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b,fields=['version','sampleRate','inputChannels','irSampleRate','normalize','ir'];
function validateOwnedConvolverSpec(spec){
 const long=spec?.version===2&&spec.profile===CONVOLVER_LONG_PROFILE,keys=long?[...fields,'profile']:fields;
 if(!spec||Object.keys(spec).length!==keys.length||!keys.every(k=>Object.hasOwn(spec,k))||!(spec.version===1||long)||!integer(spec.sampleRate,8000,192000)||spec.irSampleRate!==spec.sampleRate||!integer(spec.inputChannels,1,2)||spec.normalize!==false||!Array.isArray(spec.ir)||!integer(spec.ir.length,1,2))throw Error('Unsupported static convolver contract');
 const length=spec.ir[0]?.length;if(!integer(length,1,long?CONVOLVER_LONG_MAX_IR:CONVOLVER_MAX_IR)||!spec.ir.every(ch=>(Array.isArray(ch)||ch instanceof Float32Array)&&ch.length===length&&Array.prototype.every.call(ch,v=>typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(Math.fround(v)))))throw Error('Invalid static convolver impulse');return spec;
}
function ownedConvolverSpec(sampleRate,impulse,{inputChannels=1,irSampleRate=sampleRate,normalize=false}={}){
 const ir=impulse instanceof Float32Array||Array.isArray(impulse)&&typeof impulse[0]==='number'?[impulse]:impulse;validateOwnedConvolverSpec({version:1,sampleRate,inputChannels,irSampleRate,normalize,ir});return {version:1,sampleRate,inputChannels,irSampleRate,normalize,ir:ir.map(ch=>Array.from(ch,Math.fround))};
}
function ownedLongConvolverSpec(sampleRate,impulse,{inputChannels=1,irSampleRate=sampleRate,normalize=false}={}){const ir=impulse instanceof Float32Array||Array.isArray(impulse)&&typeof impulse[0]==='number'?[impulse]:impulse;validateOwnedConvolverSpec({version:2,profile:CONVOLVER_LONG_PROFILE,sampleRate,inputChannels,irSampleRate,normalize,ir});return {version:2,profile:CONVOLVER_LONG_PROFILE,sampleRate,inputChannels,irSampleRate,normalize,ir:ir.map(ch=>Array.from(ch,Math.fround))};}
function saveOwnedConvolverSpec(spec){validateOwnedConvolverSpec(spec);return JSON.stringify({...spec,ir:spec.ir.map(ch=>Array.from(ch,Math.fround))})+'\n';}
const loadOwnedConvolverSpec=text=>validateOwnedConvolverSpec(JSON.parse(text));
class OwnedConvolver {
 constructor(engine,spec){this.e=engine;validateOwnedConvolverSpec(spec);this.spec={...spec,ir:spec.ir.map(ch=>Array.from(ch,Math.fround))};this.spec.ir.forEach(Object.freeze);Object.freeze(this.spec.ir);Object.freeze(this.spec);this.executionPolicy='worker-only; offline reference permitted';if(engine.convolver_api()!==1)throw Error('Static convolver ABI mismatch');const p=this.spec;const create=p.version===2?engine.convolver_new_long:engine.convolver_new;if(typeof create!=='function')throw Error('Convolver profile ABI missing');this.handle=create(p.sampleRate,p.inputChannels,p.ir.length,p.ir[0].length);if(!this.handle)throw Error('Static convolver creation rejected');try{for(let ch=0;ch<p.ir.length;ch++)new Float32Array(engine.memory.buffer,engine.convolver_ir(this.handle,ch),p.ir[ch].length).set(p.ir[ch]);if(!engine.convolver_prepare(this.handle))throw Error('Static convolver preparation rejected');this.refresh();}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Static convolver disposed');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=Array.from({length:this.spec.inputChannels},(_,ch)=>new Float32Array(this.memory,this.e.convolver_input(this.handle,ch),2048));this.stereoInput=[0,1].map(ch=>new Float32Array(this.memory,this.e.convolver_input(this.handle,ch),2048));this.output=Array.from({length:Math.max(this.spec.inputChannels,this.spec.ir.length)},(_,ch)=>new Float32Array(this.memory,this.e.convolver_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames){this.alive();if(!integer(frames,0,2048))throw Error('Invalid static convolver render bounds');if(this.memory!==this.e.memory.buffer)throw Error('Static convolver memory grew; refresh outside render');if(!this.e.convolver_render(this.handle,frames))throw Error('Static convolver render rejected');}
 renderStereoToMono(frames){this.alive();if(this.spec.inputChannels!==1||!integer(frames,0,2048))throw Error('Invalid explicit stereo-to-mono render bounds');if(this.memory!==this.e.memory.buffer)throw Error('Static convolver memory grew; refresh outside render');if(typeof this.e.convolver_render_stereo_to_mono!=='function'||!this.e.convolver_render_stereo_to_mono(this.handle,frames))throw Error('Explicit stereo-to-mono render rejected');}
 reset(){this.alive();this.e.convolver_reset(this.handle);}
 stats(){this.alive();return Object.fromEntries(['frame','peak','latencyFrames','irFrames','inputChannels','irChannels','outputChannels','ownedBytes','groups','maxFFTSize','forwardFFTs','inverseFFTs','rejectedInputs','sampleRate','prepared','longProfile','tailBlockFrames','spectralPartitions'].map((key,index)=>[key,this.e.convolver_stat(this.handle,index)]));}
 snapshot(){this.alive();return loadOwnedConvolverSpec(saveOwnedConvolverSpec(this.spec));}
 dispose(){if(this.handle){this.e.convolver_free(this.handle);this.handle=0;this.input=this.stereoInput=this.output=this.left=this.right=this.memory=null;}}
}

/** Offline reference host only. Long FFT boundaries have no realtime admission. */
class OfflineConvolverProcessor{
 constructor(options,port,rate){this.port=port;this.disposed=false;this.error=null;this.calls=0;this.unit=null;this.finalStats=null;port.onmessage=({data})=>this.message(data);try{
  const p=options;if(p.execution!=='offline-continuous-program-v1'||p.hostVersion!=='b3535a835c9ff41e'||p.kernelVersion!=='c5dbde0540bfdf83'||!(p.module instanceof WebAssembly.Module)||!Number.isInteger(p.expectedFrames)||p.expectedFrames<1||p.expectedFrames>2147483647)throw Error('Offline convolution identity/execution differs');
  validateOwnedConvolverSpec(p.spec);if(p.spec.sampleRate!==rate)throw Error('Offline convolution rate differs');this.frames=p.expectedFrames;this.channels=p.spec.inputChannels;this.outputChannels=Math.max(this.channels,p.spec.ir.length);this.unit=new OwnedConvolver(new WebAssembly.Instance(p.module,{}).exports,p.spec);this.port.postMessage({kind:'ready',stats:this.snapshot()});
 }catch(error){this.fail(error);}}
 snapshot(){return{hostVersion:'b3535a835c9ff41e',kernelVersion:'c5dbde0540bfdf83',execution:'offline-continuous-program-v1',expectedFrames:this.frames,calls:this.calls,disposed:this.disposed,error:this.error,dsp:this.unit?.stats()??this.finalStats};}
 release(){if(this.unit){this.finalStats=this.unit.stats();this.unit.dispose();this.unit=null;}}
 fail(error){if(this.error)return;this.error=String(error);this.release();this.port.postMessage({kind:'error',error:this.error,stats:this.snapshot()});}
 message(data){if(data?.kind==='dispose'){this.release();this.disposed=true;this.port.postMessage({kind:'disposed',request:data.request,stats:this.snapshot()});return;}if(data?.kind==='stats'){this.port.postMessage({kind:'stats',request:data.request,stats:this.snapshot()});return;}this.fail(Error('Unknown offline convolution operation'));}
 process(inputs,outputs){const out=outputs[0]??[];if(this.disposed||this.error){for(const c of out)c.fill(0);return false;}try{
  const input=inputs[0]??[];if(input.length!==this.channels||out.length!==this.outputChannels||input.some(c=>c.length!==128)||out.some(c=>c.length!==128)||input.some(c=>c.some(x=>!Number.isFinite(x)))||this.calls>=Math.ceil(this.frames/128))throw Error('Offline continuous-program input/layout/budget differs');
  for(let ch=0;ch<this.channels;ch++)this.unit.input[ch].set(input[ch]);this.unit.render(128);for(const plane of this.unit.output)for(let i=0;i<128;i++)if(!Number.isFinite(plane[i]))throw Error('Nonfinite offline convolution output before publication');for(let ch=0;ch<out.length;ch++)out[ch].set(this.unit.output[ch].subarray(0,128));this.calls++;return true;
 }catch(error){for(const c of out)c.fill(0);this.fail(error);return false;}}
}

class OfflineConvolverWorklet extends AudioWorkletProcessor{constructor({processorOptions}){super();this.owner=new OfflineConvolverProcessor(processorOptions,this.port,sampleRate);}process(inputs,outputs){return this.owner.process(inputs,outputs);}}
registerProcessor('owned-offline-convolver-b3535a835c9ff41e',OfflineConvolverWorklet);
