import {patchColourTail} from './voiceColour';
import {makeWasmNode} from './backend';
import {clonePatch,legacyPreset} from './patch';
import Instrument from '../app/engine/Instrument';
import {noiseReady} from '../nodes/noiseGenerator';
import {bitCrusherReady} from '../nodes/bitcrusher';
import {createEffectsBus} from './effects';
import {effectTail} from './effectsConfig';
import {createInstrumentInserts} from './inserts';
import {insertsTail} from './insertsConfig';

export function fixture(pattern='chords',bpm=110,voices=8){
 bpm=Math.max(40,Math.min(200,Number(bpm)||110));voices=Math.max(1,Math.min(32,Math.round(Number(voices)||8)));
 const beat=60/bpm,notes=[];
 if(pattern==='arpeggio')for(let i=0;i<32;i++)notes.push({midi:[48,55,60,64,67,64,60,55][i%8],time:.05+i*beat/2,duration:beat*.42,velocity:.65+(i%4===0?.15:0)});
 else if(pattern==='stress')for(let group=0;group<4;group++)for(let i=0;i<voices;i++)notes.push({midi:45+i,time:.05+group*beat*4,duration:beat*4.2,velocity:.5});
 else if(pattern==='held')for(const midi of [48,55,60,64,67,72].slice(0,voices))notes.push({midi,time:.05,duration:beat*14,velocity:.7});
 else {const chords=[[48,55,60,64,67,72,76,79],[45,52,57,60,64,69,72,76],[41,48,53,57,60,65,69,72],[43,50,55,59,62,67,71,74]];for(let bar=0;bar<4;bar++)for(const midi of chords[bar].slice(0,voices))notes.push({midi,time:.05+bar*4*beat,duration:beat*3.7,velocity:bar%2?.6:.8});}
 return {notes,scoreSeconds:beat*16+.05,bpm};
}
export const eventsFor=(score,sampleRate)=>score.notes.flatMap((n,i)=>[[0,i+1,Math.round(n.time*sampleRate),n.midi,n.velocity],[1,i+1,Math.round((n.time+n.duration)*sampleRate),0,0]]);
export function measure(buffer){let peak=0,energy=0,nonFinite=0,dc=0,fullScale=0;for(let c=0;c<buffer.numberOfChannels;c++){let sum=0;for(const x of buffer.getChannelData(c)){if(!Number.isFinite(x)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(x));energy+=x*x;sum+=x;if(Math.abs(x)>=.999)fullScale++;}dc=Math.max(dc,Math.abs(sum/buffer.length));}return {peak,rms:Math.sqrt(energy/(buffer.length*buffer.numberOfChannels)),dc,nonFinite,fullScale};}
export async function renderFixture(patch,score,{backend='wasm',sampleRate=48000,dry=true}={}){
 const p=clonePatch(patch),release=Math.max(p.layers[0].release,p.global.model===2?p.layers[1].release:0),seconds=score.scoreSeconds+release+patchColourTail(p)+.2+(dry?0:effectTail(p.effects)+insertsTail(p.inserts));
 const ctx=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate);let instrument,node,fx,insert,failure;
 const start=performance.now();
 try{
  if(!dry&&!p.effects.bypass){fx=await createEffectsBus(ctx,p.effects,{onError:e=>{failure=e;}});fx.connect(ctx.destination);}
  if(!dry){insert=await createInstrumentInserts(ctx,p.inserts,{onError:e=>{failure=e;}});insert.connect(fx?.input??ctx.destination);}const destination=insert?.input??fx?.input??ctx.destination;
  if(backend==='wasm'){node=await makeWasmNode(ctx,p,{events:eventsFor(score,sampleRate),offline:true,dry,onError:e=>{failure=e;}});node.connect(destination);}
  else {
   instrument=new Instrument({polyphony:p.global.polyphony,preset:legacyPreset(p,{dry}),context:ctx});instrument.scheduleSleep=()=>{};
   await Promise.all([noiseReady(ctx),bitCrusherReady(ctx)]);instrument.connect(destination);
   for(const n of score.notes)instrument.scheduleNote(n.midi,n.time,n.duration,n.velocity);
  }
  const prepared=performance.now(),buffer=await ctx.startRendering(),finished=performance.now();if(failure)throw failure;
  const metrics=measure(buffer);if(metrics.nonFinite||metrics.rms<1e-8)throw Error(`${backend} render produced ${metrics.nonFinite?'non-finite samples':'silence'}.`);
  return {buffer,metrics,prepareMs:prepared-start,renderMs:finished-prepared,seconds,backend,sampleRate};
 }finally{node?.disconnect();node?.port.close();instrument?.dispose();fx?.dispose();insert?.dispose();}
}
export function wavBlob(buffer,gain=1){
 const frames=buffer.length,channels=buffer.numberOfChannels,bytes=new ArrayBuffer(44+frames*channels*2),view=new DataView(bytes);let offset=0;
 const text=s=>{for(const ch of s)view.setUint8(offset++,ch.charCodeAt(0));},u16=n=>{view.setUint16(offset,n,true);offset+=2;},u32=n=>{view.setUint32(offset,n,true);offset+=4;};
 text('RIFF');u32(36+frames*channels*2);text('WAVEfmt ');u32(16);u16(1);u16(channels);u32(buffer.sampleRate);u32(buffer.sampleRate*channels*2);u16(channels*2);u16(16);text('data');u32(frames*channels*2);
 const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,data[c][i]*gain));view.setInt16(offset,Math.round(x*(x<0?32768:32767)),true);offset+=2;}return new Blob([bytes],{type:'audio/wav'});
}
export function matchGains(a,b,{tail=false}={}){
 const rms=[a,b].map(r=>tail?r.tail?.rms:r.metrics.rms);
 // A silent reference has no meaningful matching level. Never mute the other
 // path or produce a NaN gain when comparing a finished room with a long tail.
 if(rms.some(n=>!Number.isFinite(n)||n<1e-10))return [1,1];
 const target=Math.min(...rms);return rms.map(n=>target/n);
}
