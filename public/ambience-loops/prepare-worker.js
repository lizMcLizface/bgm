// Heavy whole-loop preparation stays in this worker, never an audio callback.
// The caller passes a compiled, SHA-verified immutable module. No imports.
const kinds=['wind','fire','vinyl'],keys=[['speed','gusts'],['crackle','roar'],['crackle','hiss']],seconds=[29,23,18],MAX_PCM_BYTES=44544000;
let module=null,identity=null,generation=0;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validate(spec){
 const kind=kinds.indexOf(spec?.kind);if(spec?.version!==1||Object.keys(spec).length!==4||kind<0||!integer(spec.sampleRate,8000,192000)||!spec.parameters||Object.keys(spec.parameters).length!==2||!keys[kind].every(k=>typeof spec.parameters[k]==='number'&&Number.isFinite(spec.parameters[k])&&spec.parameters[k]>=0&&spec.parameters[k]<=1&&spec.parameters[k]===Math.round(spec.parameters[k]*10)/10))throw Error('Invalid ambience loop worker specification');
 const frames=Math.round(seconds[kind]*spec.sampleRate);if(frames*8>MAX_PCM_BYTES)throw Error('Ambience loop PCM bound exceeded');return {kind,frames};
}
self.onmessage=({data})=>{
 const request=data?.request;
 try{
  if(data?.type==='init'){
   if(module||!integer(data.generation,1,Number.MAX_SAFE_INTEGER)||!(data.module instanceof WebAssembly.Module)||typeof data.identity?.version!=='string'||!data.identity.version||typeof data.identity?.wasm!=='string'||!/^[a-f0-9]{64}$/.test(data.identity.wasm))throw Error('Invalid ambience loop worker initialization');
   module=data.module;identity={version:data.identity.version,wasm:data.identity.wasm};generation=data.generation;const e=new WebAssembly.Instance(module,{}).exports;if(e.ambience_loop_api()!==1)throw Error('Ambience loop worker ABI mismatch');self.postMessage({type:'ready',generation,identity});return;
  }
  if(!module||data?.generation!==generation||!integer(request,1,Number.MAX_SAFE_INTEGER)||data.type!=='prepare')throw Error('Invalid ambience loop worker request/generation');
  const spec=data.spec,{kind,frames}=validate(spec),started=performance.now();self.postMessage({type:'preparing',generation,request});const e=new WebAssembly.Instance(module,{}).exports;let handle=0;
  try{
   handle=e.ambience_loop_new(kind,spec.sampleRate,...keys[kind].map(k=>spec.parameters[k]));if(!handle)throw Error('Ambience loop resource preparation rejected');if(e.ambience_loop_len(handle)!==frames)throw Error('Ambience loop frame count differs');
   const channels=[0,1].map(ch=>new Float32Array(new Float32Array(e.memory.buffer,e.ambience_loop_pcm(handle,ch),frames)));let peak=0;
   for(const channel of channels)for(let i=0;i<channel.length;i++){if(!Number.isFinite(channel[i]))throw Error('Non-finite ambience loop PCM');peak=Math.max(peak,Math.abs(channel[i]));}
   e.ambience_loop_free(handle);handle=0;
   self.postMessage({type:'prepared',generation,request,channels,rate:spec.sampleRate,kind:spec.kind,spec,version:identity.version,wasm:identity.wasm,frames,pcmBytes:frames*8,nonFinite:0,peak,preparationMs:performance.now()-started},channels.map(ch=>ch.buffer));
   self.postMessage({type:'transferred',generation,request,detached:channels.every(ch=>ch.byteLength===0)});
  }finally{if(handle)e.ambience_loop_free(handle);}
 }catch(error){self.postMessage({type:'error',generation:data?.generation??generation,request,message:String(error)});}
};
