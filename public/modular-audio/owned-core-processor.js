import {OwnedCore} from './owned-core.js?v=7ca5dd3705182c2e';
// Three independent logical owners, one Wasm instance; no worker or shared-memory claim.
class OwnedCoreTrio extends AudioWorkletProcessor {
 constructor({processorOptions:o}){super();this.parts=[];this.stopped=false;this.frame=0;try{
  if(!Number.isSafeInteger(o.endFrame)||o.endFrame<1||!Array.isArray(o.parts)||o.parts.length!==3||new Set(o.parts.map(p=>p.role)).size!==3)throw Error('Invalid core trio');
  this.end=o.endFrame;this.e=new WebAssembly.Instance(o.module,{}).exports;
  for(const p of o.parts)this.parts.push({role:p.role,dsp:new OwnedCore(this.e,p.spec,sampleRate)});
  // All owners are prepared before capturing views: preparation may grow memory.
  for(const p of this.parts)p.dsp.refresh();
  this.port.onmessage=({data})=>{try{if(data.type==='stats')this.stats();if(data.type==='dispose'){this.stopped=true;for(const p of this.parts)p.dsp.dispose();this.port.close();}}catch(e){this.port.postMessage({type:'error',message:String(e)});}};
  this.port.postMessage({type:'ready',memory:this.e.memory.buffer.byteLength});
 }catch(e){this.stopped=true;for(const p of this.parts)p.dsp.dispose();this.port.postMessage({type:'error',message:String(e)});}}
 stats(){this.port.postMessage({type:'stats',roles:Object.fromEntries(this.parts.map(p=>[p.role,{...p.dsp.stats(),owned:true,sharedInstanceMemory:this.e.memory.buffer.byteLength}]))});}
 process(inputs,outputs){if(this.stopped)return false;try{
  const length=outputs[0]?.[0]?.length??0;
  for(let at=0;at<length;){const n=Math.min(2048,length-at,this.end-this.frame);if(n<=0){for(const bus of outputs)for(const ch of bus)ch.fill(0,at);break;}
   for(let role=0;role<3;role++){const d=this.parts[role].dsp;d.render(n);for(let ch=0;ch<outputs[role].length;ch++){const source=ch===0?d.left:d.right;for(let i=0;i<n;i++)outputs[role][ch][at+i]=source[i];}}
   at+=n;this.frame+=n;
  }
  if(this.frame>=this.end){this.stopped=true;this.stats();return false;}return true;
 }catch(e){this.stopped=true;this.port.postMessage({type:'error',message:String(e)});return false;}}
}
registerProcessor('calmbgm-owned-core-trio',OwnedCoreTrio);
