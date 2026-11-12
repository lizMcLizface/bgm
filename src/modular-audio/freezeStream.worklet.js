import {FreezeStreamProcessor} from './freezeStreamProcessor.js';
class OwnedFreezeStream extends AudioWorkletProcessor {
 constructor({processorOptions:options}){super();if(options.version!=='__FREEZE_VERSION__')throw Error('Freeze transport version differs');this.core=new FreezeStreamProcessor(options,this.port,sampleRate);}
 process(inputs,outputs){return this.core.process(inputs,outputs);}
}
registerProcessor('__FREEZE_PROCESSOR__',OwnedFreezeStream);
