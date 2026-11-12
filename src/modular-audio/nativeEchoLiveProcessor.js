import {OwnedNativeEcho} from './ownedNativeEcho.js';
import {HostRenderClock} from './hostRenderClock.js';

/** Static original topology. A missing callback freezes owned delay history.
 * Explicit clear-frame commands are for acknowledged/suspended host editing;
 * ordinary clear messages take effect when delivered, not at a guessed UI time. */
export class NativeEchoLiveProcessor {
 constructor(options, port, rate) {
  this.port=port; this.clock=new HostRenderClock(); this.stopped=false;
  this.failed=false; this.pendingClear=null; this.clears=0; this.emptyQuanta=0;
  port.onmessage=({data})=>this.receive(data);
  try {
   if(options.spec.sampleRate!==rate)throw Error('Echo context rate mismatch');
   this.unit=new OwnedNativeEcho(new WebAssembly.Instance(options.module,{}).exports,options.spec);
   this.output=this.unit.output.map(channel=>channel.subarray(0,128));
   port.postMessage({type:'ready',version:options.version,profile:'native-echo-explicit-live-pull-v1'});
  } catch(error) { this.fail(error); }
 }
 receive(data) {
  try {
   if(data?.type==='dispose') { let cleanupError=null;try{this.stop();}catch(error){cleanupError=String(error);}this.port.postMessage({type:'disposed',version:1,released:!this.unit?.handle,clean:cleanupError===null,request:data.request,...(cleanupError?{error:cleanupError}:{})});return; }
   if(this.stopped)throw Error('Echo processor stopped');
   if(data?.type==='stats') {
    this.port.postMessage({type:'stats',request:data.request,...this.unit.stats(),clock:this.clock.snapshot(),clears:this.clears,emptyQuanta:this.emptyQuanta}); return;
   }
   if(data?.type!=='clear'||!Number.isSafeInteger(data.request)||data.request<1)throw Error('Invalid echo command');
   if(data.frame===null) { this.unit.reset(); this.clears++; }
   else {
    if(!Number.isSafeInteger(data.frame)||data.frame<0||data.frame%128||this.pendingClear!==null||this.clock.renderFrame!==null&&data.frame<=this.clock.renderFrame)throw Error('Invalid or late echo clear frame');
    this.pendingClear=data.frame;
   }
   this.port.postMessage({type:data.frame===null?'cleared':'queued-clear',request:data.request,frame:data.frame});
  } catch(error) { this.fail(error); }
 }
 process(inputs,outputs,globalFrame,awake=true) {
  if(this.stopped)return false;
  try {
   const input=inputs[0]??[],output=outputs[0];
   if(input.length>2||!output||output.length!==2)throw Error('Echo requires bounded stereo128 callbacks');
   for(let c=0;c<output.length;c++)if(output[c].length!==128)throw Error('Invalid echo output quantum');
   for(let c=0;c<input.length;c++)if(input[c].length!==128)throw Error('Invalid echo input quantum');
   const frame=this.clock.next(globalFrame);
   if(this.pendingClear!==null&&this.pendingClear<=frame) {
    if(this.pendingClear!==frame)throw Error('Echo clear missed its authored frame');
    this.unit.reset();this.clears++;this.pendingClear=null;
   }
   if(typeof awake!=='boolean')throw Error('Invalid echo host demand');
   if(!awake){for(let c=0;c<2;c++)output[c].fill(0);return true;}
   if(!input.length)this.emptyQuanta++;
   for(let c=0;c<2;c++) { const source=input[c]??input[0];if(source)this.unit.input[c].set(source);else this.unit.input[c].fill(0,0,128); }
   this.unit.render(128);for(let c=0;c<2;c++)output[c].set(this.output[c]);return true;
  } catch(error) { for(const bus of outputs)for(const channel of bus)channel.fill(0);this.fail(error);return false; }
 }
 stop() { if(this.stopped)return;this.stopped=true;this.unit?.dispose();this.unit=null;this.output=null;this.pendingClear=null; }
 fail(error) { if(this.failed)return;this.failed=true;this.stop();this.port.postMessage({type:'error',message:String(error?.message??error)}); }
}
