// Thin AudioWorklet bridge for the /synths classic-synth kernel. All sound is
// generated in Rust/Wasm; untimed messages apply at the next block; timed events split it at sample boundaries.
const NOTE_ON=0,NOTE_OFF=1,PRESSURE=2,CONTROL=3;
const RING=65536; // the scope's history: the last 1.3 s of output at 48 kHz
const FIRST_SEQUENCED=8; // the drum machines and the bass line report their playhead often
class ClassicsProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:o}){
  super();this.failed=false;this.pending=o.events??[];this.held=new Set();this.polyphony=o.polyphony??Infinity;this.report=0;this.ring=new Float32Array(RING);this.rw=0;this.total=0;this.every=o.model>=FIRST_SEQUENCED?sampleRate/40:sampleRate/4;
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
  else if(data.type==='events'){
   for(const event of data.values){if(Number.isFinite(event[4]))this.pending.push(event);else this.event(event);}
   this.pending.sort((a,b)=>a[4]-b[4]);
  }
  else if(data.type==='seq')for(const [cmd,a,b] of data.values)k.syn_seq(cmd,a,b);
  else if(data.type==='scope')this.sendScope(data.n);
  else if(data.type==='waves')this.loadWaves(data.waves);
  else if(data.type==='panic'){this.pending=[];this.held.clear();k.syn_panic();}
  else if(data.type==='dispose')this.stop();
 }
 event([kind,a,b,c]){
  const k=this.k;
  if(kind===NOTE_ON){if(this.held.size>=this.polyphony){const oldest=this.held.values().next().value;k.syn_note_off(oldest);this.held.delete(oldest);}this.held.add(a);k.syn_note_on(a,b,c);}
  else if(kind===NOTE_OFF){this.held.delete(a);k.syn_note_off(a);}
  else if(kind===PRESSURE)k.syn_pressure(a,b);else if(kind===CONTROL)k.syn_control(a,b);
 }
 // a copy of the newest n output samples (left and right averaged) and the absolute frame count at their end
 sendScope(n){
  n=Math.max(1,Math.min(RING,n|0));const out=new Float32Array(n);
  for(let i=0;i<n;i++)out[i]=this.ring[(this.rw-n+i+RING)&(RING-1)];
  this.port.postMessage({type:'scope',end:this.total,rate:sampleRate,samples:out},[out.buffer]);
 }
 stop(){this.failed=true;this.port.onmessage=null;this.port.close();this.k=null;this.left=this.right=null;}
 fail(error){this.port.postMessage({type:'error',message:String(error?.message??error)});this.stop();}
 process(_inputs,outputs){
  if(this.failed)return false;
  try{
   const out=outputs[0],n=out[0].length;
   for(let at=0;at<n;){
    const frame=currentFrame+at;
    while(this.pending.length&&Math.round(this.pending[0][4]*sampleRate)<=frame)this.event(this.pending.shift());
    const next=this.pending.length?Math.round(this.pending[0][4]*sampleRate)-frame:2048;
    const count=Math.min(2048,n-at,Math.max(1,next));this.k.syn_render(count);
    if(this.k.memory.buffer!==this.buffer)this.bind();
    out[0].set(this.left.subarray(0,count),at);if(out[1])out[1].set(this.right.subarray(0,count),at);
    for(let i=0;i<count;i++){this.ring[this.rw]=(this.left[i]+this.right[i])*.5;this.rw=(this.rw+1)&(RING-1);}
    this.total+=count;
    at+=count;
   }
   this.report+=n;
   if(this.report>=this.every){this.report=0;const k=this.k;this.port.postMessage({type:'stats',active:k.syn_stat(0),steals:k.syn_stat(1),peak:k.syn_stat(2),step:k.syn_stat(4),pattern:k.syn_stat(5),running:k.syn_stat(6)});}
   return true;
  }catch(error){this.fail(error);return false;}
 }
}
registerProcessor('calmbgm-classics',ClassicsProcessor);
