// Transparent stereo tap after all effects, with the same history contract as
// the classics scope. Never use the mono scope mix as the audible signal.
class OutputScope extends AudioWorkletProcessor {
 constructor(){
  super();this.ring=new Float32Array(65536);this.total=0;this.peak=0;this.report=0;
  this.port.onmessage=({data})=>{if(data.type!=='scope')return;
   const n=Math.max(0,Math.min(65536,Math.floor(data.n)||0,this.total)),samples=new Float32Array(n);
   for(let i=0;i<n;i++)samples[i]=this.ring[(this.total-n+i)&65535];
   this.port.postMessage({type:'scope',end:this.total,rate:sampleRate,samples},[samples.buffer]);
  };
 }
 process(inputs,outputs){
  const input=inputs[0],out=outputs[0];if(!out?.length)return true;
  for(let c=0;c<out.length;c++){const source=input[c]??input[0];if(source)out[c].set(source);else out[c].fill(0);}
  for(let i=0;i<out[0].length;i++){
   const l=out[0][i],r=(out[1]??out[0])[i];this.ring[this.total++&65535]=(l+r)*.5;this.peak=Math.max(this.peak,Math.abs(l),Math.abs(r));
  }
  this.report+=out[0].length;if(this.report>=sampleRate/10){this.report=0;this.port.postMessage({type:'level',peak:this.peak});this.peak=0;}
  return true;
 }
}
registerProcessor('calmbgm-output-scope',OutputScope);
