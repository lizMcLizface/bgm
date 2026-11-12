import {OwnedVoiceFx} from './ownedVoiceFx.js';
import {FREEZE_COMMAND_CAPACITY,FREEZE_PACKET_FRAMES,freezeInteger,freezeStreamBudget,freezeStreamCommand,freezeStreamSpec} from './freezeStreamProtocol.js';
/** Worker-only full original Freeze kernel. No source PCM passes through main. */
export class FreezeStreamWorker {
 constructor(port){this.host=port;this.port=null;this.unit=null;this.done=false;this.failed=false;this.frame=0;this.seq=0;this.maxQueued=0;this.posted=new Set();this.completed=[];this.tokens=[];this.bankPending=new Set();this.nextBank=0;this.bankInstalled=0;this.blocks=0;this.maxRenderMs=0;}
 init(data){
  if(this.unit||this.done||!freezeInteger(data.generation,1,0xffffffff))throw Error('Invalid Freeze worker initialization');
  this.generation=data.generation;this.budget=freezeStreamBudget(data.rate);if(JSON.stringify(this.budget)!==JSON.stringify(data.budget))throw Error('Freeze worker budget identity differs');
  const spec=freezeStreamSpec(data.spec?.seed,Object.fromEntries((data.spec?.parameters??[]).map(([i,v])=>[['mix','hold','length','fade'][i],v])));
  if(JSON.stringify(spec)!==JSON.stringify(data.spec))throw Error('Freeze cold spec differs');
  this.unit=new OwnedVoiceFx(new WebAssembly.Instance(data.module,{}).exports,spec,data.rate);
  this.actualRustBytes=this.unit.e.memory.buffer.byteLength;
  if(this.actualRustBytes>this.budget.plannedRustBytes)throw Error('Freeze actual Rust heap exceeds reserved budget');
  this.port=data.port;if(!this.port||typeof this.port.postMessage!=='function')throw Error('Freeze direct Worker port missing');
  this.port.onmessage=({data:d})=>this.receive(d);this.port.start?.();
  this.tokens=Array.from({length:this.budget.poolBlocks},()=>({phase:'new',buffer:new ArrayBuffer(this.budget.packetBytes)}));this.pumpBank();
 }
 post(data,transfer=[]){this.port.postMessage({generation:this.generation,...data},transfer);}
 pumpBank(){while(this.bankPending.size<2&&this.nextBank<this.tokens.length){const id=this.nextBank++,t=this.tokens[id];t.phase='bank-in-flight';this.bankPending.add(id);this.post({type:'bank',id,buffer:t.buffer},[t.buffer]);t.buffer=null;}}
 receive(d){try{
  if(this.done)return;if(d?.generation!==this.generation)throw Error('Freeze stale Worker generation');
  if(d.type==='bank-installed'){if(!this.bankPending.delete(d.id)||this.tokens[d.id]?.phase!=='bank-in-flight')throw Error('Invalid Freeze bank receipt');this.tokens[d.id].phase='borrowed';this.bankInstalled++;this.pumpBank();if(this.bankInstalled===this.tokens.length)this.host.postMessage({type:'ready',generation:this.generation,actualRustBytes:this.actualRustBytes,budget:this.budget});return;}
  if(d.type==='installed'){if(!this.posted.delete(d.id)||this.tokens[d.id]?.phase!=='output-in-flight')throw Error('Invalid Freeze output receipt');this.tokens[d.id].phase='borrowed';this.pumpOutput();return;}
  if(d.type!=='input')throw Error('Invalid Freeze Worker packet');this.render(d);
 }catch(error){this.fail(error);}}
 render(d){
  const token=this.tokens[d.id];if(!token||token.phase!=='borrowed'||!(d.buffer instanceof ArrayBuffer)||d.buffer.byteLength!==this.budget.packetBytes||d.frame!==this.frame||!Array.isArray(d.events)||d.events.length>FREEZE_COMMAND_CAPACITY)throw Error('Invalid Freeze input frame/credit');
  const samples=new Float32Array(d.buffer);for(const value of samples)if(!Number.isFinite(value))throw Error('Freeze finite source PCM required');const events=d.events.map(e=>{if(!freezeInteger(e.offset,0,FREEZE_PACKET_FRAMES-128)||e.offset%128)throw Error('Invalid Freeze control callback');return{...freezeStreamCommand(e),offset:e.offset};});
  for(let i=0;i<events.length;i++)if(events[i].seq!==this.seq+i+1||i&&events[i].offset<events[i-1].offset)throw Error('Freeze control FIFO differs');
  const began=typeof performance!=='undefined'?performance.now():0;let next=0;
  for(let at=0;at<FREEZE_PACKET_FRAMES;at+=128){while(next<events.length&&events[next].offset===at){const c=events[next++];if(c.kind==='set')this.unit.patch(c.entries);else if(c.kind==='clear')this.unit.clear();this.seq=c.seq;}
   for(let ch=0;ch<2;ch++)this.unit.input[ch].set(samples.subarray(ch*FREEZE_PACKET_FRAMES+at,ch*FREEZE_PACKET_FRAMES+at+128));
   this.unit.render(128);
   for(let ch=0;ch<2;ch++)samples.set(this.unit.output[ch].subarray(0,128),ch*FREEZE_PACKET_FRAMES+at);
  }
  if(next!==events.length)throw Error('Freeze command was not consumed');
  this.maxRenderMs=Math.max(this.maxRenderMs,(typeof performance!=='undefined'?performance.now():0)-began);this.frame+=FREEZE_PACKET_FRAMES;this.blocks++;token.phase='complete';token.buffer=d.buffer;
  this.completed.push({id:d.id,frame:d.frame,seq:this.seq,stats:this.unit.stats(),buffer:d.buffer});this.maxQueued=Math.max(this.maxQueued,this.completed.length);if(this.completed.length>this.tokens.length)throw Error('Freeze output credit capacity');this.pumpOutput();
 }
 pumpOutput(){while(this.posted.size<2&&this.completed.length){const item=this.completed.shift(),token=this.tokens[item.id];if(token.phase!=='complete')throw Error('Freeze output token differs');token.phase='output-in-flight';token.buffer=null;this.posted.add(item.id);this.post({type:'output',...item},[item.buffer]);}}
 stats(){return{generation:this.generation,frame:this.frame,appliedSeq:this.seq,blocks:this.blocks,actualRustBytes:this.actualRustBytes,maxQueued:this.maxQueued,maxRenderMs:this.maxRenderMs,outputInFlight:this.posted.size,bankInFlight:this.bankPending.size,unit:this.unit?.stats()??null,done:this.done,error:this.error??null};}
 dispose(request){if(this.receipt){this.host.postMessage({...this.receipt,request});return this.receipt;}this.done=true;const enginePresentAtDispose=!!this.unit;let error=null;try{this.unit?.dispose();}catch(e){error=String(e);}this.unit=null;try{if(this.port){this.port.onmessage=null;this.port.close();}}catch(e){error??=String(e);}this.completed.length=0;this.tokens.length=0;this.posted.clear();this.bankPending.clear();this.receipt={type:'worker-disposed',version:1,generation:this.generation,released:true,clean:error===null,heapFreed:error===null&&enginePresentAtDispose,enginePresentAtDispose,linearMemoryRetainedUntilTerminate:true,scope:enginePresentAtDispose?'owned-freeze-worker-engine-free-v1':'uninitialized-freeze-worker-quiescence-v1',...(error?{error}:{})};this.host.postMessage({...this.receipt,request});return this.receipt;}
 fail(error){if(this.failed)return;this.failed=true;this.error=String(error?.message??error);this.host.postMessage({type:'error',generation:this.generation,message:this.error,stats:this.stats()});this.dispose();}
}
