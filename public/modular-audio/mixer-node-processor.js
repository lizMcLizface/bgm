// Opt-in desk primitive. Separate private Wasm memory per AudioWorkletNode.
// No graph/cache quantum: strip/matrix/fader add0 frames; limiter adds3ms.
const COUNTS=[8,2,1,2],KINDS=['strip','matrix','fader','limiter'],CAPACITY=512;
class OwnedDeskPrimitive extends AudioWorkletProcessor{
 constructor({processorOptions:o}){
  super();this.alive=true;this.origin=null;this.pending=0;this.preOriginLateEvents=0;this.frames=new Float64Array(CAPACITY);this.owners=new Uint32Array(CAPACITY);this.indices=new Uint32Array(CAPACITY);this.values=new Float64Array(CAPACITY);this.handle=0;this.port.onmessage=({data:d})=>this.message(d);this.bounds=[[[0,64],[0,sampleRate/2],[0,sampleRate/2],[-12,12],[-12,12],[-12,12],[-1,1],[0,4]],[[0,2],[-1,1]],[[0,4]],[[0,1],[.05,1]]];
  try{this.kind=KINDS.indexOf(o.config?.kind);if(this.kind<0||o.config.version!==1||o.config.sampleRate!==sampleRate||typeof o.config.settled!=='boolean'||o.config.events?.length!==0||o.config.parameters?.length!==COUNTS[this.kind])throw Error('Invalid complete desk configuration');this.e=new WebAssembly.Instance(o.module,{}).exports;if(this.e.mixer_api()!==1)throw Error('Mixer ABI mismatch');this.handle=this.e.mixer_new(this.kind,sampleRate,2048);if(!this.handle)throw Error('Mixer preparation failed');for(let i=0;i<COUNTS[this.kind];i++)this.check(this.e.mixer_param(this.handle,i,o.config.parameters[i],Number(o.config.settled)));this.input=[0,1].map(ch=>new Float32Array(this.e.memory.buffer,this.e.mixer_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.e.memory.buffer,this.e.mixer_output(this.handle,ch),2048));this.port.onmessage=({data:d})=>this.message(d);this.port.postMessage({type:'ready',kind:KINDS[this.kind],contextCreatedFrame:currentFrame,latencyFrames:this.e.mixer_stat(this.handle,6)});}catch(error){if(this.handle){this.e.mixer_free(this.handle);this.handle=0;}this.fail(error);}
 }
 check(status){if(status)throw Error(`Owned desk operation rejected (${status})`);}
 fail(error){this.alive=false;this.port.postMessage({type:'error',message:String(error)});}
 message(d){try{
  if(d.type==='dispose'){this.alive=false;if(this.handle)this.e.mixer_free(this.handle);this.handle=0;this.port.postMessage({type:'disposed',request:d.request});this.port.close();return;}
  if(!this.alive)throw Error('Owned desk primitive stopped');
  if(d.type==='targets'){
   if(!Number.isSafeInteger(d.frame)||d.frame<0||!Number.isInteger(d.owner)||d.owner<1||d.owner>0xffffffff||!Array.isArray(d.values)||d.values.length>COUNTS[this.kind])throw Error('Invalid desk target packet');
   if(this.origin===null&&this.pending+d.values.length>CAPACITY)throw Error('Desk startup queue full');
   for(const p of d.values)if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||p[0]<0||p[0]>=COUNTS[this.kind]||!Number.isFinite(p[1])||p[1]<this.bounds[this.kind][p[0]][0]||p[1]>this.bounds[this.kind][p[0]][1]||this.kind===3&&p[0]===0&&!Number.isInteger(p[1]))throw Error('Invalid desk target');
   for(const [index,value]of d.values)if(this.origin===null){const i=this.pending++;this.frames[i]=d.frame;this.owners[i]=d.owner;this.indices[i]=index;this.values[i]=value;}else{if(d.frame<this.origin)this.preOriginLateEvents++;this.check(this.e.mixer_event(this.handle,Math.max(0,d.frame-this.origin),d.owner,index,value));}
   this.port.postMessage({type:'ack',request:d.request});
  }else if(d.type==='stats')this.port.postMessage({type:'stats',request:d.request,kind:KINDS[this.kind],contextOriginFrame:this.origin,pendingStartupEvents:this.pending,preOriginLateEvents:this.preOriginLateEvents,...Object.fromEntries(['frame','applied','late','overflow','queued','peak','latencyFrames','reductionGain'].map((k,i)=>[k,this.e.mixer_stat(this.handle,i)]))});
  else if(d.type==='cancel'){if(!Number.isInteger(d.owner)||d.owner<1||d.owner>0xffffffff)throw Error('Invalid desk owner');let keep=0;for(let i=0;i<this.pending;i++)if(this.owners[i]!==d.owner){this.frames[keep]=this.frames[i];this.owners[keep]=this.owners[i];this.indices[keep]=this.indices[i];this.values[keep++]=this.values[i];}this.pending=keep;this.e.mixer_cancel(this.handle,d.owner);this.port.postMessage({type:'ack',request:d.request});}
  else throw Error('Unknown owned desk message');
 }catch(error){this.fail(error);}}
 process(inputs,outputs){
  const out=outputs[0];if(!out?.length)return this.alive;if(!this.alive){for(let ch=0;ch<out.length;ch++)out[ch].fill(0);return false;}
  try{if(this.origin===null){this.origin=currentFrame;for(let i=0;i<this.pending;i++){if(this.frames[i]<this.origin)this.preOriginLateEvents++;this.check(this.e.mixer_event(this.handle,Math.max(0,this.frames[i]-this.origin),this.owners[i],this.indices[i],this.values[i]));}this.pending=0;}
   const source=inputs[0],n=out[0].length;if(n>2048)throw Error('Desk quantum exceeds prepared capacity');for(let i=0;i<n;i++){this.input[0][i]=source?.[0]?.[i]??0;this.input[1][i]=source?.[1]?.[i]??this.input[0][i];}this.check(this.e.mixer_render(this.handle,n));for(let ch=0;ch<out.length;ch++)for(let i=0;i<n;i++)out[ch][i]=this.output[Math.min(ch,1)][i];return true;
  }catch(error){this.fail(error);for(let ch=0;ch<out.length;ch++)out[ch].fill(0);return false;}
 }
}
registerProcessor('calmbgm-owned-desk-primitive',OwnedDeskPrimitive);
