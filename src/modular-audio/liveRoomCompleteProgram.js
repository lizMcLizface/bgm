import {validateRoomConvolutionSpec,saveRoomConvolutionSpec,loadRoomConvolutionSpec} from './ownedRoomConvolver.js';
import {validateRoomCompleteMixSpec,saveRoomCompleteMixSpec,loadRoomCompleteMixSpec,ROOM_COMPLETE_MIX_PROFILE} from './ownedRoomCompleteMix.js';
export const LIVE_ROOM_COMPLETE_PROFILE='live-room-complete-prepared-worker-v1';
export const roomLiveInteger=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const exact=(p,keys)=>p&&typeof p==='object'&&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k));
export function liveRoomCompleteLatency(rate,blockFrames=2048){
 if(!roomLiveInteger(rate,8000,192000)||!roomLiveInteger(blockFrames,128,2048)||blockFrames%128)throw Error('Invalid complete live Room transport geometry');
 return Math.max(2*blockFrames,Math.ceil(rate*.5/128)*128);
}
export function validateLiveRoomCompleteProgram(p){
 if(!exact(p,['version','profile','room','mix','mixIdentity','frames','earliestInputFrame','blockFrames','latencyFrames'])||p.version!==1||p.profile!==LIVE_ROOM_COMPLETE_PROFILE)throw Error('Invalid complete live Room program');
 validateRoomConvolutionSpec(p.room);validateRoomCompleteMixSpec(p.mix);
 const c=p.room.colour,rate=p.room.convolver.sampleRate,wet=Math.max(p.room.convolver.inputChannels,p.room.convolver.ir.length),id=p.mixIdentity;
 if(c?.version!==3||p.mix.sampleRate!==rate||p.mix.sourceChannels!==c.channels||p.mix.wetChannels!==wet||!id||id.api!==1||id.audited!==false||id.profile!==ROOM_COMPLETE_MIX_PROFILE||!/^[a-f0-9]{16}$/.test(id.version)||!/^[a-f0-9]{64}$/.test(id.wasm))throw Error('Complete live Room numerical/layout identity differs');
 if(p.latencyFrames!==liveRoomCompleteLatency(rate,p.blockFrames)||!roomLiveInteger(p.frames,128,Math.floor(rate*3600))||p.frames%128||!roomLiveInteger(p.earliestInputFrame,0,p.frames-128)||p.earliestInputFrame%128)throw Error('Invalid complete live Room finite budget');
 if(c.events.some(e=>e.frame>=p.frames)||c.activity.some(e=>e.frame>=p.frames)||p.mix.events.some(e=>e.wetSeconds*rate>=p.frames))throw Error('Complete live Room control exceeds finite budget');
 // This is source-authored activity, never a numerical-zero detector.
 for(const e of c.activity)if(e.frame>=p.earliestInputFrame&&e.inputChannels!==c.channels)throw Error('Complete live Room v1 requires known full input layout after warmup');
 const before=c.activity.filter(e=>e.frame<p.earliestInputFrame);
 if(before.some(e=>e.inputChannels!==0))throw Error('Complete live Room warmup requires authored zero-channel activity');
 const at=c.activity.filter(e=>e.frame<=p.earliestInputFrame).at(-1);
 if(!at||at.frame!==p.earliestInputFrame||at.inputChannels!==c.channels)throw Error('Complete live Room earliest input activity missing');
 return p;
}
export function liveRoomCompleteProgram(room,mix,mixIdentity,{frames,earliestInputFrame=0,blockFrames=2048}={}){
 return validateLiveRoomCompleteProgram({version:1,profile:LIVE_ROOM_COMPLETE_PROFILE,room:loadRoomConvolutionSpec(saveRoomConvolutionSpec(room)),mix:loadRoomCompleteMixSpec(saveRoomCompleteMixSpec(mix)),mixIdentity:JSON.parse(JSON.stringify(mixIdentity)),frames,earliestInputFrame,blockFrames,latencyFrames:liveRoomCompleteLatency(mix.sampleRate,blockFrames)});
}
export const saveLiveRoomCompleteProgram=p=>JSON.stringify(validateLiveRoomCompleteProgram(p))+'\n';
export const loadLiveRoomCompleteProgram=s=>validateLiveRoomCompleteProgram(JSON.parse(s));
export function liveRoomCompleteGeometry(p){
 validateLiveRoomCompleteProgram(p);const inputChannels=p.mix.sourceChannels,outputChannels=Math.max(inputChannels,p.mix.wetChannels),poolBlocks=Math.ceil(p.latencyFrames/p.blockFrames)+4;
 if(poolBlocks>192)throw Error('Complete live Room pool capacity exceeded');
 return Object.freeze({sampleRate:p.mix.sampleRate,inputChannels,outputChannels,blockFrames:p.blockFrames,latencyFrames:p.latencyFrames,frames:p.frames,earliestInputFrame:p.earliestInputFrame,poolBlocks,poolBytes:poolBlocks*Math.max(inputChannels,outputChannels)*p.blockFrames*4});
}
