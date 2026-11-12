import{loadRoomConvolutionSpec,saveRoomConvolutionSpec,validateRoomConvolutionSpec}from'./ownedRoomConvolver.js';
export const ROOM_CONTINUOUS_PROFILE='owned-private-room-continuous-immutable-ir-v1';
export const ROOM_CONTINUOUS_HOST_PROFILE='room-continuous-worker-prepared-output-controller-v1';
export const roomContinuousCap=rate=>Math.floor(rate*3600/128)*128;
const keys=['version','profile','room','blockFrames','latencyFrames','maxSessionFrames'];
export function validateRoomContinuousSpec(p){
 if(!p||Object.keys(p).length!==keys.length||!keys.every(k=>Object.hasOwn(p,k))||p.version!==1||p.profile!==ROOM_CONTINUOUS_PROFILE)throw Error('Invalid continuous Room contract');
 validateRoomConvolutionSpec(p.room);const rate=p.room.convolver.sampleRate,c=p.room.colour;
 if(c?.version!==3||c.events.length||c.activity.length!==1||c.activity[0].frame!==0||c.activity[0].inputChannels!==c.channels||c.activity[0].delayProcessing!=='audio'||c.activity[0].filterProcessing!=='audio')throw Error('Continuous Room requires immutable fully-processing framed colour');
 if(!Number.isInteger(p.blockFrames)||p.blockFrames<128||p.blockFrames>2048||p.blockFrames%128||!Number.isSafeInteger(p.maxSessionFrames)||p.maxSessionFrames<128||p.maxSessionFrames%128||p.maxSessionFrames>roomContinuousCap(rate))throw Error('Continuous Room canonical session bound differs');
 if(p.latencyFrames!==Math.max(2*p.blockFrames,Math.ceil(rate*.5/128)*128))throw Error('Continuous Room exact single latency differs');
 if(Math.ceil(p.latencyFrames/p.blockFrames)+4>192)throw Error('Continuous Room PCM credit bound exceeds192');
 return p;
}
export function roomContinuousSpec(room,{blockFrames=2048,maxSessionFrames}={}){
 const rate=room?.convolver?.sampleRate;if(!Number.isInteger(rate)||rate<8000||rate>192000||!Number.isInteger(blockFrames)||blockFrames<128||blockFrames>2048||blockFrames%128)throw Error('Continuous Room canonical geometry differs');
 const latencyFrames=Math.max(2*blockFrames,Math.ceil(rate*.5/128)*128);if(Math.ceil(latencyFrames/blockFrames)+4>192)throw Error('Continuous Room PCM credit bound exceeds192');
 const cap=maxSessionFrames===undefined?roomContinuousCap(rate):maxSessionFrames;if(!Number.isSafeInteger(cap)||cap<128||cap%128||cap>roomContinuousCap(rate))throw Error('Continuous Room canonical session bound differs');
 return validateRoomContinuousSpec({version:1,profile:ROOM_CONTINUOUS_PROFILE,room:loadRoomConvolutionSpec(saveRoomConvolutionSpec(room)),blockFrames,latencyFrames,maxSessionFrames:cap});
}
export function saveRoomContinuousSpec(p){validateRoomContinuousSpec(p);return JSON.stringify(p);}
export function loadRoomContinuousSpec(text){return validateRoomContinuousSpec(JSON.parse(text));}
export function roomContinuousGeometry(p){
 validateRoomContinuousSpec(p);const inputChannels=p.room.colour.channels,wetChannels=Math.max(p.room.convolver.inputChannels,p.room.convolver.ir.length),packetPlanes=inputChannels+wetChannels,poolBlocks=Math.ceil(p.latencyFrames/p.blockFrames)+4,inputPcmBytes=poolBlocks*inputChannels*p.blockFrames*4,wetPcmBytes=poolBlocks*wetChannels*p.blockFrames*4;
 return Object.freeze({sampleRate:p.room.convolver.sampleRate,inputChannels,wetChannels,outputChannels:Math.max(inputChannels,wetChannels),packetPlanes,poolBlocks,blockFrames:p.blockFrames,maxSessionFrames:p.maxSessionFrames,latencyFrames:p.latencyFrames,inputPcmBytes,wetPcmBytes,poolBytes:inputPcmBytes+wetPcmBytes});
}
