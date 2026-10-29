import {LabVoice} from '../voice';
import {voiceSpec} from '../catalog';
import {NOTES,SLOT,HOLD,START,SAMPLE_RATE,chordFor,levelsFromChannels,hashText} from './measure';
import {groupOf} from './groups';
// The engine the app plays by default: the new one wherever the voice has it.
export async function measureVoice(entry,velocity,chord){
 const total=NOTES.length*SLOT+1.5,ctx=new OfflineAudioContext(2,Math.ceil(total*SAMPLE_RATE),SAMPLE_RATE);
 const notes=NOTES.flatMap((root,i)=>(chord?chordFor(root):[root]).map(midi=>({midi,time:i*SLOT+START,duration:HOLD,velocity})));
 const spec=voiceSpec(entry,'wasm',16),voice=await LabVoice.create(ctx,spec,{notes});
 try{voice.connect(ctx.destination);const buffer=await ctx.startRendering();return {engine:spec.engine,levels:levelsFromChannels(buffer.getChannelData(0),buffer.getChannelData(1),SAMPLE_RATE)};}
 finally{voice.dispose?.();}
}
// What the measurement depends on: the engine and the patch the voice plays with. A stored result whose signature no longer matches is stale.
export const signature=entry=>{const spec=voiceSpec(entry,'wasm',16);return hashText(JSON.stringify([spec.engine,spec.kind,spec.patch]));};
export async function measureEntry(entry,velocity=1){
 const single=await measureVoice(entry,velocity,false),triad=await measureVoice(entry,velocity,true);
 return {name:entry.name,group:groupOf(entry.family,entry.name),engine:single.engine,sig:signature(entry),single:single.levels,chord:triad.levels};
}
// Measures `entries` with a few renders in flight; results arrive through onResult as they finish.
export async function measureAll(entries,{velocity=1,concurrency=2,onResult=()=>{},onFail=()=>{},shouldStop=()=>false}={}){
 const queue=[...entries];let done=0;
 const worker=async()=>{
  while(queue.length&&!shouldStop()){
   const entry=queue.shift();
   try{onResult(entry,await measureEntry(entry,velocity),++done,done+queue.length);}catch(e){onFail(entry,e);++done;}
  }
 };
 await Promise.all(Array.from({length:concurrency},worker));
}
