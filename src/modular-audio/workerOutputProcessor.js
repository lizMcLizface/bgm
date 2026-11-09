import {ReferenceGraph} from './runtime.js';
import {workerOptions,WorkerPcmQueue,sourceViews,graphSnapshot,sourceSelection} from './workerProtocol.js';
import {ProcessTiming} from './processTiming.js';

class WorkerOutput extends AudioWorkletProcessor {
  constructor({processorOptions:p}) {
    super();this.stopped=false;this.outputFrame=0;this.sourceFrame=0;this.primed=false;this.timing=new ProcessTiming();
    try{
      this.o=workerOptions(p.options);this.end=p.endFrame;this.mode=p.mode;this.sourceIds=sourceSelection(p.sourceIds??null);this.armed=!p.startPaused;
      if(p.startPaused!==undefined&&typeof p.startPaused!=='boolean')throw Error('Invalid manual start');
      if(!Number.isSafeInteger(this.end+this.o.delayFrames)||this.end<1||!['worker','serial'].includes(this.mode))throw Error('Invalid worker output');
      if(this.mode==='serial'){this.g=new ReferenceGraph(new WebAssembly.Instance(p.module,{}).exports,p.patch,p.contracts,sampleRate);this.views=sourceViews(this.g,this.sourceIds);}
      else this.queue=new WorkerPcmQueue(this.o,this.end,b=>this.link.postMessage({type:'recycle',generation:b.generation,slot:b.slot,buffer:b.buffer},[b.buffer]));
      this.port.onmessage=({data:d})=>{try{
        if(d.type==='connect'&&this.mode==='worker'&&!this.link){this.link=d.port;this.link.onmessage=({data:b})=>{if(this.stopped)return;if(b.type==='block'){this.queue.accept(b);if(!this.primed&&this.queue.count>=Math.min(this.o.poolBlocks,Math.ceil(this.end/this.o.blockFrames))){this.primed=true;this.port.postMessage({type:'primed'});}}};}
        if(d.type==='stats')this.stats();
        if(d.type==='start')this.armed=true;
        if(d.type==='failure'){this.stopped=true;this.queue?.dispose();this.stats();this.port.postMessage({type:'finished'});}
        if(d.type==='dispose'){this.stopped=true;this.queue?.dispose();this.link?.close();this.g?.dispose();this.port.postMessage({type:'disposed'});this.port.close();}
      }catch(e){this.fail(e);}};
      this.port.postMessage({type:'ready',mode:this.mode,options:this.o});
    }catch(e){this.fail(e);}
  }
  fail(e){this.stopped=true;this.port.postMessage({type:'error',message:String(e)});}
  stats(){this.port.postMessage({type:'stats',mode:this.mode,generation:this.o.generation,armed:this.armed,sourceIds:this.sourceIds,outputFrame:this.outputFrame,sourceFrame:this.sourceFrame,delayFrames:this.o.delayFrames,processTiming:this.timing.snapshot(),queue:this.queue?this.queue.stats():null,serial:this.g?graphSnapshot(this.g,this.sourceIds):null});}
  process(_inputs,outputs){
    // The worklet never waits for the worker, executes a catch-up render, or
    // replays an old block. A missing span is silent and advances source time.
    const started=this.timing.start(),quantum=outputs[0]?.[0]?.length??0;
    for(const bus of outputs)for(const ch of bus)ch.fill(0);
    if(this.stopped)return false;
    if(!this.armed)return true;
    try{
      const length=outputs[0]?.[0]?.length??0;
      let at=Math.min(length,Math.max(0,this.o.delayFrames-this.outputFrame));
      const n=Math.min(length-at,this.end-this.sourceFrame);
      if(n>0){
        if(this.queue){this.queue.observeLead(n);this.queue.consume(outputs,at,n);}
        else{
          this.g.render(n);
          for(let bus=0;bus<outputs.length;bus++)for(let ch=0;ch<outputs[bus].length;ch++)for(let i=0;i<n;i++)outputs[bus][ch][at+i]=bus===7?(this.sourceIds?0:ch===0?this.g.left[i]:this.g.right[i]):this.views[bus]?.[i*2+Math.min(ch,1)]??0;
        }
        this.sourceFrame+=n;
      }
      this.outputFrame+=length;
      if(this.sourceFrame>=this.end){this.stopped=true;this.stats();this.port.postMessage({type:'finished'});return false;}
      return true;
    }catch(e){this.fail(e);return false;}finally{this.timing.stop(started,quantum,sampleRate);}
  }
}
registerProcessor('calmbgm-worker-output',WorkerOutput);
