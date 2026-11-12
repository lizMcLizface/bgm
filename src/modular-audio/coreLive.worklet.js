import{OwnedCore,validateCoreSpec}from'./ownedCore.js';
import{OwnedFm,validateFmSpec}from'./ownedFm.js';
import{flattenFM}from'./legacyPatchTransition.js';
import{RustPatchTransition}from'./rustPatchTransition.js';
import{HostRenderClock}from'./hostRenderClock.js';
const home={mode:0,portamento:0,glide:'overlap'};
class OwnedCoreLiveProcessor extends AudioWorkletProcessor{
 constructor({processorOptions:o}){super();this.failed=false;this.disposed=false;this.kind=o.kind;this.report=0;this.rendered=0;this.clock=new HostRenderClock();this.offline=!!o.offline;this.stopFrame=this.offline&&Number.isSafeInteger(o.stopFrame)?o.stopFrame:null;
  try{if(!['subtractive','fm'].includes(o.kind))throw Error('Unsupported owned core kind');this.validate=o.kind==='fm'?validateFmSpec:validateCoreSpec;const spec=this.validate({version:1,patch:o.patch,performance:o.performance??home,events:o.events??[],edits:o.patches??[]});const engine=new WebAssembly.Instance(o.module,{}).exports;this.unit=new(o.kind==='fm'?OwnedFm:OwnedCore)(engine,spec,sampleRate,(values,performance,apply,onPerformance,_discrete,_log,rate)=>new RustPatchTransition(engine,values,performance,apply,onPerformance,o.kind==='fm',rate));this.views=[this.unit.left.subarray(0,128),this.unit.right.subarray(0,128)];this.port.onmessage=({data})=>this.receive(data);this.port.postMessage({type:'ready',kind:this.kind,engineVersion:o.engineVersion});}catch(e){this.fail(e);}
 }
 receive(data){try{if(data.type==='dispose'){this.stop();this.port.postMessage({type:'disposed',version:1,released:true,clean:true,request:data.request});return;}if(this.failed)throw Error('Owned source stopped');const u=this.unit;
  if(data.type==='events'){const p=this.validate({version:1,patch:u.spec.patch,performance:home,events:data.values,edits:[]});for(const e of p.events)if(!u.e[this.kind==='fm'?'fm_owned_event':'core_owned_event'](u.handle,...e))throw Error('Owned source event capacity exceeded');}
  else if(data.type==='parameters'){const at=Math.max(u.clock,Number.isFinite(data.frame)?data.frame:currentFrame),p=this.validate({version:1,patch:data.patch,performance:data.performance??u.transition.performance,events:[],edits:[{frame:at,seconds:data.seconds??.06,patch:data.patch,performance:data.performance??u.transition.performance}]});u.transition.schedule(this.kind==='fm'?flattenFM(p.patch):p.patch,p.performance,at,data.seconds??.06);}
  else if(data.type==='panic')u.panic();
  else if(data.type==='stats'||data.type==='sync')this.port.postMessage({type:data.type,request:data.request,...u.stats(),clock:this.clock.snapshot(),memory:u.e.memory.buffer.byteLength});
  else throw Error('Unknown owned source message');
 }catch(e){this.fail(e);}}
 stop(){if(this.disposed)return;this.disposed=true;this.unit?.dispose();this.unit=null;this.views=null;}
 fail(e){this.failed=true;this.port.postMessage({type:'error',message:String(e)});this.stop();}
 process(_inputs,outputs){if(this.failed||this.disposed)return false;try{const out=outputs[0];if(!out?.length)return true;const n=out[0].length;if(n!==128)throw Error('Owned live sources require128-frame callbacks');const u=this.unit,frame=this.clock.next(currentFrame);if(frame!==u.clock){u.e[this.kind==='fm'?'fm_owned_set_frame':'core_owned_set_frame'](u.handle,frame);u.clock=frame;}u.render(n);out[0].set(this.views[0]);if(out[1])out[1].set(this.views[1]);this.rendered+=n;this.report+=n;if(this.report>=sampleRate){this.report=0;this.port.postMessage({type:'stats',...u.stats(),clock:this.clock.snapshot(),memory:u.e.memory.buffer.byteLength});}if(this.stopFrame!==null&&this.rendered>=this.stopFrame){this.port.postMessage({type:'stats',...u.stats(),final:true});this.stop();return false;}return true;}catch(e){for(const bus of outputs)for(const c of bus)c.fill(0);this.fail(e);return false;}}
}
registerProcessor('calmbgm-owned-core-live',OwnedCoreLiveProcessor);
