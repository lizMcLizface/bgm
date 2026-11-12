import {LIVE_ROOM_COMPLETE_PROFILE,roomLiveInteger} from './liveRoomCompleteProgram.js';
export const ROOM_LIVE_PROTOCOL=1;
const hash=/^[a-f0-9]{16}$/;
export function validateLiveRoomIdentity(p){
 if(!p||p.protocol!==ROOM_LIVE_PROTOCOL||p.profile!==LIVE_ROOM_COMPLETE_PROFILE||!hash.test(p.hostVersion)||!hash.test(p.clockVersion)||!roomLiveInteger(p.generation,1,4294967295)||Object.keys(p.components??{}).length!==3||['colour','convolver','mix'].some(k=>!hash.test(p.components[k])))throw Error('Complete live Room receipt identity differs');
 return p;
}
export function sameLiveRoomIdentity(a,b){
 try{validateLiveRoomIdentity(a);validateLiveRoomIdentity(b);}catch{return false;}
 return ['protocol','profile','hostVersion','clockVersion','generation'].every(k=>a[k]===b[k])&&['colour','convolver','mix'].every(k=>a.components[k]===b.components[k]);
}
export const liveRoomReceipt=(identity,kind,request=0,extra={})=>({...identity,kind,request,...extra});
export function validateLiveRoomRequest(p,identity,kinds){
 if(!sameLiveRoomIdentity(p,identity)||!kinds.includes(p.kind)||!roomLiveInteger(p.request,1,4294967295))throw Error('Invalid complete live Room control request');
 return p;
}
