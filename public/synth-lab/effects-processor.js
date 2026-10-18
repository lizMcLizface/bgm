// Separate, reusable stereo effects bus. Three inputs: dry, reverb send, delay send.
class EffectsProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}) {
  super();this.failed=false;
  try{this.fx=new WebAssembly.Instance(o.module,{}).exports;
  if(this.fx.fx_api?.()!==1)throw Error('Effects kernel API mismatch. Rebuild and reload.');
  this.fx.fx_init(sampleRate);for(const pair of o.parameters)this.fx.fx_param(...pair);
  const mem=this.fx.memory.buffer;
  this.inputs=Array.from({length:6},(_,i)=>new Float32Array(mem,this.fx.fx_input(i),2048));
  this.outputs=Array.from({length:2},(_,i)=>new Float32Array(mem,this.fx.fx_output(i),2048));
  this.views=this.outputs.map(x=>x.subarray(0,128));this.frames=0;this.endFrame=Number.isFinite(o.endFrame)?o.endFrame:null;
  this.port.onmessage=({data})=>{try{
   if(data.type==='parameters')for(const pair of data.values)this.fx.fx_param(...pair);
   if(data.type==='clear')this.fx.fx_clear();
   if(data.type==='dispose')this.stop();
  }catch(e){this.fail(e);}};
  }catch(e){this.fail(e);}
 }
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.fx=null;this.inputs=this.outputs=this.views=null;}
 fail(error){this.port.postMessage({type:'error',message:String(error)});this.stop();}
 process(inputs,outputs){
  if(this.failed)return false;
  try{
   const out=outputs[0];if(!out?.length)return true;const n=out[0].length;
   for(let offset=0;offset<n;offset+=2048){const count=Math.min(2048,n-offset);
    for(let bus=0;bus<3;bus++)for(let ch=0;ch<2;ch++){
     const source=inputs[bus]?.[ch]??inputs[bus]?.[0],dest=this.inputs[bus*2+ch];
     if(source)dest.set(offset===0&&source.length===count?source:source.subarray(offset,offset+count));else dest.fill(0,0,count);
    }
    this.fx.fx_render(count);for(let ch=0;ch<out.length;ch++)out[ch].set(count===128?this.views[ch]:this.outputs[ch].subarray(0,count),offset);
   }
   this.frames+=n;if(this.endFrame===null&&this.frames>=sampleRate){this.frames=0;this.port.postMessage({type:'stats',peak:this.fx.fx_stat(0),sleeping:!!this.fx.fx_stat(1),reverbActive:!!this.fx.fx_stat(4),reverbFrames:this.fx.fx_stat(5),memory:this.fx.memory.buffer.byteLength});}
   if(this.endFrame!==null&&this.fx.fx_stat(2)>=this.endFrame){this.stop();return false;}
   return true;
  }catch(e){this.fail(e);return false;}
 }
}
registerProcessor('calmbgm-effects',EffectsProcessor);
