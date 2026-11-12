import{RoomReservedProcessor,roomControlDescriptors}from'./roomReservedProcessor.js';
export{roomControlDescriptors};
export class RoomContinuousTransport extends RoomReservedProcessor{
 constructor(p,port,rate){
  super(p,port,rate);this.g=p.geometry;this.direct=null;this.epoch=null;this.running=false;this.drained=false;this.sourceFrame=0;this.returnedFrame=0;this.outputFrame=0;this.endFrame=null;this.workerSealed=false;this.capture=null;this.offset=0;this.captureFrame=0;this.inFlight=0;this.queued=0;this.rejectedPackets=0;this.underrunFrames=0;this.highWater=0;this.free=[];this.readyPackets=[];this.pendingPackets=[];this.inputStates=[];this.inputState='audio';this.inputStateCount=0;this.audioInputFrames=0;this.silentInputFrames=0;this.onRelease=()=>this.releaseTransport();
  if(this.error)return;
  try{
   const g=this.g,L=Math.max(2*g.blockFrames,Math.ceil(rate*.5/128)*128),P=Math.ceil(L/g.blockFrames)+4;
   if(g.sampleRate!==rate||g.inputChannels!==p.configuration.sourceChannels||g.wetChannels!==p.configuration.wetChannels||g.packetPlanes!==g.inputChannels+g.wetChannels||g.outputChannels!==Math.max(g.inputChannels,g.wetChannels)||!Number.isInteger(g.blockFrames)||g.blockFrames<128||g.blockFrames>2048||g.blockFrames%128||!Number.isSafeInteger(g.maxSessionFrames)||g.maxSessionFrames<128||g.maxSessionFrames%128||g.maxSessionFrames>Math.floor(rate*3600/128)*128||g.latencyFrames!==L||g.poolBlocks!==P||P>192||g.inputPcmBytes!==P*g.inputChannels*g.blockFrames*4||g.wetPcmBytes!==P*g.wetChannels*g.blockFrames*4||g.poolBytes!==g.inputPcmBytes+g.wetPcmBytes)throw Error('Continuous Room transport geometry differs');
   this.free=Array.from({length:P},()=>new Float32Array(g.packetPlanes*g.blockFrames));this.readyPackets=new Array(P).fill(null);this.pendingPackets=new Array(P).fill(null);this.emit({kind:'transport-ready',geometry:g,stats:this.snapshot()});
  }catch(e){this.fail(e);}
 }
 message(d){
  if(d?.kind==='attach'){try{if(this.disposed||this.error||this.direct||!d.port||!Number.isInteger(d.request)||d.request<1)throw Error('Continuous Room attach differs');this.direct=d.port;this.direct.onmessage=({data})=>this.packet(data);this.direct.start?.();this.emit({kind:'attached',request:d.request});}catch(e){this.fail(e);}return;}
  if(['arm','input-state','end'].includes(d?.kind)){
   try{
    if(this.disposed||this.error||!Number.isInteger(d.request)||d.request<1)throw Error('Continuous Room operation unavailable');
    if(d.kind==='arm'){
     if(this.epoch!==null||!this.direct||!this.codec||!Number.isSafeInteger(d.epoch)||d.epoch%128||d.epoch<Math.max(this.codec.spec.epochFrame,this.codec.lastFrame??this.codec.spec.epochFrame)+256||d.epoch+this.g.maxSessionFrames+this.g.latencyFrames>1099511627648||d.epoch+this.g.maxSessionFrames+this.g.latencyFrames>this.codec.expiryFrame||!['audio','silent'].includes(d.inputState??'audio'))throw Error('Continuous Room future epoch differs');
     this.epoch=d.epoch;this.inputState=d.inputState??'audio';this.running=true;this.emit({kind:'armed',request:d.request,epoch:d.epoch,firstOutputFrame:d.epoch+this.g.latencyFrames,latencyFrames:this.g.latencyFrames,maxSessionFrames:this.g.maxSessionFrames,inputState:this.inputState});return;
    }
    if(!this.running||this.drained||!Number.isSafeInteger(d.frame)||d.frame%128||d.frame<this.sourceFrame+128||d.frame>this.g.maxSessionFrames)throw Error('Continuous Room future source deadline differs');
    if(d.kind==='input-state'){
     if(!['audio','silent'].includes(d.state)||this.inputStates.length>=32||this.endFrame!==null&&d.frame>=this.endFrame||this.inputStates.length&&d.frame<this.inputStates.at(-1).frame)throw Error('Continuous Room input authority/capacity differs');
     this.inputStates.push({frame:d.frame,state:d.state});this.inputStateCount++;this.emit({kind:'input-state-accepted',request:d.request,frame:d.frame,state:d.state,sourceFrame:this.sourceFrame});return;
    }
    if(this.endFrame!==null||this.inputStates.some(p=>p.frame>=d.frame))throw Error('Continuous Room final boundary differs');
    this.endFrame=d.frame;this.emit({kind:'end-accepted',request:d.request,frame:d.frame,sourceFrame:this.sourceFrame});return;
   }catch(e){this.emit({kind:'rejected',request:d.request,error:String(e),sourceFrame:this.sourceFrame});}return;
  }
  super.message(d);
 }
 packet(p){
  if(this.disposed||this.error)return;
  try{
   const g=this.g;if(p?.kind==='error')throw Error(p.error);
   if(p?.generation!==this.identity.ownerGeneration)throw Error('Continuous Room return owner differs');
   if(p.kind==='sealed'){
    if(this.workerSealed||this.endFrame===null||p.frame!==this.endFrame||this.sourceFrame!==this.endFrame||this.returnedFrame!==this.endFrame||this.inFlight)throw Error('Continuous Room Worker seal differs');
    this.workerSealed=true;this.finish();return;
   }
   if(p?.kind!=='pcm'||p.frame!==this.returnedFrame||p.frame%g.blockFrames||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==g.packetPlanes*g.blockFrames*4||this.inFlight<1)throw Error('Continuous Room returned PCM frontier differs');
   const index=(p.frame/g.blockFrames)%g.poolBlocks,expected=this.pendingPackets[index];
   if(!expected||expected.frame!==p.frame||expected.frames!==p.frames||expected.final!==p.final||p.frame<this.outputFrame||this.readyPackets[index])throw Error('Continuous Room packet duplicate/late/layout differs');
   const pcm=new Float32Array(p.buffer);for(let c=0;c<g.packetPlanes;c++)for(let i=0;i<p.frames;i++)if(!Number.isFinite(pcm[c*g.blockFrames+i]))throw Error('Nonfinite continuous Room return');
   this.pendingPackets[index]=null;this.readyPackets[index]={frame:p.frame,frames:p.frames,pcm};this.returnedFrame+=p.frames;this.inFlight--;this.queued++;this.highWater=Math.max(this.highWater,this.queued);
  }catch(e){this.rejectedPackets++;this.fail(e);}
 }
 finish(){
  if(this.endFrame===null||this.outputFrame!==this.endFrame||!this.workerSealed)return;
  if(this.sourceFrame!==this.endFrame||this.returnedFrame!==this.endFrame||this.inFlight||this.queued||this.capture||this.free.length!==this.g.poolBlocks)throw Error('Continuous Room final drain/credit proof differs');
  this.drained=true;this.emit({kind:'drained',stats:this.snapshot()});
 }
 snapshot(){const base=super.snapshot();return{...base,transport:this.g?{geometry:this.g,epoch:this.epoch,sourceFrame:this.sourceFrame,returnedFrame:this.returnedFrame,outputFrame:this.outputFrame,endFrame:this.endFrame,workerSealed:this.workerSealed,inFlight:this.inFlight,queued:this.queued,highWater:this.highWater,freeBuffers:this.free?.length??0,rejectedPackets:this.rejectedPackets,underrunFrames:this.underrunFrames,drained:this.drained,running:this.running,inputState:this.inputState,pendingInputStates:this.inputStates?.length??0,inputStateCount:this.inputStateCount,audioInputFrames:this.audioInputFrames,silentInputFrames:this.silentInputFrames}:null};}
 releaseTransport(){for(const action of[()=>this.direct?.close(),()=>{this.free.length=0;this.readyPackets.fill(null);this.pendingPackets.fill(null);this.inputStates.length=0;this.capture=null;}])try{action();}catch(e){this.releaseErrors.push(String(e));}this.direct=null;}
 process(inputs,outputs,parameters,rawFrame){
  const out=outputs[0]??[];for(const p of out)p.fill(0);if(this.disposed||this.error)return false;
  try{
   this.lastRawFrame=rawFrame;const g=this.g,input=inputs[0]??[],isolated=!this.running||this.drained;
   if(out.length!==g.outputChannels||out.some(p=>p.length!==128)||input.length&&input.length!==g.inputChannels||input.some(p=>p.length!==128))throw Error('Continuous Room callback layout differs');
   const frame=this.decode(parameters,isolated);if(frame===null)return true;this.controls(parameters,frame,isolated);
   if(this.running&&!this.drained&&frame>=this.epoch&&(this.endFrame===null||this.sourceFrame<this.endFrame)){
    if(frame-this.epoch!==this.sourceFrame||this.sourceFrame>=g.maxSessionFrames)throw Error('Continuous Room source frontier/cap ended or skipped');
    while(this.inputStates.length&&this.inputStates[0].frame===this.sourceFrame)this.inputState=this.inputStates.shift().state;
    if(this.inputStates.length&&this.inputStates[0].frame<this.sourceFrame)throw Error('Continuous Room input authority arrived late');
    if(this.inputState==='audio'&&input.length!==g.inputChannels)throw Error('Continuous Room declared audio input missing');
    if(!this.capture){this.capture=this.free.pop();if(!this.capture)throw Error('Continuous Room input credits exhausted');this.captureFrame=this.sourceFrame;this.offset=0;}
    for(let c=0;c<g.inputChannels;c++)for(let i=0;i<128;i++){const x=this.inputState==='audio'?input[c][i]:0;if(!Number.isFinite(x))throw Error('Continuous Room nonfinite source');this.capture[c*g.blockFrames+this.offset+i]=x;}
    if(this.inputState==='audio')this.audioInputFrames+=128;else this.silentInputFrames+=128;
    this.offset+=128;this.sourceFrame+=128;const final=this.endFrame!==null&&this.sourceFrame===this.endFrame;
    if(this.offset===g.blockFrames||final){
     const buffer=this.capture.buffer,index=(this.captureFrame/g.blockFrames)%g.poolBlocks;if(this.pendingPackets[index]||this.readyPackets[index])throw Error('Continuous Room packet credit reused early');
     this.pendingPackets[index]={frame:this.captureFrame,frames:this.offset,final};this.inFlight++;
     this.direct.postMessage({kind:'pcm',generation:this.identity.ownerGeneration,frame:this.captureFrame,frames:this.offset,final,buffer},[buffer]);this.capture=null;
     if(final){this.direct.postMessage({kind:'end',generation:this.identity.ownerGeneration,frame:this.endFrame});this.emit({kind:'input-ended',frame:this.endFrame,stats:this.snapshot()});}
    }
   }
   if(this.running&&!this.drained&&frame>=this.epoch+g.latencyFrames&&(this.endFrame===null||this.outputFrame<this.endFrame)){
    if(frame-this.epoch-g.latencyFrames!==this.outputFrame)throw Error('Continuous Room output frontier skipped');
    const index=Math.floor(this.outputFrame/g.blockFrames)%g.poolBlocks,packet=this.readyPackets[index],offset=this.outputFrame%g.blockFrames;
    if(!packet||packet.frame+offset!==this.outputFrame){this.underrunFrames+=128;throw Error('Continuous Room output underrun');}
    for(let c=0;c<g.inputChannels;c++)for(let i=0;i<128;i++)this.core.unit.inputDry[c][i]=packet.pcm[c*g.blockFrames+offset+i];
    for(let c=0;c<g.wetChannels;c++)for(let i=0;i<128;i++)this.core.unit.inputWet[c][i]=packet.pcm[(g.inputChannels+c)*g.blockFrames+offset+i];
    this.core.unit.render({dryMode:2,wetMode:2});for(let c=0;c<out.length;c++)out[c].set(this.core.unit.output[c]);this.mode=2;this.outputFrame+=128;
    if(offset+128===packet.frames){this.readyPackets[index]=null;this.queued--;this.free.push(packet.pcm);}this.finish();
   }else{const mode=this.running&&!this.drained?1:0;this.mode=mode;this.core.unit.render({dryMode:mode,wetMode:mode});}
   return true;
  }catch(e){for(const p of out)p.fill(0);this.fail(e);return false;}
 }
}
