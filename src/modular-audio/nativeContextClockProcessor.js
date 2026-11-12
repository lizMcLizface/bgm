/* Independent Native context-clock anchor __VERSION__. Metadata only; no program input. */
import{NativeContextClockCodec,nativeContextClockDescriptors}from'./nativeContextClockCodec.js';
class NativeContextClockAnchor extends AudioWorkletProcessor{
 static get parameterDescriptors(){return nativeContextClockDescriptors();}
 constructor({processorOptions:p}){super();this.done=false;this.error=null;this.announced=false;this.lastRaw=null;this.maxRawLag=0;this.minRawLag=0;this.port.onmessage=({data})=>this.message(data);try{this.codec=new NativeContextClockCodec(p.spec,{allowGaps:false,requireInitialCycleZero:true,maxPendingQuanta:Math.min(3000,Math.ceil(sampleRate*1.5/128)+4)});if(p.version!=='__VERSION__'||p.spec.rate!==sampleRate)throw Error('Native clock anchor identity differs');}catch(error){this.fail(error);}}
 snapshot(){return{version:'__VERSION__',codec:this.codec?.snapshot()??null,anchorReady:this.announced,lastRaw:this.lastRaw,maxRawLag:this.maxRawLag,minRawLag:this.minRawLag,done:this.done,error:this.error};}
 fail(error){if(this.error)return;this.error=String(error);this.done=true;this.port.postMessage({kind:'clock-error',error:this.error,stats:this.snapshot()});}
 message(d){if(d?.kind==='dispose'){this.done=true;this.port.postMessage({kind:'disposed',request:d.request});return;}if(d?.kind==='stats')this.port.postMessage({kind:'stats',request:d.request,stats:this.snapshot()});}
 process(inputs,outputs,parameters){for(const a of outputs[0])a.fill(0);if(this.done)return false;try{this.lastRaw=currentFrame;const frame=this.codec.next(parameters,{allowPending:true});if(frame!==null){this.maxRawLag=Math.max(this.maxRawLag,frame-currentFrame);this.minRawLag=Math.min(this.minRawLag,frame-currentFrame);if(!this.announced){this.announced=true;this.port.postMessage({kind:'ready',stats:this.snapshot()});}}return true;}catch(error){this.fail(error);return false;}}
}
registerProcessor('__PROCESSOR_NAME__',NativeContextClockAnchor);
