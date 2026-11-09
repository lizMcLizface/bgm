import {ReferenceGraph} from './runtime.js';
import {workerOptions,graphSnapshot} from './workerProtocol.js';
import {AlignedSourcePool} from './poolProtocol.js';

class PoolOutput extends AudioWorkletProcessor {
  constructor({processorOptions:p}){
    super();this.stopped=false;this.frame=0;this.outputFrame=0;this.primed=false;
    try{
      this.o=workerOptions(p.options);this.end=p.endFrame;this.groups=p.groups;
      if(!Number.isSafeInteger(this.end+this.o.delayFrames)||this.end<1||this.groups.length<2||this.groups.length>6)throw Error('Invalid pool output');
      this.g=new ReferenceGraph(new WebAssembly.Instance(p.module,{}).exports,p.patch,p.contracts,sampleRate);
      this.inputs=Array.from({length:7},(_,i)=>this.g.inputs.get(i+1));
      if(this.inputs.some(x=>!x))throw Error('Missing pool master inputs');
      this.links=Array(this.groups.length).fill(null);
      this.pool=new AlignedSourcePool(this.o,this.end,this.groups,(group,b)=>this.links[group].postMessage({type:'recycle',generation:b.generation,slot:b.slot,buffer:b.buffer},[b.buffer]));
      this.port.onmessage=({data:d})=>{try{
        if(d.type==='connect'){
          if(!Number.isInteger(d.group)||!this.pool.queues[d.group]||this.links[d.group])throw Error('Invalid pool group port');
          this.links[d.group]=d.port;d.port.onmessage=({data:b})=>{try{if(this.stopped)return;this.pool.accept(d.group,b);if(!this.primed&&this.pool.queues.every(q=>q.count>=Math.min(this.o.poolBlocks,Math.ceil(this.end/this.o.blockFrames)))){this.primed=true;this.port.postMessage({type:'primed'});}}catch(e){this.fail(e);}};
        }
        if(d.type==='stats')this.stats();
        if(d.type==='failure'){this.stopped=true;this.pool.dispose();this.stats();this.port.postMessage({type:'finished'});}
        if(d.type==='dispose'){this.stopped=true;this.pool.dispose();this.links.forEach(p=>p?.close());this.g.dispose();this.port.close();}
      }catch(e){this.fail(e);}};
      this.port.postMessage({type:'ready'});
    }catch(e){this.fail(e);}
  }
  fail(e){this.stopped=true;this.port.postMessage({type:'error',message:String(e)});}
  stats(){this.port.postMessage({type:'stats',mode:'pool',generation:this.o.generation,sourceFrame:this.frame,outputFrame:this.outputFrame,delayFrames:this.o.delayFrames,queue:this.pool.stats(),master:graphSnapshot(this.g,[])});}
  process(_inputs,outputs){
    for(const bus of outputs)for(const ch of bus)ch.fill(0);if(this.stopped)return false;
    try{
      const length=outputs[0]?.[0]?.length??0,at=Math.min(length,Math.max(0,this.o.delayFrames-this.outputFrame)),n=Math.min(length-at,this.end-this.frame);
      if(n>0){this.pool.fill(this.inputs,n);
        // Rust clears host-input storage after consuming it. Publish raw taps
        // before render, then publish only the dependent master output after.
        for(let bus=0;bus<7;bus++)for(let ch=0;ch<outputs[bus].length;ch++)for(let i=0;i<n;i++)outputs[bus][ch][at+i]=this.inputs[bus][i*2+Math.min(ch,1)];
        this.g.render(n);
        for(let ch=0;ch<outputs[7].length;ch++)for(let i=0;i<n;i++)outputs[7][ch][at+i]=ch===0?this.g.left[i]:this.g.right[i];
        this.frame+=n;
      }
      this.outputFrame+=length;if(this.frame>=this.end){this.stopped=true;this.stats();this.port.postMessage({type:'finished'});return false;}return true;
    }catch(e){this.fail(e);return false;}
  }
}
registerProcessor('calmbgm-pool-output',PoolOutput);
