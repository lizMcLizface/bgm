// Stereo linked sample-peak ceiling limiter, 3 ms lookahead, 80 ms release.
// Fixed storage; no allocation in process(). Not a true-peak oversampling meter.
class DeskLimiter extends AudioWorkletProcessor {
 constructor(){
  super();this.length=Math.ceil(sampleRate*.003);this.left=new Float32Array(this.length);this.right=new Float32Array(this.length);
  this.at=0;this.gain=1;this.ceiling=10**(-1.8/20);this.enabled=true;this.alive=true;this.release=1-Math.exp(-1/(sampleRate*.08));
  this.port.onmessage=({data})=>{if(data.dispose)this.alive=false;if(typeof data.enabled==='boolean')this.enabled=data.enabled;if(Number.isFinite(data.ceiling))this.ceiling=Math.max(.05,Math.min(1,data.ceiling));};
 }
 process(inputs,outputs){
  const source=inputs[0],out=outputs[0];if(!out?.length)return this.alive;
  for(let i=0;i<out[0].length;i++){
   const rawL=source?.[0]?.[i]??0,rawR=source?.[1]?.[i]??rawL,l=Number.isFinite(rawL)?rawL:0,r=Number.isFinite(rawR)?rawR:0;
   const oldL=this.left[this.at],oldR=this.right[this.at];this.left[this.at]=l;this.right[this.at]=r;
   // Include the delayed sample too, preserving the ceiling during release.
   const peak=Math.max(Math.abs(l),Math.abs(r),Math.abs(oldL),Math.abs(oldR));
   const target=this.enabled?Math.min(1,this.ceiling/Math.max(1e-12,peak)):1;
   this.gain=target<this.gain?target:Math.min(target,this.gain+(1-this.gain)*this.release);
   out[0][i]=oldL*this.gain;if(out[1])out[1][i]=oldR*this.gain;
   if(++this.at===this.length)this.at=0;
  }
  return this.alive;
 }
}
registerProcessor('desk-limiter',DeskLimiter);
