export const PORTABLE_TAPE_WITNESS_BASE_SHA='f9ec297610cc3ecbd33c046b65d6c797ece6d45b3c008d03ce33e3d128576ba4';
export const PORTABLE_TAPE_WITNESS_SUCCESSOR=Object.freeze({version:'d0e8f7c36f127ed9',sha256:'d40016f02b7b35a54d323c4bc03cdf7dacecb2b0184cb7c89cc00a5ab41f55f6',kernelVersion:'e68ef063400479f0',originalVersion:'3b17c3eb4ede0c9d',hostVersionLiterals:3});
export const PORTABLE_TAPE_WITNESS_FRAMES=Object.freeze([0,896,1024,1152,1280,1408,1536,1664,3968,4096,8064,8192,8320]);
export const PORTABLE_TAPE_WITNESS_INSERT=`
// REVIEW-ONLY bounded bit witness; the original process method/DSP is unchanged.
const tapeWitnessFrames=[0,896,1024,1152,1280,1408,1536,1664,3968,4096,8064,8192,8320];
const tapeWitnessProcess=PortableTapeAudioProcessor.prototype.process;
PortableTapeAudioProcessor.prototype.process=function(inputs,outputs,parameters){
 const result=tapeWitnessProcess.call(this,inputs,outputs,parameters),frame=this.lastEffectiveFrame;
 if(this.owner&&tapeWitnessFrames.includes(frame)){
  const bits=planes=>planes.map(p=>new Uint32Array(p.buffer,p.byteOffset,128).slice());
  this.port.postMessage({kind:'review-output-bits',frame,actualMask:this.actualMask,inputChannels:inputs[0]?.length??0,input:bits(inputs[0]??[]),shaper:bits(this.owner.stages[0]),tone:bits(this.owner.stages[1]),raw:bits(this.owner.output),emitted:bits(outputs[0]),kernel:this.owner.stats()});
 }
 return result;
};
`;
export function instrumentPortableTapeWitness(source,version='3b17c3eb4ede0c9d'){if(!['3b17c3eb4ede0c9d',PORTABLE_TAPE_WITNESS_SUCCESSOR.version].includes(version))throw Error('Unknown explicit Tape witness source receipt');const marker="registerProcessor('portable-tape-audio-"+version+"',PortableTapeAudioProcessor);";if(typeof source!=='string'||source.split(marker).length!==2)throw Error('Pinned Tape witness registration differs');return source.replace(marker,PORTABLE_TAPE_WITNESS_INSERT+marker);}

/** Review-only explicit Native speaker mapping; never silently repair other layouts. */
export function tapeWitnessSpeakerPlanes(planes,count){if(planes.length===count)return planes;if(planes.length===1&&count===2)return[planes[0],planes[0]];throw Error('Unsupported Tape witness speaker layout');}
