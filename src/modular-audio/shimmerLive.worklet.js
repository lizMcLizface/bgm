import {ShimmerLiveProcessor} from './shimmerLiveProcessor.js';
class ShimmerLive extends AudioWorkletProcessor{constructor({processorOptions}){super();this.owner=new ShimmerLiveProcessor(processorOptions,this.port,sampleRate);}process(inputs,outputs){return this.owner.process(inputs,outputs,currentFrame);}}
registerProcessor('owned-shimmer-live',ShimmerLive);
