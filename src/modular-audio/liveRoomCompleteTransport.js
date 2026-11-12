import {NativeContextClockCodec,nativeContextClockDescriptors,validateNativeContextClockSpec} from './nativeContextClockCodec.js';
import {roomLiveInteger} from './liveRoomCompleteProgram.js';
import {validateLiveRoomIdentity,validateLiveRoomRequest,liveRoomReceipt} from './liveRoomCompleteProtocol.js';
export {nativeContextClockDescriptors};
export class LiveRoomCompleteTransport{
 constructor(options,port,rate){
  this.port=port;this.identity=validateLiveRoomIdentity(options.identity);this.g=options.geometry;const g=this.g;
  if(g.sampleRate!==rate||![1,2].includes(g.inputChannels)||![1,2].includes(g.outputChannels)||g.outputChannels<g.inputChannels||!roomLiveInteger(g.blockFrames,128,2048)||g.blockFrames%128||!roomLiveInteger(g.frames,128,rate*3600)||g.frames%128||!roomLiveInteger(g.earliestInputFrame,0,g.frames-128)||g.earliestInputFrame%128||!roomLiveInteger(g.latencyFrames,2*g.blockFrames,rate*2)||g.latencyFrames%128||g.latencyFrames!==Math.max(2*g.blockFrames,Math.ceil(rate*.5/128)*128)||g.poolBlocks!==Math.ceil(g.latencyFrames/g.blockFrames)+4||g.poolBlocks>192)throw Error('Complete live Room transport geometry differs');
  this.disposed=false;this.failed=null;this.direct=null;this.codec=null;this.clockSpec=null;this.epoch=null;this.rawFrame=null;this.sourceFrame=0;this.outputFrame=0;this.returnedFrame=0;this.capture=null;this.captureOffset=0;this.captureFrame=0;this.inFlight=0;this.queued=0;this.drained=false;this.underrunFrames=0;this.rejectedPackets=0;this.minReadyFrames=null;this.highWater=0;this.releaseErrors=[];
  this.free=Array.from({length:g.poolBlocks},()=>new Float32Array(Math.max(g.inputChannels,g.outputChannels)*g.blockFrames));this.ready=new Array(g.poolBlocks).fill(null);
  port.onmessage=({data})=>this.receive(data);this.send('ready',0,{geometry:g});
 }
 send(kind,request=0,extra={}){this.port.postMessage(liveRoomReceipt(this.identity,kind,request,extra));}
 receive(p){
  if(p?.kind==='native-clock-spec'){try{const spec=validateNativeContextClockSpec(p.spec);if(spec.rate!==this.g.sampleRate||this.clockSpec&&JSON.stringify(this.clockSpec)!==JSON.stringify(spec))throw Error('Complete live Room clock authority changed');if(!this.codec){this.clockSpec=spec;this.codec=new NativeContextClockCodec(spec,{allowGaps:true});}this.send('clock-bound',0,{clockSpec:spec});}catch(error){this.fail(error);}return;}
  if(p?.kind==='native-clock-failed'){if(!this.clockSpec||p.generation!==this.clockSpec.generation){this.fail(Error('Live Room clock retirement generation differs'));return;}this.fail(Error(p.error??'Live Room clock retired'));return;}
  try{
   validateLiveRoomRequest(p,this.identity,['attach','arm','stats','dispose']);
   if(p.kind==='dispose'){this.dispose();this.send('disposed',p.request,{releasedOwners:true,releaseErrors:this.releaseErrors,stats:this.stats()});return;}
   if(this.disposed||this.failed)throw Error('Complete live Room transport unavailable');
   if(p.kind==='attach'){if(this.direct||!p.port||typeof p.port.postMessage!=='function')throw Error('Complete live Room transport port differs');this.direct=p.port;this.direct.onmessage=({data})=>this.packet(data);this.direct.start?.();this.send('attached',p.request);return;}
   if(p.kind==='arm'){
    if(this.epoch!==null||!this.direct||!this.codec||!roomLiveInteger(p.epoch,0,Number.MAX_SAFE_INTEGER-this.g.frames-this.g.latencyFrames)||p.epoch%128||p.epoch<Math.max(this.clockSpec.epochFrame,this.codec.lastFrame??this.clockSpec.epochFrame)+256)throw Error('Complete live Room future source epoch invalid');
    this.epoch=p.epoch;this.send('armed',p.request,{epoch:p.epoch,earliestInputFrame:p.epoch+this.g.earliestInputFrame,earliestOutputFrame:p.epoch+this.g.earliestInputFrame+this.g.latencyFrames,latencyFrames:this.g.latencyFrames});return;
   }
   this.send('stats',p.request,{stats:this.stats()});
  }catch(error){this.fail(error);}
 }
 packet(p){
  if(this.disposed||this.failed)return;
  try{
   const g=this.g;if(p?.kind==='error')throw Error(p.error);
   if(p?.kind!=='pcm'||p.generation!==this.identity.generation||p.frame!==this.returnedFrame||p.frames!==Math.min(g.blockFrames,g.frames-this.returnedFrame)||p.frames<1||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==Math.max(g.inputChannels,g.outputChannels)*g.blockFrames*4||this.inFlight<1)throw Error('Complete live Room return packet/frontier differs');
   const index=(p.frame/g.blockFrames)%g.poolBlocks;if(p.frame<this.outputFrame||this.ready[index])throw Error('Complete live Room late/duplicate packet');
   const pcm=new Float32Array(p.buffer);for(let c=0;c<g.outputChannels;c++)for(let i=0;i<p.frames;i++)if(!Number.isFinite(pcm[c*g.blockFrames+i]))throw Error('Complete live Room return contains nonfinite PCM');
   this.ready[index]={frame:p.frame,frames:p.frames,pcm};this.returnedFrame+=p.frames;this.inFlight--;this.queued++;this.highWater=Math.max(this.highWater,this.queued);
  }catch(error){this.rejectedPackets++;this.fail(error);}
 }
 process(inputs,outputs,parameters,rawFrame){
  const out=outputs[0]??[];for(const c of out)c.fill(0);if(this.disposed)return false;if(this.failed||this.drained)return true;this.rawFrame=rawFrame;
  try{
   if(out.length!==this.g.outputChannels||out.some(c=>c.length!==128))throw Error('Complete live Room output layout changed');
   if(!this.codec){if(this.epoch!==null)throw Error('Complete live Room lacks clock authority');return true;}
   const frame=this.codec.next(parameters,{allowPending:this.epoch===null||this.sourceFrame===0});if(frame===null)return true;
   if(this.epoch===null||frame<this.epoch)return true;
   const g=this.g;if(this.sourceFrame<g.frames&&frame-this.epoch!==this.sourceFrame||this.outputFrame<g.frames&&frame>=this.epoch+g.latencyFrames&&frame-this.epoch-g.latencyFrames!==this.outputFrame)throw Error('Complete live Room clock missed an active source/output frontier');
   const input=inputs[0]??[];
   for(let i=0;i<128;i++){
    if(this.sourceFrame<g.frames){
     if(this.sourceFrame>=g.earliestInputFrame&&input.length!==g.inputChannels)throw Error('Complete live Room known input layout ended/changed');
     if(!this.capture){this.capture=this.free.pop();if(!this.capture)throw Error('Complete live Room input credits exhausted');this.captureFrame=this.sourceFrame;this.captureOffset=0;}
     for(let c=0;c<g.inputChannels;c++){const x=input[c]?.[i]??0;if(!Number.isFinite(x)||this.sourceFrame<g.earliestInputFrame&&x!==0)throw Error('Complete live Room nonfinite/premature source input');this.capture[c*g.blockFrames+this.captureOffset]=x;}
     this.captureOffset++;this.sourceFrame++;
     if(this.captureOffset===g.blockFrames||this.sourceFrame===g.frames){const buffer=this.capture.buffer;this.inFlight++;this.direct.postMessage({kind:'pcm',generation:this.identity.generation,frame:this.captureFrame,frames:this.captureOffset,buffer},[buffer]);this.capture=null;}
    }
    if(frame+i>=this.epoch+g.latencyFrames&&this.outputFrame<g.frames){
     const index=Math.floor(this.outputFrame/g.blockFrames)%g.poolBlocks,packet=this.ready[index],offset=this.outputFrame%g.blockFrames;
     if(!packet||packet.frame+offset!==this.outputFrame){this.underrunFrames++;throw Error('Complete live Room output underrun');}
     for(let c=0;c<g.outputChannels;c++)out[c][i]=packet.pcm[c*g.blockFrames+offset];this.outputFrame++;
     if(offset+1===packet.frames){this.ready[index]=null;this.queued--;this.free.push(packet.pcm);}
     if(this.outputFrame===g.frames){if(this.sourceFrame!==g.frames||this.returnedFrame!==g.frames||this.inFlight!==0||this.queued!==0)throw Error('Complete live Room drain authority differs');this.drained=true;this.send('drained',0,{stats:this.stats()});}
    }
   }
   return true;
  }catch(error){for(const c of out)c.fill(0);this.fail(error);return true;}
 }
 stats(){return{epoch:this.epoch,sourceFrame:this.sourceFrame,returnedFrame:this.returnedFrame,outputFrame:this.outputFrame,inFlight:this.inFlight,queued:this.queued,highWater:this.highWater,freeBuffers:this.free?.length??0,underrunFrames:this.underrunFrames,rejectedPackets:this.rejectedPackets,drained:this.drained,disposed:this.disposed,failed:this.failed,clock:this.codec?.snapshot()??null,rawFrame:this.rawFrame};}
 fail(error){if(this.failed||this.disposed)return;this.failed=String(error);this.send('error',0,{error:this.failed,stats:this.stats()});}
 dispose(){if(this.disposed)return;this.disposed=true;for(const action of[()=>this.direct?.close(),()=>{this.free.length=0;this.ready.fill(null);this.capture=null;}])try{action();}catch(error){this.releaseErrors.push(String(error));}this.direct=null;}
}
