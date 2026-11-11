// Actual portable weather kernel. Three stereo outputs retain the native host seams.
// No imports: the verified WebAssembly.Module is passed through processorOptions.
class OwnedWeatherBedProcessor extends AudioWorkletProcessor {
 constructor(options){
  super();this.handle=0;this.alive=false;this.disposed=false;this.e=null;this.calls=0;this.preStartFrames=0;this.startupLateFrames=0;this.started=false;
  this.port.onmessage=({data})=>this.message(data);
  try{
   const {module,spec,startFrame=0,stopFrame}=options.processorOptions??{};
   if(spec?.version!==1||spec.sampleRate!==sampleRate||!Number.isInteger(spec.seed)||spec.seed<0||spec.seed>0xffffffff||!Number.isSafeInteger(startFrame)||startFrame<0||!Number.isSafeInteger(stopFrame)||stopFrame<1||!Array.isArray(spec.events)||spec.events.length>4000)throw Error('Invalid weather worklet configuration');
   this.spec=spec;this.startFrame=startFrame;this.stopFrame=stopFrame;this.e=new WebAssembly.Instance(module,{}).exports;
   if(this.e.weather_owned_api()!==1)throw Error('Weather worklet ABI mismatch');
   this.handle=this.e.weather_owned_new(sampleRate,spec.seed);if(!this.handle)throw Error('Weather source allocation failed');
   const keys=['rainIntensity','windChaos','indoorFilter','correlation','impactTexture','thunderActivity','thunderDistance','thunderPower','thunderDecay','surfLevel','waveSize','wavePace','waveFoam'],surfaces=['mixed','leaves','concrete','glass','tin','puddle'],values=keys.map(k=>spec.environment[k]).concat(surfaces.indexOf(spec.environment.surfaceType),spec.targets);
   if(values.length!==26)throw Error('Incomplete weather initial state');
   for(let i=0;i<values.length;i++)if(typeof values[i]!=='number'||!Number.isFinite(values[i])||!this.e.weather_owned_initial(this.handle,i,values[i]))throw Error('Invalid weather initial state');
   if(!this.e.weather_owned_prepare(this.handle))throw Error('Weather source preparation failed');
   this.bookInitial();this.memory=this.e.memory.buffer;this.outputs=Array.from({length:6},(_,ch)=>new Float32Array(this.memory,this.e.weather_owned_output(this.handle,24+ch),2048));this.alive=true;
   this.port.postMessage({type:'ready',startFrame,stopFrame,latencyFrames:0,stems:['rain','thunder','waves'],memoryBytes:this.memory.byteLength});
  }catch(error){this.fail(error);}
 }
 bookInitial(){for(const event of this.spec.events)this.book(event,event.frame);}
 book(event,frame){
  if(!event||typeof event!=='object'||!Number.isSafeInteger(frame)||frame<0||!Number.isInteger(event.owner)||event.owner<1||event.owner>0xffffffff)throw Error('Invalid weather event clock/owner');
  const kind=event.kind==='parameter'?0:event.kind==='thunder'?1:event.kind==='surf'?2:-1,id=event.id??0,value=event.value??0;
  if(kind<0||!Number.isInteger(id)||id<0||id>25||typeof value!=='number'||!Number.isFinite(value)||kind===0&&(!Number.isInteger(event.id)||typeof event.value!=='number'||value<0||value>(id<=12?1:id===13?5:2.5)||id===13&&!Number.isInteger(value))||kind!==0&&(id!==0||value!==0))throw Error('Invalid weather event payload');
  if(!this.e.weather_owned_enqueue(this.handle,frame,event.owner,kind,id,value))throw Error('Weather event rejected');
 }
 fail(error,request){this.alive=false;if(this.handle){this.e.weather_owned_free(this.handle);this.handle=0;}this.port.postMessage({type:'error',request,message:String(error)});}
 message(data){
  const request=data?.request;
  if(data?.type==='dispose'){if(this.handle){this.e.weather_owned_free(this.handle);this.handle=0;}this.alive=false;this.disposed=true;this.port.postMessage({type:'disposed',request});return;}
  if(!this.alive){this.port.postMessage({type:'error',request,message:'Weather source is unavailable'});return;}
  try{
   if(data.type==='stats'){this.port.postMessage({type:'stats',request,...this.stats()});return;}
   if(data.type==='event'){if(!Number.isSafeInteger(data.contextFrame)||data.contextFrame<0)throw Error('Invalid weather absolute context frame');this.book(data.event,data.contextFrame-this.startFrame);}
   else if(data.type==='cancel'){if(!Number.isInteger(data.owner)||data.owner<1||data.owner>0xffffffff)throw Error('Invalid weather owner');this.e.weather_owned_cancel(this.handle,data.owner);}
   else if(data.type==='reset'){if(!Number.isSafeInteger(data.startFrame)||data.startFrame<currentFrame)throw Error('Reset requires a future integer context origin');if(!this.e.weather_owned_reset(this.handle))throw Error('Weather reset failed');this.startFrame=data.startFrame;this.bookInitial();this.started=false;this.calls=this.preStartFrames=this.startupLateFrames=0;}
   else throw Error('Unknown weather control');
   this.port.postMessage({type:'ack',request});
  }catch(error){this.port.postMessage({type:'error',request,message:String(error)});}
 }
 stats(){const s=i=>this.e.weather_owned_stat(this.handle,i);return {frame:s(0),applied:s(10),late:s(11),overflow:s(12),queued:s(13),rain:{events:s(1),active:s(2),dropped:s(3)},thunder:{events:s(4),active:s(5),skipped:s(6)},surf:{events:s(7),active:s(8),skipped:s(9)},clock:'spec events: source-local frames; control contextFrame: absolute AudioContext frame',startFrame:this.startFrame,stopFrame:this.stopFrame,processCalls:this.calls,preStartFrames:this.preStartFrames,startupLateFrames:this.startupLateFrames,latencyFrames:0,finished:s(0)===this.stopFrame,memoryBytes:this.memory.byteLength};}
 process(_inputs,outputs){
  for(let stem=0;stem<outputs.length;stem++)for(let ch=0;ch<outputs[stem].length;ch++)outputs[stem][ch].fill(0);
  if(this.disposed)return false;if(!this.alive)return true;
  try{
   this.calls++;const length=outputs[0]?.[0]?.length??128,offset=Math.min(length,Math.max(0,this.startFrame-currentFrame));this.preStartFrames+=offset;
   if(offset===length)return true;
   if(!this.started){this.started=true;this.startupLateFrames=Math.max(0,currentFrame-this.startFrame);}
   const frame=this.e.weather_owned_stat(this.handle,0),count=Math.min(length-offset,this.stopFrame-frame);if(count<=0)return true;
   if(this.memory!==this.e.memory.buffer||!this.e.weather_owned_render(this.handle,count))throw Error('Weather render/memory invariant failed');
   for(let stem=0;stem<3;stem++)for(let ch=0;ch<2;ch++){const dest=outputs[stem]?.[ch];if(dest)for(let i=0;i<count;i++)dest[offset+i]=this.outputs[stem*2+ch][i];}
  }catch(error){this.fail(error);}return true;
 }
}
registerProcessor('calmbgm-owned-weather-bed',OwnedWeatherBedProcessor);
