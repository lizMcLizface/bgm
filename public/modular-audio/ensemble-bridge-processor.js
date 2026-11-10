import {ReferenceGraph} from './runtime.js?v=20a8d8695d994f12';
// Opt-in host I/O only. Existing synth/effects processors remain unchanged.
class EnsembleBridge extends AudioWorkletProcessor{
 constructor({processorOptions:o}){super();this.stopped=false;this.origin=null;try{
  if(!Number.isSafeInteger(o.endFrame)||o.endFrame<1)throw Error('Invalid bridge end frame');
  this.graph=new ReferenceGraph(new WebAssembly.Instance(o.module,{}).exports,o.patch,o.contracts,sampleRate);
  this.mode=o.mode;this.end=o.endFrame;this.processed=0;this.source=o.sourceId;
  this.program=this.mode==='compressor'?this.graph.inputs.get(201):null;this.key=this.mode==='compressor'?this.graph.inputs.get(202):null;
  this.kick=this.mode==='percussion'?this.graph.kicks.get(this.source):null;
  if(!['compressor','percussion'].includes(this.mode)||this.mode==='compressor'&&(!this.program||!this.key)||this.mode==='percussion'&&!this.kick)throw Error('Invalid bridge mode/ports');
  this.port.onmessage=({data})=>{try{if(data.type==='stats')this.port.postMessage({type:'stats',frame:this.processed,origin:this.origin,...this.graph.stats(),meters:this.graph.meters(),memory:this.graph.engine.memory.buffer.byteLength});else if(data.type==='dispose'){this.stopped=true;this.graph.dispose();this.port.close();}}catch(e){this.port.postMessage({type:'error',message:String(e)});}};
  this.port.postMessage({type:'ready',memory:this.graph.engine.memory.buffer.byteLength});
 }catch(e){this.stopped=true;this.graph?.dispose();this.port.postMessage({type:'error',message:String(e)});}}
 process(inputs,outputs){if(this.stopped)return false;if(this.origin===null)this.origin=currentFrame;const out=outputs[0];if(!out?.length)return true;
 try{for(let at=0;at<out[0].length;){const n=Math.min(2048,out[0].length-at,this.end-this.processed);if(n<=0){for(const bus of outputs)for(const ch of bus)ch.fill(0,at);break;}
  if(this.mode==='compressor')for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){this.program[i*2+ch]=(inputs[0]?.[ch]??inputs[0]?.[0])?.[at+i]??0;this.key[i*2+ch]=(inputs[1]?.[ch]??inputs[1]?.[0])?.[at+i]??0;}
  this.graph.render(n);
  for(let i=0;i<n;i++){out[0][at+i]=this.graph.left[i];if(out[1])out[1][at+i]=this.graph.right[i];if(this.kick&&outputs[1])for(let ch=0;ch<outputs[1].length;ch++)outputs[1][ch][at+i]=this.kick[i*2+Math.min(ch,1)];}
  at+=n;this.processed+=n;
 }if(this.processed>=this.end){this.stopped=true;return false;}return true;
 }catch(e){this.stopped=true;this.port.postMessage({type:'error',message:String(e)});return false;}}
}
registerProcessor('calmbgm-ensemble-bridge',EnsembleBridge);
