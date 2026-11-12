export const FREEZE_STREAM_PROFILE='owned-freeze-worker-continuous-v1';
export const FREEZE_PACKET_FRAMES=1024;
export const FREEZE_QUANTUM=128;
export const FREEZE_COMMAND_CAPACITY=256;
export const FREEZE_MAX_CREDITS=192;
export const FREEZE_MAX_OWNERS=8;
export const FREEZE_CONTEXT_BYTES=256*1024*1024;
export const FREEZE_CONTROLLER_ALLOWANCE=1024*1024;
export const FREEZE_RANDOM='xorshift32-v1';
export const freezeInteger=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
export function freezeStreamBudget(rate){
 if(!freezeInteger(rate,8000,192000))throw Error('Freeze requires integer8..192k rate');
 const latencyFrames=Math.ceil(rate*.5/128)*128,poolBlocks=Math.ceil(latencyFrames/FREEZE_PACKET_FRAMES)+4;
 if(poolBlocks>FREEZE_MAX_CREDITS)throw Error('Freeze credit budget exceeded');
 const plannedRustBytes=4*1024*1024+Math.ceil(100*rate/65536)*65536,pcmBytes=poolBlocks*2*FREEZE_PACKET_FRAMES*4;
 return Object.freeze({profile:FREEZE_STREAM_PROFILE,rate,blockFrames:FREEZE_PACKET_FRAMES,latencyFrames,poolBlocks,packetBytes:2*FREEZE_PACKET_FRAMES*4,plannedRustBytes,pcmBytes,controllerAllowance:FREEZE_CONTROLLER_ALLOWANCE,plannedBytes:plannedRustBytes+pcmBytes+FREEZE_CONTROLLER_ALLOWANCE});
}
export function freezeStreamSpec(seed,settings={}){
 if(!freezeInteger(seed,1,0xffffffff))throw Error('Freeze requires an explicit nonzero32bit owner seed');
 const values=[settings.mix??0,settings.hold??false,settings.length??2,settings.fade??1].map((v,i)=>freezeStreamValue(i,v));
 return{version:1,kind:'freeze',seed,random:FREEZE_RANDOM,parameters:values.map((v,i)=>[i,v])};
}
export function freezeStreamValue(id,value){
 if(id===1){if(value===true||value===1)return 1;if(value===false||value===0)return 0;throw Error('Invalid Freeze hold');}
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('Invalid Freeze control');
 if(id===0)return Math.min(1,Math.max(0,value));
 if(id===2)return Math.min(4,Math.max(.25,value));
 if(id===3&&value<=30)return Math.max(.02,value);
 throw Error('Freeze control exceeds prepared contract');
}
export function freezeStreamCommand(raw){
 if(!raw||!freezeInteger(raw.seq,1,0xffffffff)||!['set','clear','flush'].includes(raw.kind))throw Error('Invalid Freeze command');
 if(raw.kind!=='set'){if(raw.entries!==undefined)throw Error('Unexpected Freeze command data');return{seq:raw.seq,kind:raw.kind};}
 if(!Array.isArray(raw.entries)||raw.entries.length<1||raw.entries.length>4)throw Error('Invalid Freeze settings');
 const seen=new Set(),entries=raw.entries.map(p=>{if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||seen.has(p[0]))throw Error('Invalid Freeze parameter identity');seen.add(p[0]);return[p[0],freezeStreamValue(p[0],p[1])];});
 return{seq:raw.seq,kind:'set',entries};
}
export function freezeStreamLatencyContract(context,budget,contract){
 if(!contract||contract.context!==context||contract.profile!==FREEZE_STREAM_PROFILE||contract.latencyFrames!==budget.latencyFrames||contract.continuousProgram!==true||typeof contract.register!=='function')throw Error('Freeze requires caller-owned continuous-program latency authority before mutation');
 return contract;
}
