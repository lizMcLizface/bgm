import {workerOptions,workerScheduling} from './workerProtocol.js';
export const BUFFER_PROFILES=Object.freeze([
  Object.freeze({id:'default',label:'Default · 4096 frames',blockFrames:1024,poolBlocks:4}),
  Object.freeze({id:'medium',label:'Experimental · 2048 frames',blockFrames:512,poolBlocks:4}),
  Object.freeze({id:'short',label:'Experimental · 1024 frames',blockFrames:256,poolBlocks:4})
]);
export const RECORDED_LISTENING_FEEDBACK=Object.freeze({source:'User listening report',date:'2026-11-09',profile:'short',rate:96000,result:'Crackly; other tested combinations worked well',device:null,outputRoute:null,cause:null});
export function profileListeningNote(id,rate){return id==='short'&&rate===96000?'Recorded listening feedback: Short / 96 kHz crackled; other tested combinations worked well. Cause and output route are unconfirmed. Queue counters do not certify clean device output.':'';}
export function bufferProfile(id='default'){
  const profile=BUFFER_PROFILES.find(p=>p.id===id);if(!profile)throw Error('Unknown buffering profile');return profile;
}
export const HEADROOM_BLOCKS=Object.freeze([0,2,4]);
export function extraHeadroom(value=0){if(!HEADROOM_BLOCKS.includes(value))throw Error('Invalid extra headroom');return value;}
export function profileOptions(id='default',extraBlocks=0){const p=bufferProfile(id);return {blockFrames:p.blockFrames,poolBlocks:p.poolBlocks+extraHeadroom(extraBlocks)};}
export function profileDetails(id,rate,extraBlocks=0){
  const p=bufferProfile(id),o=workerOptions(profileOptions(id,extraBlocks));
  if(![44100,48000,96000].includes(rate))throw Error('Unsupported profile sample rate');
  return {...p,poolBlocks:o.poolBlocks,extraBlocks,delayFrames:o.delayFrames,delayMs:o.delayFrames/rate*1000,blockPeriodMs:o.blockFrames/rate*1000,singlePcmBytes:o.bufferBytes*o.poolBlocks,poolPcmBytes:o.bufferBytes*o.poolBlocks*3};
}
function rotatedSchedule(values,key,repeats){
  if(!Number.isInteger(repeats)||repeats<1||repeats>5)throw Error('Invalid profile repeat count');
  const jobs=values.map(value=>({[key]:value,phase:'warmup',iteration:0}));
  for(let round=0;round<repeats;round++)for(let offset=0;offset<values.length;offset++)jobs.push({[key]:values[(round+offset)%values.length],phase:'measured',iteration:round+1});
  return jobs;
}
export function profileSchedule(repeats=3){return rotatedSchedule(BUFFER_PROFILES.map(p=>p.id),'profile',repeats);}
export function headroomSchedule(repeats=3){return rotatedSchedule(HEADROOM_BLOCKS,'extraBlocks',repeats);}
export function saveWorkerSession(fixture,profile,rate,scheduling='timer',extraBlocks=0){bufferProfile(profile);profileDetails(profile,rate,extraBlocks);return JSON.stringify({version:1,fixture,profile,rate,scheduling:workerScheduling(scheduling),extraBlocks},null,2)+'\n';}
export function loadWorkerSession(text,validateFixture){const s=JSON.parse(text);if(s?.version!==1)throw Error('Invalid worker session version');const extraBlocks=extraHeadroom(s.extraBlocks);profileDetails(s.profile,s.rate,extraBlocks);return {...s,extraBlocks,scheduling:workerScheduling(s.scheduling),fixture:validateFixture(s.fixture)};}
