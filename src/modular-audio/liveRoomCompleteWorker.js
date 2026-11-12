import {OwnedLiveRoomComplete} from './ownedLiveRoomComplete.js';
import {liveRoomCompleteGeometry} from './liveRoomCompleteProgram.js';
import {validateLiveRoomIdentity,validateLiveRoomRequest,liveRoomReceipt} from './liveRoomCompleteProtocol.js';
export class LiveRoomCompleteWorker{
 constructor(options,post){
  this.identity=validateLiveRoomIdentity(options.identity);this.post=post;this.port=null;this.unit=null;this.disposed=false;this.failed=null;this.frame=0;this.blocks=0;this.maxRenderMs=0;this.totalRenderMs=0;this.releaseErrors=[];
  try{this.geometry=liveRoomCompleteGeometry(options.program);for(const k of['colour','convolver','mix'])if(options.assets[k]?.manifest.version!==this.identity.components[k])throw Error('Live Room Worker component differs');this.unit=new OwnedLiveRoomComplete(options.assets,options.program);this.send('ready',0,{geometry:this.geometry,stats:this.unit.stats()});}catch(error){this.fail(error);}
 }
 send(kind,request=0,extra={}){this.post(liveRoomReceipt(this.identity,kind,request,extra));}
 receive(p){
  try{validateLiveRoomRequest(p,this.identity,['attach','stats','dispose']);if(p.kind==='dispose'){this.dispose();this.send('disposed',p.request,{releasedOwners:true,releaseErrors:this.releaseErrors});return;}if(this.disposed||this.failed)throw Error('Live Room Worker unavailable');
   if(p.kind==='attach'){if(this.port||!p.port||typeof p.port.postMessage!=='function')throw Error('Live Room direct PCM port differs');this.port=p.port;this.port.onmessage=({data})=>this.pcm(data);this.port.start?.();this.send('attached',p.request);return;}
   this.send('stats',p.request,{stats:this.stats()});
  }catch(error){this.fail(error);}
 }
 pcm(p){
  try{
   if(this.disposed||this.failed||!this.unit||p?.kind!=='pcm'||p.generation!==this.identity.generation||p.frame!==this.frame||p.frame%this.geometry.blockFrames||p.frames!==Math.min(this.geometry.blockFrames,this.geometry.frames-this.frame)||!Number.isInteger(p.frames)||p.frames<1||p.frames>this.geometry.blockFrames||p.frames>this.geometry.frames-this.frame||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==Math.max(this.geometry.inputChannels,this.geometry.outputChannels)*this.geometry.blockFrames*4)throw Error('Live Room Worker PCM frontier/layout differs');
   const pcm=new Float32Array(p.buffer),g=this.geometry;
   for(let c=0;c<g.inputChannels;c++)for(let i=0;i<p.frames;i++)this.unit.input[c][i]=pcm[c*g.blockFrames+i];
   const begin=performance.now();this.unit.render(p.frames);const elapsed=performance.now()-begin;this.totalRenderMs+=elapsed;this.maxRenderMs=Math.max(this.maxRenderMs,elapsed);
   for(let c=0;c<g.outputChannels;c++)for(let i=0;i<p.frames;i++){const x=this.unit.output[c][i];if(!Number.isFinite(x))throw Error('Nonfinite complete live Room publication');pcm[c*g.blockFrames+i]=x;}
   this.frame+=p.frames;this.blocks++;this.port.postMessage({kind:'pcm',generation:this.identity.generation,frame:p.frame,frames:p.frames,buffer:p.buffer},[p.buffer]);
   if(this.frame===g.frames)this.send('processed',0,{stats:this.stats(),scope:'Worker budget processed; output delivery not yet complete'});
  }catch(error){this.fail(error);}
 }
 stats(){return{frame:this.frame,blocks:this.blocks,maxRenderMs:this.maxRenderMs,totalRenderMs:this.totalRenderMs,kernel:this.unit?.stats()??null,disposed:this.disposed,failed:this.failed};}
 fail(error){if(this.failed||this.disposed)return;this.failed=String(error);let stats;try{stats=this.stats();}catch{}try{this.send('error',0,{error:this.failed,stats});}finally{try{this.port?.postMessage({kind:'error',generation:this.identity.generation,error:this.failed});}catch{}this.dispose();}}
 dispose(){if(this.disposed)return;this.disposed=true;for(const action of[()=>this.unit?.dispose(),()=>this.port?.close()])try{action();}catch(error){this.releaseErrors.push(String(error));}this.unit=null;this.port=null;}
}
