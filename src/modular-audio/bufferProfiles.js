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
export function profileOptions(id='default'){const p=bufferProfile(id);return {blockFrames:p.blockFrames,poolBlocks:p.poolBlocks};}
export function profileDetails(id,rate){
  const p=bufferProfile(id),o=workerOptions(profileOptions(id));
  if(![44100,48000,96000].includes(rate))throw Error('Unsupported profile sample rate');
  return {...p,delayFrames:o.delayFrames,delayMs:o.delayFrames/rate*1000,blockPeriodMs:o.blockFrames/rate*1000,singlePcmBytes:o.bufferBytes*o.poolBlocks,poolPcmBytes:o.bufferBytes*o.poolBlocks*3};
}
export function profileSchedule(repeats=3){
  if(!Number.isInteger(repeats)||repeats<1||repeats>5)throw Error('Invalid profile repeat count');
  const jobs=BUFFER_PROFILES.map(p=>({profile:p.id,phase:'warmup',iteration:0}));
  for(let round=0;round<repeats;round++)for(let offset=0;offset<BUFFER_PROFILES.length;offset++)jobs.push({profile:BUFFER_PROFILES[(round+offset)%BUFFER_PROFILES.length].id,phase:'measured',iteration:round+1});
  return jobs;
}
export function saveWorkerSession(fixture,profile,rate,scheduling='timer'){bufferProfile(profile);profileDetails(profile,rate);return JSON.stringify({version:1,fixture,profile,rate,scheduling:workerScheduling(scheduling)},null,2)+'\n';}
export function loadWorkerSession(text,validateFixture){const s=JSON.parse(text);if(s?.version!==1)throw Error('Invalid worker session version');profileDetails(s.profile,s.rate);return {...s,scheduling:workerScheduling(s.scheduling),fixture:validateFixture(s.fixture)};}
