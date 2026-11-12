class StoppedSourceWarmup extends AudioWorkletProcessor {
 constructor(){super();this.disposed=false;this.calls=0;this.frames=0;this.peak=0;this.port.onmessage=({data})=>{if(data?.type==='dispose'){this.disposed=true;this.port.postMessage({type:'disposed',version:1,released:true,clean:true,request:data.request});}else if(data?.type==='stats')this.port.postMessage({type:'stats',request:data.request,calls:this.calls,frames:this.frames,inputPeak:this.peak});};this.port.postMessage({type:'ready',version:1});}
 process(inputs,outputs){if(this.disposed)return false;for(const bus of outputs)for(const channel of bus)channel.fill(0);for(const channel of inputs[0]??[])for(const value of channel){if(!Number.isFinite(value)){this.peak=Infinity;break;}this.peak=Math.max(this.peak,Math.abs(value));}this.calls++;this.frames+=outputs[0]?.[0]?.length??0;return true;}
}
registerProcessor('calmbgm-stopped-source-warmup-v1',StoppedSourceWarmup);
