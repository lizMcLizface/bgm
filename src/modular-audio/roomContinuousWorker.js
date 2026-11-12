import{OwnedRoomConvolver,validateRoomConvolutionAssets}from'./ownedRoomConvolver.js';
import{roomContinuousGeometry}from'./roomContinuousSpec.js';
export class RoomContinuousWorker{
 constructor(p,post){
  this.identity=p.identity;this.post=post;this.unit=null;this.direct=null;this.disposed=false;this.error=null;this.frame=0;this.blocks=0;this.finalPacketEnd=null;this.sealed=false;this.maxRenderMs=0;this.totalRenderMs=0;this.releaseErrors=[];
  try{this.g=roomContinuousGeometry(p.program);validateRoomConvolutionAssets(p.assets,p.program.room);if(p.identity?.clockVersion!=='7a0838a735108706'||!Number.isInteger(p.identity.ownerGeneration)||p.identity.ownerGeneration<1||p.assets.colour.manifest.version!==p.identity.components?.colour||p.assets.convolver.manifest.version!==p.identity.components?.convolver)throw Error('Continuous Room Worker identity differs');this.unit=new OwnedRoomConvolver(p.assets,p.program.room);this.emit({kind:'ready',geometry:this.g,stats:this.stats()});}catch(e){this.fail(e);}
 }
 emit(d){this.post({...d,identity:this.identity});}
 receive(d){
  if(d?.kind==='dispose'){this.dispose();this.emit({kind:'disposed',request:d.request,releasedOwners:!this.unit&&!this.direct,releaseErrors:this.releaseErrors});return;}
  try{
   if(this.disposed||this.error)throw Error('Continuous Room Worker unavailable');if(!Number.isInteger(d?.request)||d.request<1||d.request>4294967295)throw Error('Continuous Room Worker request differs');
   if(d.kind==='attach'){if(this.direct||!d.port)throw Error('Continuous Room direct port differs');this.direct=d.port;this.direct.onmessage=({data})=>this.pcm(data);this.direct.start?.();this.emit({kind:'attached',request:d.request});}
   else if(d.kind==='stats')this.emit({kind:'stats',request:d.request,stats:this.stats()});
   else throw Error('Continuous Room has immutable colour/IR; unknown Worker command');
  }catch(e){this.fail(e);}
 }
 pcm(p){
  try{
   const g=this.g;if(this.disposed||this.error||!this.unit||!this.direct||p?.generation!==this.identity.ownerGeneration||this.sealed)throw Error('Continuous Room PCM owner unavailable');
   if(p.kind==='end'){
    if(this.finalPacketEnd===null||p.frame!==this.frame||p.frame!==this.finalPacketEnd||p.frame<128||p.frame>g.maxSessionFrames)throw Error('Continuous Room ordered END differs');
    this.sealed=true;this.direct.postMessage({kind:'sealed',generation:this.identity.ownerGeneration,frame:this.frame});
    this.emit({kind:'processed',stats:this.stats(),scope:'Explicit final input frontier sealed; audible output drain is separate'});return;
   }
   if(p.kind!=='pcm'||this.finalPacketEnd!==null||p.frame!==this.frame||p.frame%g.blockFrames||!Number.isInteger(p.frames)||p.frames<128||p.frames>g.blockFrames||p.frames%128||typeof p.final!=='boolean'||p.frames!==g.blockFrames&&!p.final||p.frame+p.frames>g.maxSessionFrames||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==g.packetPlanes*g.blockFrames*4)throw Error('Continuous Room PCM frontier/layout differs');
   const pcm=new Float32Array(p.buffer);for(let c=0;c<g.inputChannels;c++)for(let i=0;i<p.frames;i++){const x=pcm[c*g.blockFrames+i];if(!Number.isFinite(x))throw Error('Nonfinite continuous Room source');this.unit.input[c][i]=x;}
   const begin=performance.now();this.unit.render(p.frames);const ms=performance.now()-begin;this.maxRenderMs=Math.max(this.maxRenderMs,ms);this.totalRenderMs+=ms;
   for(let c=0;c<g.wetChannels;c++)for(let i=0;i<p.frames;i++){const x=this.unit.output[c][i];if(!Number.isFinite(x))throw Error('Nonfinite continuous Room wet publication');pcm[(g.inputChannels+c)*g.blockFrames+i]=x;}
   this.frame+=p.frames;this.blocks++;if(p.final)this.finalPacketEnd=this.frame;
   this.direct.postMessage({kind:'pcm',generation:this.identity.ownerGeneration,frame:p.frame,frames:p.frames,final:p.final,buffer:p.buffer},[p.buffer]);
  }catch(e){this.fail(e);}
 }
 stats(){return{frame:this.frame,blocks:this.blocks,finalPacketEnd:this.finalPacketEnd,sealed:this.sealed,maxRenderMs:this.maxRenderMs,totalRenderMs:this.totalRenderMs,error:this.error,disposed:this.disposed,room:this.unit?.stats()??null,geometry:this.g};}
 fail(e){if(this.error||this.disposed)return;this.error=String(e);let stats;try{stats=this.stats();}catch{}this.emit({kind:'error',error:this.error,stats});try{this.direct?.postMessage({kind:'error',error:this.error,generation:this.identity?.ownerGeneration});}catch{}this.dispose();}
 dispose(){if(this.disposed)return;this.disposed=true;for(const action of[()=>this.unit?.colour?.dispose(),()=>this.unit?.convolver?.dispose(),()=>this.direct?.close()])try{action();}catch(e){this.releaseErrors.push(String(e));}this.unit=null;this.direct=null;}
}
