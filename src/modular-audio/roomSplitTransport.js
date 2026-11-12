import{RoomControlProcessor,roomControlDescriptors}from'./roomControlProcessor.js';
export{roomControlDescriptors};
export class RoomSplitTransport extends RoomControlProcessor{
 constructor(p,port,rate){
  super(p,port,rate);this.g=p.geometry;this.direct=null;this.epoch=null;this.running=false;this.drained=false;this.sourceFrame=0;this.returnedFrame=0;this.outputFrame=0;this.capture=null;this.offset=0;this.captureFrame=0;this.inFlight=0;this.queued=0;this.rejectedPackets=0;this.underrunFrames=0;this.highWater=0;this.free=[];this.readyPackets=[];this.onRelease=()=>this.releaseTransport();
  if(this.error)return;
  try{
   const g=this.g;if(g.sampleRate!==rate||g.inputChannels!==p.configuration.sourceChannels||g.wetChannels!==p.configuration.wetChannels||g.packetPlanes!==g.inputChannels+g.wetChannels||g.outputChannels!==Math.max(g.inputChannels,g.wetChannels)||!Number.isInteger(g.blockFrames)||g.blockFrames<128||g.blockFrames>2048||g.blockFrames%128||!Number.isSafeInteger(g.frames)||g.frames<128||g.frames%128||g.frames>rate*3600||g.latencyFrames!==Math.max(2*g.blockFrames,Math.ceil(rate*.5/128)*128)||g.poolBlocks!==Math.ceil(g.latencyFrames/g.blockFrames)+4||g.poolBlocks>192)throw Error('Split Room transport geometry differs');
   this.free=Array.from({length:g.poolBlocks},()=>new Float32Array(g.packetPlanes*g.blockFrames));this.readyPackets=new Array(g.poolBlocks).fill(null);this.emit({kind:'transport-ready',geometry:g,stats:this.snapshot()});
  }catch(e){this.fail(e);}
 }
 message(d){
  if(d?.kind==='attach'){try{if(this.disposed||this.error||this.direct||!d.port||!Number.isInteger(d.request)||d.request<1)throw Error('Split Room attach differs');this.direct=d.port;this.direct.onmessage=({data})=>this.packet(data);this.direct.start?.();this.emit({kind:'attached',request:d.request});}catch(e){this.fail(e);}return;}
  if(d?.kind==='arm'){
   try{if(this.disposed||this.error||this.epoch!==null||!this.direct||!this.codec||!Number.isSafeInteger(d.epoch)||d.epoch%128||d.epoch<Math.max(this.codec.spec.epochFrame,this.codec.lastFrame??this.codec.spec.epochFrame)+256||d.epoch+this.g.frames+this.g.latencyFrames>1099511627648)throw Error('Split Room future epoch differs');this.epoch=d.epoch;this.running=true;this.emit({kind:'armed',request:d.request,epoch:d.epoch,firstOutputFrame:d.epoch+this.g.latencyFrames,latencyFrames:this.g.latencyFrames,frames:this.g.frames});}catch(e){this.emit({kind:'rejected',request:d.request,error:String(e)});}return;
  }
  super.message(d);
 }
 packet(p){
  if(this.disposed||this.error)return;
  try{const g=this.g;if(p?.kind==='error')throw Error(p.error);if(p?.kind!=='pcm'||p.generation!==this.identity.ownerGeneration||p.frame!==this.returnedFrame||p.frames!==Math.min(g.blockFrames,g.frames-this.returnedFrame)||p.frames<1||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==g.packetPlanes*g.blockFrames*4||this.inFlight<1)throw Error('Split Room returned PCM frontier differs');const index=(p.frame/g.blockFrames)%g.poolBlocks;if(p.frame<this.outputFrame||this.readyPackets[index])throw Error('Split Room packet duplicate/late');const pcm=new Float32Array(p.buffer);for(let c=0;c<g.packetPlanes;c++)for(let i=0;i<p.frames;i++)if(!Number.isFinite(pcm[c*g.blockFrames+i]))throw Error('Nonfinite split Room return');this.readyPackets[index]={frame:p.frame,frames:p.frames,pcm};this.returnedFrame+=p.frames;this.inFlight--;this.queued++;this.highWater=Math.max(this.highWater,this.queued);}catch(e){this.rejectedPackets++;this.fail(e);}
 }
 snapshot(){const base=super.snapshot();return{...base,transport:this.g?{geometry:this.g,epoch:this.epoch,sourceFrame:this.sourceFrame,returnedFrame:this.returnedFrame,outputFrame:this.outputFrame,inFlight:this.inFlight,queued:this.queued,highWater:this.highWater,freeBuffers:this.free?.length??0,rejectedPackets:this.rejectedPackets,underrunFrames:this.underrunFrames,drained:this.drained,running:this.running}:null};}
 releaseTransport(){for(const action of[()=>this.direct?.close(),()=>{this.free.length=0;this.readyPackets.fill(null);this.capture=null;}])try{action();}catch(e){this.releaseErrors.push(String(e));}this.direct=null;}
 process(inputs,outputs,parameters,rawFrame){
  const out=outputs[0]??[];for(const p of out)p.fill(0);if(this.disposed||this.error)return false;
  try{
   this.lastRawFrame=rawFrame;const g=this.g,input=inputs[0]??[],isolated=!this.running||this.drained;if(out.length!==g.outputChannels||out.some(p=>p.length!==128)||input.length&&input.length!==g.inputChannels||input.some(p=>p.length!==128))throw Error('Split Room callback layout differs');
   const frame=this.decode(parameters,isolated);if(frame===null)return true;this.controls(parameters,frame,isolated);
   if(this.running&&!this.drained&&frame>=this.epoch&&this.sourceFrame<g.frames){
    if(frame-this.epoch!==this.sourceFrame||input.length!==g.inputChannels)throw Error('Split Room known source frontier ended/skipped');
    if(!this.capture){this.capture=this.free.pop();if(!this.capture)throw Error('Split Room input credits exhausted');this.captureFrame=this.sourceFrame;this.offset=0;}
    for(let c=0;c<g.inputChannels;c++)for(let i=0;i<128;i++){const x=input[c][i];if(!Number.isFinite(x))throw Error('Split Room nonfinite source');this.capture[c*g.blockFrames+this.offset+i]=x;}
    this.offset+=128;this.sourceFrame+=128;if(this.offset===g.blockFrames||this.sourceFrame===g.frames){const buffer=this.capture.buffer;this.inFlight++;this.direct.postMessage({kind:'pcm',generation:this.identity.ownerGeneration,frame:this.captureFrame,frames:this.offset,buffer},[buffer]);this.capture=null;}
   }
   if(this.running&&!this.drained&&frame>=this.epoch+g.latencyFrames){
    if(frame-this.epoch-g.latencyFrames!==this.outputFrame)throw Error('Split Room output frontier skipped');
    const index=Math.floor(this.outputFrame/g.blockFrames)%g.poolBlocks,packet=this.readyPackets[index],offset=this.outputFrame%g.blockFrames;if(!packet||packet.frame+offset!==this.outputFrame){this.underrunFrames++;throw Error('Split Room output underrun');}
    for(let c=0;c<g.inputChannels;c++)for(let i=0;i<128;i++)this.core.unit.inputDry[c][i]=packet.pcm[c*g.blockFrames+offset+i];
    for(let c=0;c<g.wetChannels;c++)for(let i=0;i<128;i++)this.core.unit.inputWet[c][i]=packet.pcm[(g.inputChannels+c)*g.blockFrames+offset+i];
    this.core.unit.render({dryMode:2,wetMode:2});for(let c=0;c<out.length;c++)out[c].set(this.core.unit.output[c]);this.mode=2;this.outputFrame+=128;
    if(offset+128===packet.frames){this.readyPackets[index]=null;this.queued--;this.free.push(packet.pcm);}
    if(this.outputFrame===g.frames){if(this.sourceFrame!==g.frames||this.returnedFrame!==g.frames||this.inFlight||this.queued)throw Error('Split Room final drain differs');this.drained=true;this.emit({kind:'drained',stats:this.snapshot()});}
   }else{const mode=this.running&&!this.drained?1:0;this.mode=mode;this.core.unit.render({dryMode:mode,wetMode:mode});}
   return true;
  }catch(e){for(const p of out)p.fill(0);this.fail(e);return false;}
 }
}
