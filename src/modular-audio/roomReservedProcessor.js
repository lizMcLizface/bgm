import{NativeContextClockCodec,validateNativeContextClockSpec,nativeContextClockDescriptors}from'./nativeContextClockCodec.js';
import{roomAmountDescriptors}from'./roomAmountWords.js';
import{RoomReservedCore as RoomControlCore}from'./roomReservedCore.js';
export const roomControlDescriptors=()=>[{name:'hostDemand',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},...nativeContextClockDescriptors(),...roomAmountDescriptors()];
export class RoomReservedProcessor{
 constructor(p,port,rate){
  this.port=port;this.identity=p.identity;this.core=null;this.codec=null;this.error=null;this.disposed=false;this.released=false;this.releaseErrors=[];this.pending=[];this.lastRawFrame=null;this.mode=0;port.onmessage=({data})=>this.message(data);
  try{if(p.identity?.hostVersion!=='__ROOM_RESERVED_HOST_VERSION__'||p.identity?.kernelVersion!=='__ROOM_RESERVED_KERNEL_VERSION__'||p.identity?.clockVersion!=='7a0838a735108706'||!(p.module instanceof WebAssembly.Module)||p.configuration?.sampleRate!==rate)throw Error('Room output controller identity differs');this.configuration=p.configuration;this.core=new RoomControlCore(p.module,p.configuration,{emit:d=>this.emit(d)});this.emit({kind:'ready',stats:this.snapshot()});}catch(e){this.fail(e);}
 }
 emit(d){this.port.postMessage({...d,identity:this.identity});}
 message(d){
  if(d?.kind==='native-clock-spec'){try{const spec=validateNativeContextClockSpec(d.spec);if(spec.rate!==this.configuration?.sampleRate||this.codec&&JSON.stringify(spec)!==JSON.stringify(this.codec.spec))throw Error('Room output clock generation changed');this.codec??=new NativeContextClockCodec(spec);this.emit({kind:'clock-bound',spec});}catch(e){this.fail(e);}return;}
  if(d?.kind==='native-clock-failed'){if(!this.codec||d.generation!==this.codec.spec.generation)this.fail(Error('Room clock retirement identity differs'));else this.fail(Error(d.error));return;}
  if(d?.kind==='dispose'){this.release();this.disposed=true;this.port.postMessage({type:'disposed',version:1,released:true,clean:this.releaseErrors.length===0,error:this.releaseErrors.join('; ')||null,identity:this.identity});return;}
  if(d?.kind==='amount-prepare'||d?.kind==='amount-cancel'){let admitted=false;try{if(this.disposed||this.error)throw Error(this.error??'Reserved Room controller disposed');if(!Number.isInteger(d.request)||d.request<1||d.request>4294967295)throw Error('Invalid prepared amount request');if(d.kind==='amount-prepare'){this.core.reserveReady(d.id,d.value);admitted=true;this.emit({kind:'amount-ready',request:d.request,id:d.id,value:d.value,reserved:true});}else{this.core.cancelReady(d.id);admitted=true;this.emit({kind:'amount-cancelled',request:d.request,id:d.id,cancelled:true});}}catch(e){if(admitted)this.fail(e);else this.emit({kind:'rejected',request:d?.request,error:String(e)});}return;}
  try{
   if(this.disposed||this.error)throw Error(this.error??'Room output controller disposed');if(!Number.isInteger(d?.request)||d.request<1||d.request>4294967295)throw Error('Invalid Room controller request');
   if(d.kind==='flush'){if(!Number.isInteger(d.sequence)||d.sequence<0||d.sequence>16777215)throw Error('Invalid Room flush watermark');if(d.sequence>this.core.appliedSequence){if(this.pending.length>=16)throw Error('Room flush request capacity');this.pending.push({request:d.request,sequence:d.sequence});return;}}
   else if(d.kind!=='stats')throw Error('Unknown Room controller request');
   this.emit({kind:'stats',request:d.request,stats:this.snapshot()});
  }catch(e){this.emit({kind:'rejected',request:d?.request,error:String(e)});}
 }
 release(){if(this.released)return;for(const action of[()=>this.core?.dispose(),()=>this.onRelease?.()])try{action();}catch(e){this.releaseErrors.push(String(e));}this.core=null;this.released=true;for(const p of this.pending)this.emit({kind:'rejected',request:p.request,error:'Disposed Room controller'});this.pending.length=0;}
 fail(e){if(this.error)return;this.error=String(e);let stats;try{stats=this.snapshot();}catch{}this.release();this.emit({kind:'error',error:this.error,stats});}
 snapshot(){return{identity:this.identity,configuration:this.configuration,core:this.core?.stats()??null,clock:this.codec?.snapshot()??null,rawFrame:this.lastRawFrame,mode:this.mode,error:this.error,disposed:this.disposed,released:this.released,releaseErrors:[...this.releaseErrors],scope:'Original output-time gain controller. Authored Native seconds preserved; late visibility counted, no already-emitted audio reconstruction.'};}
 decode(parameters,isolated){
  if(!this.codec){if(!isolated)throw Error('Room active output lacks Native clock');return null;}
  return this.codec.next(parameters,{allowPending:isolated});
 }
 controls(parameters,frame,isolated){
  this.core.sync(frame,{isolated});this.core.receive(parameters);
  for(let i=0;i<this.pending.length;){const p=this.pending[i];if(p.sequence<=this.core.appliedSequence){this.emit({kind:'stats',request:p.request,stats:this.snapshot()});this.pending.splice(i,1);}else i++;}
 }
 process(inputs,outputs,parameters,rawFrame){
  const out=outputs[0]??[];for(const p of out)p.fill(0);if(this.disposed||this.error)return false;
  try{
   this.lastRawFrame=rawFrame;const demand=parameters.hostDemand;if(!(demand instanceof Float32Array)||![1,128].includes(demand.length)||demand.some(v=>v!==0&&v!==1))throw Error('Room output demand must be literal Boolean');const pulled=demand[demand.length-1]===1;
   const dry=inputs[0]??[],wet=inputs[1]??[];if(out.length!==Math.max(this.configuration.sourceChannels,this.configuration.wetChannels)||out.some(p=>p.length!==128)||dry.length&&dry.length!==this.configuration.sourceChannels||wet.length&&wet.length!==this.configuration.wetChannels||dry.some(p=>p.length!==128)||wet.some(p=>p.length!==128))throw Error('Room branch layout differs');
   if(!pulled&&(dry.length||wet.length))throw Error('Unpulled Room control service requires isolated program inputs');
   const frame=this.decode(parameters,!pulled);if(frame===null)return true;this.controls(parameters,frame,!pulled);
   const dryMode=pulled?(dry.length?2:1):0,wetMode=pulled?(wet.length?2:1):0;this.mode=Math.max(dryMode,wetMode);const result=this.core.render(dry,wet,{dryMode,wetMode});for(let c=0;c<out.length;c++)out[c].set(result[c]);return true;
  }catch(e){for(const p of out)p.fill(0);this.fail(e);return false;}
 }
}
