import {NativeEchoLiveProcessor} from './nativeEchoLiveProcessor.js';
class NativeEchoLive extends AudioWorkletProcessor {
 static get parameterDescriptors(){return [{name:'hostAwake',defaultValue:1,minValue:0,maxValue:1,automationRate:'k-rate'}];}
 constructor({processorOptions}) { super();this.engine=new NativeEchoLiveProcessor(processorOptions,this.port,sampleRate); }
 process(inputs,outputs,parameters) { return this.engine.process(inputs,outputs,currentFrame,parameters.hostAwake[0]===0?false:parameters.hostAwake[0]===1?true:null); }
}
registerProcessor('owned-native-echo-live',NativeEchoLive);
