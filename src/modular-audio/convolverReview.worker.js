import {OwnedConvolver,validateOwnedConvolverSpec,loadOwnedConvolverSpec,saveOwnedConvolverSpec,CONVOLVER_LONG_PROFILE,CONVOLVER_PROFILE} from './ownedConvolver.js';
const ensure=(v,message)=>{if(!v)throw Error(message);};
function render(unit,input,frames,cadence=[128]){const out=unit.output.map(()=>new Float32Array(frames));for(let at=0,k=0;at<frames;k++){const n=Math.min(frames-at,cadence[k%cadence.length]);for(let ch=0;ch<unit.input.length;ch++)for(let i=0;i<n;i++)unit.input[ch][i]=input[ch][at+i]??0;unit.render(n);for(let ch=0;ch<out.length;ch++){for(let i=0;i<n;i++)if(!Number.isFinite(unit.output[ch][i]))throw Error('Nonfinite finite convolution output; stopped before publication');out[ch].set(unit.output[ch].subarray(0,n),at);}at+=n;}return out;}
function exact(a,b){return a.length===b.length&&a.every((ch,c)=>ch.length===b[c].length&&ch.every((v,i)=>v===b[c][i]));}
self.onmessage=({data})=>{
 let unit=null,other=null,fresh=null;
 try{
  ensure(data?.type==='render'&&data.module instanceof WebAssembly.Module&&Number.isSafeInteger(data.request)&&data.request>0&&Number.isInteger(data.frames)&&data.frames>0&&data.frames<=(data.spec?.version===2?4194304:1048576),'Invalid finite convolution worker request');
  validateOwnedConvolverSpec(data.spec);const spec=data.spec,maximum=spec.version===2?4194304:1048576;ensure(data.profile===(spec.version===2?CONVOLVER_LONG_PROFILE:CONVOLVER_PROFILE),'Convolver profile identity mismatch');ensure(Array.isArray(data.input)&&data.input.length===spec.inputChannels&&data.input.every(ch=>ch instanceof Float32Array&&ch.length>0&&ch.length<=maximum&&ch.every(Number.isFinite))&&data.input.every(ch=>ch.length===data.input[0].length),'Invalid finite convolution worker PCM');
  const engine=new WebAssembly.Instance(data.module,{}).exports;unit=new OwnedConvolver(engine,spec);const memory=engine.memory.buffer.byteLength,pcm=render(unit,data.input,data.frames),stats=unit.stats(),lifecycle={tested:false};
  if(data.lifecycle){
   const saved=saveOwnedConvolverSpec(unit.snapshot());unit.reset();ensure(exact(render(unit,data.input,data.frames,[1,37,203,128,11,509]),pcm),'Convolver reset/partition replay differs');
   other=new OwnedConvolver(engine,loadOwnedConvolverSpec(saved));unit.refresh();other.refresh();const before=unit.stats().frame;other.render(137);ensure(other.output.every(ch=>ch.subarray(0,137).every(v=>v===0))&&unit.stats().frame===before,'Convolver handles share active history');other.dispose();other=null;
   fresh=new OwnedConvolver(new WebAssembly.Instance(data.module,{}).exports,loadOwnedConvolverSpec(saved));ensure(exact(render(fresh,data.input,data.frames),pcm),'Convolver saved fresh replay differs');fresh.dispose();fresh=null;Object.assign(lifecycle,{tested:true,resetExact:true,arbitraryPartitionsExact:true,independentState:true,savedColdRestartExact:true});
  }
  const result={type:'rendered',request:data.request,version:data.version,wasm:data.wasm,profile:data.profile,stats,lifecycle,initialMemoryBytes:memory,frames:data.frames,channels:pcm};unit.dispose();unit=null;self.postMessage(result,pcm.map(ch=>ch.buffer));
 }catch(error){self.postMessage({type:'error',request:data?.request,message:String(error)});}finally{unit?.dispose();other?.dispose();fresh?.dispose();}
};
