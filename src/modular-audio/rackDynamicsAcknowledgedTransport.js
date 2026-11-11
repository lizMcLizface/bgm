import{RackTargetWriter,RACK_TARGET_SLOTS}from'./rackDynamicsTargetTransport.js';
/** Never reuse an authored slot until its payload is copied into owned state. */
export class AcknowledgedRackTargetWriter extends RackTargetWriter{
 constructor(...args){super(...args);this.observedSequence=0;}
 post(values,options){if(this.sequence-this.observedSequence>=RACK_TARGET_SLOTS)throw Error('Rack target transport capacity: at most8 total unobserved edits');return super.post(values,options);}
 acknowledge(sequence){if(!Number.isSafeInteger(sequence)||sequence<0||sequence>this.sequence)throw Error('Invalid rack authored observation watermark');if(sequence>this.observedSequence)this.observedSequence=sequence;}
}
