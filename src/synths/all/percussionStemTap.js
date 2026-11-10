import {DRUMS,DRUM_PARAMS} from '../../app/percussion';
import {PERCUSSION_VOICES} from '../../app/percussionVoices';
import {validatePercussionConfig} from '../../modular-audio/percussionConfig';
const definition={version:1,voices:Object.keys(PERCUSSION_VOICES),slots:DRUMS.length,fields:DRUM_PARAMS};
export function validateBasicKit(config){const c=validatePercussionConfig(structuredClone(config),definition);if(!c)throw Error('A complete basic kit snapshot is required.');return c;}
// This input belongs to the host before its external drum inserts/mixer, not
// to the live kit's sleeping output. Never wake, replace or silence that kit.
export function percussionStemTap(instrument,{input,machine=false},assertHost=()=>{}){
 function current(){
  assertHost();
  if(machine)throw Error('Classic drum machines require a separate Rust source adapter.');
  if(!instrument||instrument.kind!=='percussion'||!(instrument.module instanceof WebAssembly.Module)||!instrument.node||instrument.disposed||instrument.error||!input)throw Error('Select a ready Wasm basic kit (808 or Hand percussion); native kits require a separate adapter.');
  const voice=PERCUSSION_VOICES[instrument.voicePreset];
  if(!voice||instrument.model!==voice.model||instrument.kit?.room!==0)throw Error('Rust kit preview requires the current basic palette and dry source room.');
  return validateBasicKit({version:1,voice:voice.id,drums:DRUMS.map(name=>{const d=instrument.kit[name];return {on:d?.on,level:d?.level,tone:d?.tone,decay:d?.decay};})});
 }
 const kit=current(),signature=JSON.stringify(kit),hitBase=instrument.hitCount;
 if(!Number.isInteger(hitBase)||hitBase<0||hitBase>0xffffffff)throw Error('The live kit hit counter cannot be captured safely.');
 return {input,kind:'percussion',kit,hitBase,assertCurrent(){if(JSON.stringify(current())!==signature)throw Error('The percussion source changed; stop and prepare a new preview.');}};
}
