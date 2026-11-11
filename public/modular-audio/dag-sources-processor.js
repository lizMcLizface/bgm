import {ReferenceGraph,assertSerialRealtimeAllowed} from './runtime.js?v=237a38efc4a26ecc';
// One Rust DAG owns all six engines, explicit mixing and actual kick-key compression.
class DagSources extends AudioWorkletProcessor {
 constructor({processorOptions:o}){super();this.stopped=false;this.frame=0;try{
  if(!Number.isSafeInteger(o.endFrame)||o.endFrame<1||o.roles?.length!==6)throw Error('Invalid source DAG');
  this.end=o.endFrame;this.roles=o.roles;this.g=(assertSerialRealtimeAllowed(o.patch,o.contracts),new ReferenceGraph(new WebAssembly.Instance(o.module,{}).exports,o.patch,o.contracts,sampleRate));this.views=this.roles.map((_,i)=>this.g.outputs.get(i+1));this.kick=this.g.kicks.get(6);
  if(this.views.some(x=>!x)||!this.kick)throw Error('Missing DAG source ports');
  this.port.onmessage=({data})=>{try{if(data.type==='stats')this.stats();if(data.type==='dispose'){this.stopped=true;this.g.dispose();this.port.close();}}catch(e){this.port.postMessage({type:'error',message:String(e)});}};this.port.postMessage({type:'ready',memory:this.g.engine.memory.buffer.byteLength});
 }catch(e){this.stopped=true;this.g?.dispose();this.port.postMessage({type:'error',message:String(e)});}}
 stats(){const graph=this.g.stats();this.port.postMessage({type:'stats',roles:{...Object.fromEntries(this.roles.map((role,i)=>[role,{...(i===5?this.g.percussionStats(i+1):this.g.pitchedStats(i+1)),owned:true,dag:true,sharedInstanceMemory:this.g.engine.memory.buffer.byteLength}])),sourceDag:{...graph,meters:this.g.meters(),memory:this.g.engine.memory.buffer.byteLength}}});}
 process(inputs,outputs){if(this.stopped)return false;try{const length=outputs[0]?.[0]?.length??0;
  for(let at=0;at<length;){const n=Math.min(2048,length-at,this.end-this.frame);if(n<=0){for(const bus of outputs)for(const ch of bus)ch.fill(0,at);break;}this.g.render(n);
   for(let i=0;i<n;i++){for(let role=0;role<6;role++)for(let ch=0;ch<outputs[role].length;ch++)outputs[role][ch][at+i]=this.views[role][i*2+Math.min(ch,1)];for(let ch=0;ch<outputs[6].length;ch++)outputs[6][ch][at+i]=this.kick[i*2+Math.min(ch,1)];if(outputs[7])for(let ch=0;ch<outputs[7].length;ch++)outputs[7][ch][at+i]=ch===0?this.g.left[i]:this.g.right[i];}
   this.frame+=n;at+=n;
  }if(this.frame>=this.end){this.stopped=true;this.stats();return false;}return true;
 }catch(e){this.stopped=true;this.port.postMessage({type:'error',message:String(e)});return false;}}
}
registerProcessor('calmbgm-dag-sources',DagSources);
