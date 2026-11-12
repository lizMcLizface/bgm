import{LIVE_ROOM_COMPLETE_PROFILE}from'../src/modular-audio/liveRoomCompleteProgram.js';
export const LIVE_ROOM_SCENE_KEY='pianote-live-complete-room-prepared-scene-v1';
export function liveRoomCompleteScene(report){
 if(!report?.complete||!report.checksPassed||report.cases?.length!==4||!report.host?.version||!Array.isArray(report.nativeSources))throw Error('Cannot save incomplete live Room authority');
 return{version:1,profile:LIVE_ROOM_COMPLETE_PROFILE,rate:report.rate,host:report.host.version,components:report.host.components,nativeSources:report.nativeSources,cases:report.cases.map(c=>({id:c.id,channels:c.channels,light:c.light,amount:c.amount,frames:c.frames,latencyFrames:c.latencyFrames,irFrames:c.irFrames,irChannels:c.irChannels,hashes:c.hashes,capturedControls:c.capturedControls,preparation:c.preparation,inputDefinition:{guardFrames:128,sampleLaw:'Float32(.06*sin(i*.031+channel*.4)+.02*cos(i*.071)); active from141 through128+ceil(rate*.15), else0',wholeBudgetPadded:true},sourceResource:'Original reverb4.flac; hash-bound decoded/transformed/preweighted IR',sourceSecondsContract:'Exact binary quarter-second; declared zero prefix discarded before acknowledged source-local epoch'}))};
}
export function compareLiveRoomCompleteScene(report,saved){
 if(saved?.version!==1||saved.profile!==LIVE_ROOM_COMPLETE_PROFILE||!Array.isArray(saved.cases)||saved.cases.length!==4)throw Error('No compatible complete live Room cold scene');
 return{checksPassed:JSON.stringify(liveRoomCompleteScene(report))===JSON.stringify(saved),scope:'True document-reload cold reconstruction: all source/resources/settings/component identities and both separate logical PCM hash pairs'};
}
