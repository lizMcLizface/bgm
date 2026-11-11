const integer=(v,min=0,max=0xffffffff)=>Number.isInteger(v)&&v>=min&&v<=max;
export class OwnedAmbienceBank{
 constructor(moduleOrEngine,rate){if(!integer(rate,8000,192000))throw Error('Invalid ambience bank rate');this.e=moduleOrEngine instanceof WebAssembly.Module?new WebAssembly.Instance(moduleOrEngine,{}).exports:moduleOrEngine;if(this.e.ambience_bank_api()!==1)throw Error('Ambience bank ABI mismatch');this.rate=rate;this.handle=this.e.ambience_bank_new(rate);if(!this.handle)throw Error('Cold ambience arena allocation refused');this.refresh();}
 alive(){if(!this.handle)throw Error('Disposed ambience bank pool');}
 accept(ok){if(!ok)throw Error('Ambience bank operation refused');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.scratch=[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_bank_scratch(this.handle,ch),1024));this.output=Array.from({length:16},(_,slot)=>[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_bank_output(this.handle,slot,ch),128)));}
 stable(){this.alive();if(this.memory!==this.e.memory.buffer)throw Error('Ambience bank memory grew after cold allocation');}
 begin(frames){this.alive();if(!integer(frames,1,this.rate*29))throw Error('Invalid bank resource frames');const key=this.e.ambience_bank_begin(this.handle,frames);this.accept(key);return key;}
 canUpload(key,offset,n){this.alive();return integer(key,1)&&integer(offset)&&integer(n,1,1024)&&!!this.e.ambience_bank_can_upload(this.handle,key,offset,n);}
 upload(key,offset,channels,n=channels?.[0]?.length){this.stable();if(!this.canUpload(key,offset,n)||!Array.isArray(channels)||channels.length!==2||channels.some(c=>!(c instanceof Float32Array)||c.length<n||c.length>1024))throw Error('Invalid bank upload chunk');for(let ch=0;ch<2;ch++)this.scratch[ch].set(channels[ch]);this.accept(this.e.ambience_bank_upload(this.handle,key,offset,n));return this.scratch;}
 uploadScratch(key,offset,n){this.stable();if(!this.canUpload(key,offset,n))throw Error('Invalid bank scratch upload');this.accept(this.e.ambience_bank_upload(this.handle,key,offset,n));}
 seal(key){this.alive();this.accept(this.e.ambience_bank_seal(this.handle,key));}
 retain(key){this.alive();this.accept(this.e.ambience_bank_retain(this.handle,key));}
 release(key){this.alive();this.accept(this.e.ambience_bank_release(this.handle,key));}
 cancel(key){this.alive();this.accept(this.e.ambience_bank_cancel(this.handle,key));}
 gc(){this.alive();return this.e.ambience_bank_gc(this.handle);}
 source(slot,token,key){this.alive();if(!integer(slot,0,15)||!integer(token,1)||!integer(key,1))throw Error('Invalid source identity');this.accept(this.e.ambience_bank_source_new(this.handle,slot,token,key));}
 start(slot,token,{onset=0,offset=0,callFrame=0}={}){this.alive();if(![onset,offset].every(v=>Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(callFrame)||callFrame<0||callFrame%128)throw Error('Invalid bank source start clock');this.accept(this.e.ambience_bank_source_start(this.handle,slot,token,onset,offset,callFrame));}
 stop(slot,token,time){this.alive();if(!Number.isFinite(time)||time<0||time>Number.MAX_SAFE_INTEGER)throw Error('Invalid bank source stop clock');this.accept(this.e.ambience_bank_source_stop(this.handle,slot,token,time));}
 freeSource(slot,token){this.alive();this.accept(this.e.ambience_bank_source_free(this.handle,slot,token));}
 render(frame,mask=65535){this.stable();if(!Number.isSafeInteger(frame)||frame<0||frame%128||!integer(mask,0,65535))throw Error('Invalid bank render clock/demand');this.accept(this.e.ambience_bank_render(this.handle,frame,mask));}
 reset(){this.alive();this.e.ambience_bank_reset(this.handle);}
 stats(){this.alive();return Object.fromEntries(['sampleRate','pcmCapacityBytes','availablePages','freePhysicalPages','uploadingResources','readyResources','gcPages','sources','uploadedFrames','reclaimedPages','frame','resetting'].map((key,i)=>[key,this.e.ambience_bank_stat(this.handle,i)]));}
 resourceStats(id){this.alive();return Object.fromEntries(['state','frames','written','references','allocatedPages','reservedPages'].map((key,i)=>[key,this.e.ambience_bank_resource_stat(this.handle,id,i)]));}
 sourceStats(slot,token){this.alive();return Object.fromEntries(['bank','scheduled','started','ended','position','frame','renderedFrames','skippedFrames','onset','offset','stop'].map((key,i)=>[key,this.e.ambience_bank_source_stat(this.handle,slot,token,i)]));}
 ended(slot,token){return this.e.ambience_bank_source_stat(this.handle,slot,token,3)===1;}
 dispose(){if(this.handle){this.e.ambience_bank_free(this.handle);this.handle=0;this.e=this.memory=this.output=this.scratch=null;}}
}
