const FREEZE_STREAM_PROFILE='owned-freeze-worker-continuous-v1';
const FREEZE_PACKET_FRAMES=1024;
const FREEZE_QUANTUM=128;
const FREEZE_COMMAND_CAPACITY=256;
const FREEZE_MAX_CREDITS=192;
const FREEZE_MAX_OWNERS=8;
const FREEZE_CONTEXT_BYTES=256*1024*1024;
const FREEZE_CONTROLLER_ALLOWANCE=1024*1024;
const FREEZE_RANDOM='xorshift32-v1';
const freezeInteger=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
function freezeStreamBudget(rate){
 if(!freezeInteger(rate,8000,192000))throw Error('Freeze requires integer8..192k rate');
 const latencyFrames=Math.ceil(rate*.5/128)*128,poolBlocks=Math.ceil(latencyFrames/FREEZE_PACKET_FRAMES)+4;
 if(poolBlocks>FREEZE_MAX_CREDITS)throw Error('Freeze credit budget exceeded');
 const plannedRustBytes=4*1024*1024+Math.ceil(100*rate/65536)*65536,pcmBytes=poolBlocks*2*FREEZE_PACKET_FRAMES*4;
 return Object.freeze({profile:FREEZE_STREAM_PROFILE,rate,blockFrames:FREEZE_PACKET_FRAMES,latencyFrames,poolBlocks,packetBytes:2*FREEZE_PACKET_FRAMES*4,plannedRustBytes,pcmBytes,controllerAllowance:FREEZE_CONTROLLER_ALLOWANCE,plannedBytes:plannedRustBytes+pcmBytes+FREEZE_CONTROLLER_ALLOWANCE});
}
function freezeStreamSpec(seed,settings={}){
 if(!freezeInteger(seed,1,0xffffffff))throw Error('Freeze requires an explicit nonzero32bit owner seed');
 const values=[settings.mix??0,settings.hold??false,settings.length??2,settings.fade??1].map((v,i)=>freezeStreamValue(i,v));
 return{version:1,kind:'freeze',seed,random:FREEZE_RANDOM,parameters:values.map((v,i)=>[i,v])};
}
function freezeStreamValue(id,value){
 if(id===1){if(value===true||value===1)return 1;if(value===false||value===0)return 0;throw Error('Invalid Freeze hold');}
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('Invalid Freeze control');
 if(id===0)return Math.min(1,Math.max(0,value));
 if(id===2)return Math.min(4,Math.max(.25,value));
 if(id===3&&value<=30)return Math.max(.02,value);
 throw Error('Freeze control exceeds prepared contract');
}
function freezeStreamCommand(raw){
 if(!raw||!freezeInteger(raw.seq,1,0xffffffff)||!['set','clear','flush'].includes(raw.kind))throw Error('Invalid Freeze command');
 if(raw.kind!=='set'){if(raw.entries!==undefined)throw Error('Unexpected Freeze command data');return{seq:raw.seq,kind:raw.kind};}
 if(!Array.isArray(raw.entries)||raw.entries.length<1||raw.entries.length>4)throw Error('Invalid Freeze settings');
 const seen=new Set(),entries=raw.entries.map(p=>{if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||seen.has(p[0]))throw Error('Invalid Freeze parameter identity');seen.add(p[0]);return[p[0],freezeStreamValue(p[0],p[1])];});
 return{seq:raw.seq,kind:'set',entries};
}
function freezeStreamLatencyContract(context,budget,contract){
 if(!contract||contract.context!==context||contract.profile!==FREEZE_STREAM_PROFILE||contract.latencyFrames!==budget.latencyFrames||contract.continuousProgram!==true||typeof contract.register!=='function')throw Error('Freeze requires caller-owned continuous-program latency authority before mutation');
 return contract;
}

/** Bounded transport only; large Freeze capture/scan never runs here. */
class FreezeStreamProcessor {
 constructor(options,host,rate){this.host=host;this.port=null;this.done=false;this.failed=false;this.armed=false;this.frame=0;this.receivedSeq=0;this.appliedSeq=0;this.pending=[];this.events=[];this.tokens=[];this.free=[];this.returns=[];this.outputPackets=[];this.current=null;this.offset=0;this.installed=0;this.nextReturnFrame=0;this.underrunFrames=0;this.highWater=0;this.callbacks=0;this.generation=options.generation;this.budget=freezeStreamBudget(rate);if(!freezeInteger(this.generation,1,0xffffffff)||JSON.stringify(options.budget)!==JSON.stringify(this.budget))throw Error('Freeze transport identity/budget differs');host.onmessage=({data})=>this.receiveHost(data);host.postMessage({type:'node-ready',generation:this.generation});}
 receiveHost(d){try{if(d?.type==='dispose'){this.dispose(d.request);return;}if(this.done)throw Error('Freeze transport stopped');if(d?.type==='attach'){if(this.port||!d.port?.postMessage)throw Error('Freeze port already attached');this.port=d.port;this.port.onmessage=({data})=>this.receiveWorker(data);this.port.start?.();return;}
  if(d?.type==='command'){const command=freezeStreamCommand(d.command);if(command.seq!==this.receivedSeq+1||command.seq-this.appliedSeq>FREEZE_COMMAND_CAPACITY||this.pending.length+this.events.length>=FREEZE_COMMAND_CAPACITY)throw Error('Freeze pending command capacity/FIFO');this.receivedSeq=command.seq;this.pending.push(command);return;}
  if(d?.type==='arm'){if(this.armed||this.installed!==this.budget.poolBlocks||!this.port)throw Error('Freeze transport is not cold-ready');this.armed=true;this.host.postMessage({type:'armed',generation:this.generation,latencyFrames:this.budget.latencyFrames});return;}
  if(d?.type==='stats'){this.host.postMessage({type:'stats',request:d.request,stats:this.stats()});return;}throw Error('Invalid Freeze transport host message');
 }catch(error){this.fail(error);}}
 receiveWorker(d){try{if(this.done)return;if(d?.generation!==this.generation)throw Error('Freeze stale transport generation');
  if(d.type==='bank'){if(this.armed||!freezeInteger(d.id,0,this.budget.poolBlocks-1)||this.tokens[d.id]||!(d.buffer instanceof ArrayBuffer)||d.buffer.byteLength!==this.budget.packetBytes)throw Error('Freeze cold credit refused');this.tokens[d.id]={id:d.id,phase:'free',view:new Float32Array(d.buffer),frame:null};this.free.push(d.id);this.installed++;this.port.postMessage({type:'bank-installed',generation:this.generation,id:d.id});if(this.installed===this.budget.poolBlocks)this.host.postMessage({type:'pool-ready',generation:this.generation,poolBlocks:this.installed});return;}
  const token=this.tokens[d.id];if(d.type!=='output'||!token||token.phase!=='worker'||this.returns.length>=2||d.frame!==token.frame||!(d.buffer instanceof ArrayBuffer)||d.buffer.byteLength!==this.budget.packetBytes||!freezeInteger(d.seq,this.appliedSeq,this.receivedSeq))throw Error('Freeze output packet/credit refused');token.phase='returned';this.returns.push(d);
 }catch(error){this.fail(error);}}
 installOne(){if(!this.returns.length)return;const d=this.returns.shift(),token=this.tokens[d.id];if(d.frame!==this.nextReturnFrame)throw Error('Freeze output FIFO differs');this.nextReturnFrame+=FREEZE_PACKET_FRAMES;token.view=new Float32Array(d.buffer);token.phase='output';token.read=0;this.outputPackets.push(token);this.highWater=Math.max(this.highWater,this.outputPackets.length);if(this.outputPackets.length>this.budget.poolBlocks)throw Error('Freeze output queue capacity');this.appliedSeq=d.seq;this.host.postMessage({type:'applied',generation:this.generation,seq:d.seq,sourceFrame:d.frame+FREEZE_PACKET_FRAMES,kernel:d.stats});this.port.postMessage({type:'installed',generation:this.generation,id:d.id});}
 process(inputs,outputs){const out=outputs[0]??[];for(const channel of out)channel.fill(0);if(this.done)return false;if(!this.armed)return true;try{
  if(out.length!==2||out.some(ch=>ch.length!==128))throw Error('Freeze stereo quantum output required');const input=inputs[0]??[];if(input.length>2||input.some(ch=>ch.length!==128))throw Error('Freeze bounded mono/stereo quantum input required');this.callbacks++;this.installOne();
  if(this.current===null){const id=this.free.pop();if(id===undefined)throw Error('Freeze input pool exhausted');this.current=this.tokens[id];this.current.phase='input';this.current.frame=this.frame;this.offset=0;}
  while(this.pending.length){const command=this.pending.shift();this.events.push({...command,offset:this.offset});}
  for(let ch=0;ch<2;ch++){const src=input[ch]??input[0],start=ch*FREEZE_PACKET_FRAMES+this.offset;if(src)this.current.view.set(src,start);else this.current.view.fill(0,start,start+128);}
  if(this.frame>=this.budget.latencyFrames){const expected=this.frame-this.budget.latencyFrames,packet=this.outputPackets[0];if(!packet||packet.frame+packet.read!==expected){this.underrunFrames+=128;throw Error('Freeze declared-latency output underrun');}for(let ch=0;ch<2;ch++)out[ch].set(packet.view.subarray(ch*FREEZE_PACKET_FRAMES+packet.read,ch*FREEZE_PACKET_FRAMES+packet.read+128));packet.read+=128;if(packet.read===FREEZE_PACKET_FRAMES){this.outputPackets.shift();packet.phase='free';packet.frame=null;this.free.push(packet.id);}}
  this.offset+=128;if(this.offset===FREEZE_PACKET_FRAMES){const token=this.current,buffer=token.view.buffer;token.view=null;token.phase='worker';this.current=null;const events=this.events;this.events=[];this.port.postMessage({type:'input',generation:this.generation,id:token.id,frame:token.frame,events,buffer},[buffer]);}
  this.frame+=128;if(!Number.isSafeInteger(this.frame)||this.frame>2**48)throw Error('Freeze source callback horizon exhausted');return true;
 }catch(error){for(const channel of out)channel.fill(0);this.fail(error);return false;}}
 stats(){return{generation:this.generation,frame:this.frame,callbacks:this.callbacks,armed:this.armed,installed:this.installed,free:this.free.length,worker:this.tokens.filter(t=>t?.phase==='worker').length,returned:this.returns.length,outputQueued:this.outputPackets.length,outputHighWater:this.highWater,pendingControls:this.pending.length+this.events.length,receivedSeq:this.receivedSeq,appliedSeq:this.appliedSeq,underrunFrames:this.underrunFrames,latencyFrames:this.budget.latencyFrames,done:this.done,error:this.error??null};}
 dispose(request){if(!this.receipt){this.done=true;this.armed=false;let error=null;try{if(this.port){this.port.onmessage=null;this.port.close();}}catch(e){error=String(e);}this.tokens.length=this.free.length=this.returns.length=this.outputPackets.length=this.pending.length=this.events.length=0;this.current=null;this.receipt={type:'disposed',version:1,released:true,clean:error===null,heapFreed:false,scope:'freeze-stream-transport-quiescence-v1',...(error?{error}:{})};}this.host.postMessage({...this.receipt,request});return this.receipt;}
 fail(error){if(this.failed)return;this.failed=true;this.error=String(error?.message??error);this.host.postMessage({type:'error',generation:this.generation,message:this.error,stats:this.stats()});this.dispose();}
}

class OwnedFreezeStream extends AudioWorkletProcessor {
 constructor({processorOptions:options}){super();if(options.version!=='adebdd9fe675effa')throw Error('Freeze transport version differs');this.core=new FreezeStreamProcessor(options,this.port,sampleRate);}
 process(inputs,outputs){return this.core.process(inputs,outputs);}
}
registerProcessor('owned-freeze-worker-adebdd9fe675effa',OwnedFreezeStream);
