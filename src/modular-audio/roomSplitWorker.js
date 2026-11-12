import{OwnedRoomConvolver,validateRoomConvolutionAssets}from'./ownedRoomConvolver.js';
import{roomSplitGeometry}from'./roomSplitProgram.js';
export class RoomSplitWorker{
 constructor(p,post){
  this.identity=p.identity;this.post=post;this.unit=null;this.direct=null;this.disposed=false;this.error=null;this.frame=0;this.blocks=0;this.maxRenderMs=0;this.totalRenderMs=0;this.releaseErrors=[];
  try{this.g=roomSplitGeometry(p.program);validateRoomConvolutionAssets(p.assets,p.program.room);if(p.identity?.clockVersion!=='7a0838a735108706'||!Number.isInteger(p.identity.ownerGeneration)||p.identity.ownerGeneration<1||p.assets.colour.manifest.version!==p.identity.components?.colour||p.assets.convolver.manifest.version!==p.identity.components?.convolver)throw Error('Split Room Worker identity differs');this.program=p.program;this.unit=new OwnedRoomConvolver(p.assets,p.program.room);this.emit({kind:'ready',geometry:this.g,stats:this.stats()});}catch(e){this.fail(e);}
 }
 emit(d){this.post({...d,identity:this.identity});}
 receive(d){
  if(d?.kind==='dispose'){this.dispose();this.emit({kind:'disposed',request:d.request,releasedOwners:true,releaseErrors:this.releaseErrors});return;}
  try{
   if(this.disposed||this.error)throw Error('Split Room Worker unavailable');if(!Number.isInteger(d?.request)||d.request<1||d.request>4294967295)throw Error('Split Room Worker request differs');
   if(d.kind==='attach'){if(this.direct||!d.port)throw Error('Split Room direct port differs');this.direct=d.port;this.direct.onmessage=({data})=>this.pcm(data);this.direct.start?.();this.emit({kind:'attached',request:d.request});}
   else if(d.kind==='stats')this.emit({kind:'stats',request:d.request,stats:this.stats()});
   else if(d.kind==='colour'){
    if(!['predelay','damping'].includes(d.parameter)||!Number.isFinite(d.value)||d.parameter==='predelay'&&(d.value<0||d.value>.225)||d.parameter==='damping'&&(d.value<200||d.value>20000)||!Number.isSafeInteger(d.frame)||d.frame%128||d.frame<0||d.frame>=this.g.frames)throw Error('Invalid source-domain Room colour target');
    const frontier=this.unit.colour.stats().generatedUntil;if(d.frame<frontier){this.emit({kind:'control-rejected',request:d.request,error:'Split Room source colour deadline already rendered',sourceFrame:d.frame,generatedUntil:frontier});return;}
    try{this.unit.colour.scheduleFrame(d.parameter,d.frame,d.value);this.emit({kind:'colour-accepted',request:d.request,sourceFrame:d.frame,generatedUntil:frontier,effectiveOutputOffset:d.frame+this.g.latencyFrames});}catch(e){this.emit({kind:'control-rejected',request:d.request,error:String(e),sourceFrame:d.frame,generatedUntil:frontier});}
   }else throw Error('Unknown split Room Worker command');
  }catch(e){this.fail(e);}
 }
 pcm(p){
  try{
   const g=this.g;if(this.disposed||this.error||!this.unit||p?.kind!=='pcm'||p.generation!==this.identity.ownerGeneration||p.frame!==this.frame||p.frame%g.blockFrames||p.frames!==Math.min(g.blockFrames,g.frames-this.frame)||p.frames<1||!(p.buffer instanceof ArrayBuffer)||p.buffer.byteLength!==g.packetPlanes*g.blockFrames*4)throw Error('Split Room PCM frontier/layout differs');
   const pcm=new Float32Array(p.buffer);for(let c=0;c<g.inputChannels;c++)for(let i=0;i<p.frames;i++){const x=pcm[c*g.blockFrames+i];if(!Number.isFinite(x))throw Error('Nonfinite split Room source');this.unit.input[c][i]=x;}
   const begin=performance.now();this.unit.render(p.frames);const ms=performance.now()-begin;this.maxRenderMs=Math.max(this.maxRenderMs,ms);this.totalRenderMs+=ms;
   // Original dry planes remain untouched in the transferred packet.
   for(let c=0;c<g.wetChannels;c++)for(let i=0;i<p.frames;i++){const x=this.unit.output[c][i];if(!Number.isFinite(x))throw Error('Nonfinite split Room wet publication');pcm[(g.inputChannels+c)*g.blockFrames+i]=x;}
   this.frame+=p.frames;this.blocks++;this.direct.postMessage({kind:'pcm',generation:this.identity.ownerGeneration,frame:p.frame,frames:p.frames,buffer:p.buffer},[p.buffer]);if(this.frame===g.frames)this.emit({kind:'processed',stats:this.stats(),scope:'Worker source budget processed; output mix/drain remain separate'});
  }catch(e){this.fail(e);}
 }
 stats(){return{frame:this.frame,blocks:this.blocks,maxRenderMs:this.maxRenderMs,totalRenderMs:this.totalRenderMs,error:this.error,disposed:this.disposed,room:this.unit?.stats()??null,geometry:this.g};}
 fail(e){if(this.error||this.disposed)return;this.error=String(e);let stats;try{stats=this.stats();}catch{}this.emit({kind:'error',error:this.error,stats});try{this.direct?.postMessage({kind:'error',error:this.error,generation:this.identity?.ownerGeneration});}catch{}this.dispose();}
 dispose(){if(this.disposed)return;this.disposed=true;for(const action of[()=>this.unit?.colour?.dispose(),()=>this.unit?.convolver?.dispose(),()=>this.direct?.close()])try{action();}catch(e){this.releaseErrors.push(String(e));}this.unit=null;this.direct=null;}
}
