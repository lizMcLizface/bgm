import{RackTargetWriter,RACK_TARGET_SEQUENCE_MAX,authoredRackFrame}from'./rackDynamicsTargetTransport.js';
/** Never reuse an authored slot until its payload is copied into owned state. */
export class AcknowledgedRackTargetWriter extends RackTargetWriter{
 constructor(...args){super(...args);this.observedSequence=0;}
 post(values,options){if(this.sequence-this.observedSequence>=this.slots)throw Error(`Rack target transport capacity: at most${this.slots} total unobserved edits`);return super.post(values,options);}
 preflight(count,seconds){if(!Number.isInteger(count)||count<1||count>this.slots)throw Error('Invalid whole-patch target reservation');if(this.sequence-this.observedSequence+count>this.slots)throw Error('Whole rack patch exceeds unobserved control capacity');if(this.sequence+count>RACK_TARGET_SEQUENCE_MAX)throw Error('Rack target sequence exhausted');const frame=authoredRackFrame(this.context,seconds);if(this.lastFrame!==null&&frame<this.lastFrame)throw Error('Rack authored context moved backwards');if(this.lastFrame===frame&&this.frameEdits+count>this.slots)throw Error('Whole rack patch exceeds same-quantum capacity');}
 acknowledge(sequence){if(!Number.isSafeInteger(sequence)||sequence<0||sequence>this.sequence)throw Error('Invalid rack authored observation watermark');if(sequence>this.observedSequence)this.observedSequence=sequence;}
}
