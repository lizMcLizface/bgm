import {profileOptions,extraHeadroom} from './bufferProfiles.js';
import {workerScheduling} from './workerProtocol.js';
export const LISTENING_STORAGE_KEY='bgm.modular-worker.listening.v1';
export const LISTENING_LIMITS=Object.freeze({records:8,storageChars:512000});
export const VERDICTS=Object.freeze(['not-assessed','clean','improved','issues','stopped']);
export const PLAYBACK_STATES=Object.freeze(['unknown','foreground','background','locked','mixed']);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=()=>{throw Error('Invalid listening record');};
let sequence=0;
export function newListeningId(){return globalThis.crypto?.randomUUID?.()??`local-${Date.now().toString(36)}-${++sequence}`;}
function text(value,max){if(typeof value!=='string'||value.length>max)fail();return value;}
function timestamp(value){text(value,32);if(!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();return value;}
export function captureListeningRun(value){
  if(!value||Array.isArray(value.rows)||typeof value.pass!=='boolean'||typeof value.delivery?.complete!=='boolean')fail();
  text(value.runId,128);if(!value.runId)fail();timestamp(value.startedAtUtc);timestamp(value.completedAtUtc);
  text(value.fixtureId,256);if(!value.fixtureId||!/^[a-f0-9]{64}$/.test(value.fixtureHash)||!/^[a-f0-9]{16}$/.test(value.graphVersion))fail();
  if(![44100,48000,96000].includes(value.rate)||!['serial','worker','pool'].includes(value.executor?.actual))fail();
  if(value.extraBlocks===undefined)fail();const options=profileOptions(value.profile,extraHeadroom(value.extraBlocks));
  if(value.executor.blockFrames!==options.blockFrames||value.executor.poolBlocks!==options.poolBlocks||value.executor.bufferingLatencyFrames!==options.blockFrames*options.poolBlocks)fail();
  if(value.executor.actual==='serial'){if(value.executor.scheduling!==null)fail();}else{if(value.executor.scheduling===undefined)fail();workerScheduling(value.executor.scheduling);}
  return clone(value);
}
function fields(value){
  if(!value||!VERDICTS.includes(value.verdict)||!PLAYBACK_STATES.includes(value.playbackState))fail();
  return {verdict:value.verdict,playbackState:value.playbackState,device:text(value.device,160),outputRoute:text(value.outputRoute,160),notes:text(value.notes,1000)};
}
export function createListeningRecord(run,input,{recordId,recordedAtUtc}){
  text(recordId,128);if(!recordId)fail();timestamp(recordedAtUtc);
  return {kind:'bgm.modular-audio.listening',version:1,recordId,recordedAtUtc,source:'User-entered listening context and verdict; separate from automated delivery checks',run:captureListeningRun(run),listening:fields(input)};
}
export function validateListeningRecord(value){
  if(value?.kind!=='bgm.modular-audio.listening'||value.version!==1)fail();
  return createListeningRecord(value.run,value.listening,value);
}
export function loadListeningRecords(storage){
  const raw=storage.getItem(LISTENING_STORAGE_KEY);if(raw===null)return [];
  if(raw.length>LISTENING_LIMITS.storageChars)fail();const data=JSON.parse(raw);
  if(data?.version!==1||!Array.isArray(data.records)||data.records.length>LISTENING_LIMITS.records)fail();
  const records=data.records.map(validateListeningRecord);if(new Set(records.map(r=>r.recordId)).size!==records.length)fail();return records;
}
export function saveListeningRecord(storage,value){
  const record=validateListeningRecord(value),records=[record,...loadListeningRecords(storage).filter(r=>r.recordId!==record.recordId)].slice(0,LISTENING_LIMITS.records);
  let raw=JSON.stringify({version:1,records});while(raw.length>LISTENING_LIMITS.storageChars&&records.length>1){records.pop();raw=JSON.stringify({version:1,records});}
  if(raw.length>LISTENING_LIMITS.storageChars)throw Error('Run report exceeds local listening storage budget; download it instead.');
  storage.setItem(LISTENING_STORAGE_KEY,raw);return records;
}
export function serializeListeningRecord(record){return JSON.stringify(validateListeningRecord(record),null,2)+'\n';}
