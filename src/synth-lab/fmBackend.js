import {kernelAsset} from './kernelAssets';
import {loadFMModule} from './fmModule';
import {FM_BANK_LINK,makeFMBankNode} from './fmBank';
import {optionalSpeedup} from '../audio/perfMode';
import {sanitizeNoteBehavior} from './noteBehavior';
import {patchColourTail} from './voiceColour';
import {WasmBackend} from './backend';
import {fmPacket,cloneFM} from './fmPatch';
import {createEffectsBus} from './effects';
import {effectTail} from './effectsConfig';
import {createInstrumentInserts} from './inserts';
import {insertsTail} from './insertsConfig';
import {fixture,eventsFor,measure} from './bench';
const registrations=new WeakMap();
export async function makeFMNode(context,patch,{auditStats=false,offline=false,patches=[],events=[],stopFrame=Number.isFinite(context.length)?context.length:null,onStats=()=>{},onError=()=>{}}={}){
 if(optionalSpeedup(FM_BANK_LINK)){try{return await makeFMBankNode(context,patch,{auditStats,offline,patches,events,stopFrame,onStats,onError});}catch{/* Optional prototype failure retains the independent source path. */}}
 const {module,simd}=await loadFMModule();if(!registrations.has(context))registrations.set(context,context.audioWorklet.addModule(kernelAsset('fm','fm-processor.js')));await registrations.get(context);
 const node=new AudioWorkletNode(context,'calmbgm-fm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module,simd,patch:fmPacket(patch),offline,events,stopFrame,auditStats,performance:sanitizeNoteBehavior(patch.performance),patches:patches.map(p=>({...p,patch:fmPacket(p.patch),performance:sanitizeNoteBehavior(p.patch.performance)}))}});
 node.port.onmessage=({data})=>{if(data.type==='stats')onStats(data);if(data.type==='error')onError(Error(data.message));};node.onprocessorerror=()=>onError(Error('FM processor stopped. Reload the instrument.'));return node;
}
export class FMBackend extends WasmBackend {
 static async create(context,patch,options){const b=new FMBackend(context,await makeFMNode(context,patch,options));b.kind='fm';return b;}
 patch(p,{seconds=.06,time}={}){this.node.port.postMessage({type:'parameters',patch:fmPacket(p),performance:sanitizeNoteBehavior(p.performance),seconds,frame:Number.isFinite(time)?Math.round(time*this.context.sampleRate):undefined});}
}
export function fmFixture(pattern='chords',voices=8){
 if(pattern!=='glide'){const score=fixture(pattern,110,voices);return {...score,events:null};}
 const beat=60/110,notes=[48,55,60,64].slice(0,voices).map(midi=>({midi,time:.05,duration:beat*15,velocity:.7}));
 const score={notes,bpm:110,scoreSeconds:beat*16+.05};const targets=[[45,52,57,60],[41,48,53,57],[43,50,55,59]];
 return {...score,retunes:targets.flatMap((chord,bar)=>notes.map((_,i)=>({id:i+1,midi:chord[i],time:.05+(bar+1)*4*beat,seconds:1.1})))};
}
export function fmEvents(score,rate){return [...eventsFor(score,rate),...(score.retunes??[]).map(n=>[5,n.id,Math.round(n.time*rate),n.midi,n.seconds])];}
export async function renderFM(raw,{sampleRate=48000,quality=1,pattern='chords',dry=true}={}){
 const p=cloneFM(raw);p.global.quality=quality;const score=fmFixture(pattern,p.global.polyphony),seconds=score.scoreSeconds+Math.max(...p.operators.slice(0,p.global.operators).map(o=>o.release))+patchColourTail(p)+.2+(dry?0:effectTail(p.effects)+insertsTail(p.inserts));
 const context=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate),started=performance.now();let node,fx,insert,failure;
 try{
  if(!dry&&!p.effects.bypass){fx=await createEffectsBus(context,p.effects,{onError:e=>{failure=e;}});fx.connect(context.destination);}
  node=await makeFMNode(context,p,{offline:true,events:fmEvents(score,sampleRate),onError:e=>{failure=e;}});if(!dry)insert=await createInstrumentInserts(context,p.inserts,{onError:e=>{failure=e;}});node.connect(insert?.input??fx?.input??context.destination);insert?.connect(fx?.input??context.destination);
  const prepared=performance.now(),buffer=await context.startRendering(),finished=performance.now();if(failure)throw failure;const metrics=measure(buffer);if(metrics.nonFinite||metrics.rms<1e-8)throw Error('FM render is silent or nonfinite.');
  return {buffer,quality,sampleRate,seconds,scoreSeconds:score.scoreSeconds,bpm:score.bpm,prepareMs:prepared-started,renderMs:finished-prepared,metrics};
 }finally{node?.disconnect();node?.port.close();fx?.dispose();insert?.dispose();}
}
