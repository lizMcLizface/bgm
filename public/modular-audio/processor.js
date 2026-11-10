import {ReferenceGraph} from './runtime.js?v=a0232d648355514b';

class ReferenceProcessor extends AudioWorkletProcessor {
  constructor({processorOptions: o}) {
    super();
    this.stopped = false;
    this.origin = null;
    try {
      if(o.stopFrame !== undefined && (!Number.isSafeInteger(o.stopFrame) || o.stopFrame < 1)) throw Error('Invalid stop frame');
      this.graph = new ReferenceGraph(new WebAssembly.Instance(o.module,{}).exports,o.patch,o.contracts,sampleRate,o.maxBlock ?? 2048);
      this.stopFrame = o.stopFrame ?? Infinity;
      this.port.onmessage = ({data}) => {
        try {
          if (data.type === 'event') this.graph.enqueue(data.event);
          else if (data.type === 'stats') this.port.postMessage({type:'stats',contextOrigin:this.origin,...this.graph.stats(),meters:this.graph.meters()});
          else if (data.type === 'pause') this.graph.pause(data.value);
          else if (data.type === 'cancel') this.graph.cancel(data.owner);
          else if (data.type === 'dispose') { this.stopped=true; this.graph.dispose(); this.port.close(); }
        } catch (e) { this.port.postMessage({type:'error',message:String(e)}); }
      };
      this.port.postMessage({type:'ready',contextCreatedFrame:currentFrame,...this.graph.stats()});
    } catch (e) { this.stopped=true; this.port.postMessage({type:'error',message:String(e)}); }
  }
  process(_inputs, outputs) {
    if (this.stopped) return false;
    const out=outputs[0];
    if (!out?.length) return true;
    if (this.origin === null) this.origin=currentFrame;
    try {
      for (let at=0;at<out[0].length;) {
        const count=Math.min(this.graph.maxBlock,out[0].length-at,this.stopFrame-this.graph.engine.graph_stat(this.graph.handle,0));
        if (count<=0) { for(let ch=0;ch<out.length;ch++)out[ch].fill(0,at); break; }
        this.graph.render(count);
        for(let i=0;i<count;i++) { out[0][at+i]=this.graph.left[i]; if(out[1]) out[1][at+i]=this.graph.right[i]; }
        at+=count;
      }
      if (this.graph.engine.graph_stat(this.graph.handle,0)>=this.stopFrame) {
        // Keep allocation/reclamation out of process(); host disposes via port.
        this.stopped=true;
        return false;
      }
      return true;
    } catch (e) { this.stopped=true; this.port.postMessage({type:'error',message:String(e)}); return false; }
  }
}
registerProcessor('calmbgm-reference-graph',ReferenceProcessor);
