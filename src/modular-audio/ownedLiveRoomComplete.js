import {OwnedRoomConvolver,validateRoomConvolutionAssets} from './ownedRoomConvolver.js';
import {OwnedRoomCompleteMix} from './ownedRoomCompleteMix.js';
import {validateLiveRoomCompleteProgram,loadLiveRoomCompleteProgram,saveLiveRoomCompleteProgram} from './liveRoomCompleteProgram.js';
const canonical=p=>p&&typeof p==='object'?Array.isArray(p)?p.map(canonical):Object.fromEntries(Object.keys(p).sort().map(k=>[k,canonical(p[k])])):p,same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),freeze=p=>{if(p&&typeof p==='object'&&!Object.isFrozen(p)){for(const v of Object.values(p))freeze(v);Object.freeze(p);}return p;};
/** New framed-colour composition. Accepted cold offline facade remains unchanged. */
export class OwnedLiveRoomComplete{
 constructor(assets,raw){
  validateLiveRoomCompleteProgram(raw);validateRoomConvolutionAssets(assets,raw.room);
  if(!(assets?.mix?.module instanceof WebAssembly.Module)||!same(assets.mix.manifest,raw.mixIdentity))throw Error('Live Room mix identity differs');
  this.room=this.mix=null;this.frame=0;this.failed=false;this.disposed=false;this.spec=null;
  try{this.room=new OwnedRoomConvolver(assets,raw.room);this.mix=new OwnedRoomCompleteMix(assets.mix.module,raw.mix);this.spec=freeze({...raw,room:this.room.spec,mix:this.mix.spec,mixIdentity:JSON.parse(JSON.stringify(raw.mixIdentity))});this.input=this.room.input;this.output=this.mix.output;this.memories=[this.room.convolver.e.memory.buffer,this.room.colour.e.memory.buffer,this.mix.e.memory.buffer];}catch(error){try{this.dispose();}catch(cleanup){error.cleanupError=String(cleanup);}throw error;}
 }
 alive(){if(this.disposed)throw Error('Complete live Room disposed');if(this.failed)throw Error('Complete live Room failed');}
 render(frames){
  this.alive();if(!Number.isInteger(frames)||frames<1||frames>2048||this.frame+frames>this.spec.frames)throw Error('Complete live Room finite render budget');
  if(this.memories[0]!==this.room.convolver.e.memory.buffer||this.memories[1]!==this.room.colour.e.memory.buffer||this.memories[2]!==this.mix.e.memory.buffer)throw Error('Complete live Room memory changed');
  for(let c=0;c<this.input.length;c++)for(let i=0;i<frames;i++)if(!Number.isFinite(this.input[c][i])||(this.frame+i<this.spec.earliestInputFrame&&this.input[c][i]!==0))throw Error('Nonfinite or premature complete live Room input');
  try{for(let c=0;c<this.input.length;c++)this.mix.inputDry[c].set(this.input[c].subarray(0,frames));this.room.render(frames);for(let c=0;c<this.room.output.length;c++)this.mix.inputWet[c].set(this.room.output[c].subarray(0,frames));this.mix.render(frames);this.frame+=frames;}catch(error){this.failed=true;throw error;}
 }
 stats(){return{frame:this.frame,failed:this.failed,inputChannels:this.input?.length??0,outputChannels:this.output?.length??0,room:this.room?.stats()??null,mix:this.mix?.stats()??null,memoryBytes:this.memories?.reduce((s,b)=>s+b.byteLength,0)??0};}
 snapshot(){return loadLiveRoomCompleteProgram(saveLiveRoomCompleteProgram(this.spec));}
 dispose(){if(this.disposed)return;this.disposed=true;const issues=[];for(const owner of[this.room?.colour,this.room?.convolver,this.mix])try{owner?.dispose();}catch(error){issues.push(error);}this.input=this.output=this.memories=null;this.room=this.mix=null;if(issues.length)throw new AggregateError(issues,'Complete live Room numerical cleanup failed');}
}
