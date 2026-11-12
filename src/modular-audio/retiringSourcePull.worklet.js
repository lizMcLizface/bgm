class RetiringSourcePull extends AudioWorkletProcessor {
 constructor(){super();this.calls=0;this.inputQuanta=0;this.peak=0;this.closed=false;this.port.onmessage=({data})=>{if(data.type==='stats')this.port.postMessage({type:'stats',request:data.request,calls:this.calls,inputQuanta:this.inputQuanta,inputPeak:this.peak});else if(data.type==='dispose'){this.closed=true;this.port.postMessage({type:'disposed',version:1,released:true,clean:true});}};this.port.postMessage({type:'ready',version:1});}
 process(inputs,outputs){for(const bus of outputs)for(const channel of bus)channel.fill(0);if(this.closed)return false;this.calls++;if(inputs[0]?.length)this.inputQuanta++;for(const channel of inputs[0]??[])for(const value of channel){if(!Number.isFinite(value))throw Error('Nonfinite retiring source PCM');this.peak=Math.max(this.peak,Math.abs(value));}return true;}
}
registerProcessor('calmbgm-retiring-source-pull-v1',RetiringSourcePull);
