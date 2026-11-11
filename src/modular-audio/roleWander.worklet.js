import{OwnedRoleWander}from'./ownedRoleWander.js';
class RoleWanderProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}) {
  super();this.stopped=false;this.late=0;this.epoch=o.startFrame??null;this.startup=[];
  this.unit=new OwnedRoleWander(new WebAssembly.Instance(o.module,{}).exports,o.spec);
  this.port.onmessage=({data})=>this.message(data);
  this.port.postMessage({type:'ready',startFrame:this.epoch});
 }
 settings(data) {
  if(!Number.isSafeInteger(data.frame)||data.frame<0||data.frame%128)throw Error('Invalid absolute role-motion clock');
  const relative=Math.max(0,data.frame-this.epoch),generated=this.unit.stats().frame;
  const frame=Math.max(Math.ceil(generated/128)*128,Math.ceil(relative/128)*128);
  if(data.frame<this.epoch||frame>relative)this.late++;
  this.unit.schedule(frame,data.settings);this.port.postMessage({type:'ack',request:data.request,frame,epoch:this.epoch,late:this.late});
 }
 message(data) {
  try {
   if(data.type==='dispose'){this.unit.dispose();this.stopped=true;this.port.postMessage({type:'disposed'});return;}
   if(this.stopped)throw Error('Role motion disposed');
   if(data.type==='settings') {
    if(this.epoch===null){if(this.startup.length>=64)throw Error('Role-motion startup capacity exceeded');this.startup.push(data);}else this.settings(data);
   }else if(data.type==='stats')this.port.postMessage({type:'stats',request:data.request,...this.unit.stats(),epoch:this.epoch,late:this.late});
   else throw Error('Unknown role-motion message');
  }catch(error){this.port.postMessage({type:'error',request:data.request,error:String(error)});}
 }
 process(inputs,outputs) {
  if(this.stopped){for(const bus of outputs)for(const channel of bus)channel.fill(0);return false;}
  try {
   if(this.epoch===null){this.epoch=currentFrame;for(let i=0;i<this.startup.length;i++)this.settings(this.startup[i]);this.startup.length=0;}
   if(currentFrame<this.epoch){for(const bus of outputs)for(const channel of bus)channel.fill(0);return true;}
   const n=outputs[0][0].length;let monoMask=0;
   if(n!==128)throw Error('Role motion requires128-frame callbacks');
   // Native input advances per callback even when a resumed browser global clock is stale.
   for(let b=0;b<this.unit.spec.buses;b++){const source=inputs[b];if(source?.length===1)monoMask|=1<<b;for(let c=0;c<2;c++)for(let i=0;i<n;i++)this.unit.input[b][c][i]=source?.[c]?.[i]??0;}
   this.unit.render(n,monoMask);
   for(let b=0;b<outputs.length;b++)for(let c=0;c<outputs[b].length;c++)for(let i=0;i<n;i++)outputs[b][c][i]=this.unit.output[b][c][i];
   return true;
  }catch(error){this.port.postMessage({type:'error',error:String(error)});this.unit.dispose();this.stopped=true;for(const bus of outputs)for(const channel of bus)channel.fill(0);return false;}
 }
}
registerProcessor('calmbgm-role-wander',RoleWanderProcessor);
