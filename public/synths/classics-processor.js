// Thin AudioWorklet bridge for the /synths classic-synth kernel. All sound is
// generated in Rust/Wasm; messages apply at the start of the next 128-frame block.
const NOTE_ON=0,NOTE_OFF=1,PRESSURE=2,CONTROL=3;
class ClassicsProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}){
  super();this.failed=false;this.report=0;
  try{
   this.k=new WebAssembly.Instance(o.module,{}).exports;
   if(this.k.syn_api()!==1)throw Error('Synth kernel API mismatch. Reload the page.');
   if(!this.k.syn_init(sampleRate,o.model))throw Error('Unsupported synth model or sample rate.');
   if(o.waves)this.loadWaves(o.waves);
   for(const [id,value] of o.params??[])this.k.syn_param(id,value);
   this.bind();
   this.port.onmessage=({data})=>{try{this.message(data);}catch(error){this.fail(error);}};
   this.port.postMessage({type:'ready',sampleRate});
  }catch(error){this.fail(error);}
 }
 // the vector synthesizer's waves: written into the kernel's shared buffer, then its tables are built
 loadWaves(waves){new Float32Array(this.k.memory.buffer,this.k.syn_wave_ptr(),waves.length).set(waves);this.k.syn_wave_commit();}
 // Views are re-created only if Wasm memory ever grows.
 bind(){const buffer=this.k.memory.buffer;this.buffer=buffer;this.left=new Float32Array(buffer,this.k.syn_left(),2048);this.right=new Float32Array(buffer,this.k.syn_right(),2048);}
 message(data){
  const k=this.k;
  if(data.type==='params')for(const [id,value] of data.values)k.syn_param(id,value);
  else if(data.type==='events')for(const [kind,a,b,c] of data.values){
   if(kind===NOTE_ON)k.syn_note_on(a,b,c);else if(kind===NOTE_OFF)k.syn_note_off(a);else if(kind===PRESSURE)k.syn_pressure(a,b);else if(kind===CONTROL)k.syn_control(a,b);
  }
  else if(data.type==='waves')this.loadWaves(data.waves);
  else if(data.type==='panic')k.syn_panic();
  else if(data.type==='dispose')this.stop();
 }
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.k=null;this.left=this.right=null;}
 fail(error){this.port.postMessage({type:'error',message:String(error?.message??error)});this.stop();}
 process(_inputs,outputs){
  if(this.failed)return false;
  try{
   const out=outputs[0],n=out[0].length;
   for(let at=0;at<n;at+=2048){
    const count=Math.min(2048,n-at);this.k.syn_render(count);
    if(this.k.memory.buffer!==this.buffer)this.bind();
    out[0].set(this.left.subarray(0,count),at);if(out[1])out[1].set(this.right.subarray(0,count),at);
   }
   this.report+=n;
   if(this.report>=sampleRate/4){this.report=0;this.port.postMessage({type:'stats',active:this.k.syn_stat(0),steals:this.k.syn_stat(1),peak:this.k.syn_stat(2)});}
   return true;
  }catch(error){this.fail(error);return false;}
 }
}
registerProcessor('calmbgm-classics',ClassicsProcessor);
