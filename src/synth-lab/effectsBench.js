import {createNativeEcho} from './nativeEcho';
import {createEffectsBus,effectsMemoryBytes} from './effects';
import {sanitizeEffects,effectTail} from './effectsConfig';
import {measure,renderFixture,fixture} from './bench';
import {clonePatch} from './patch';
import {trimImpulse,MAX_SECONDS} from '../nodes/reverb';

export async function sourceBuffer(patch,pattern,rate) {
 if(pattern==='impulse'){
  const ctx=new OfflineAudioContext(2,Math.round(rate*.3),rate),buffer=ctx.createBuffer(2,Math.round(rate*.3),rate);
  buffer.getChannelData(0)[Math.round(rate*.05)]=.35;buffer.getChannelData(1)[Math.round(rate*.05)]=.3;
  return {buffer,scoreSeconds:.3,bpm:110};
 }
 const p=clonePatch(patch);p.effects.bypass=1;
 const score=pattern==='burst'?{notes:[48,55,60,64].map(midi=>({midi,time:.05,duration:.3,velocity:.7})),scoreSeconds:.4,bpm:110}:fixture(pattern==='arpeggio'?'arpeggio':'chords',110,p.global.polyphony);
 if(pattern==='burst')for(const layer of p.layers)layer.release=Math.min(layer.release,.7);
 const r=await renderFixture(p,score,{backend:'wasm',sampleRate:rate,dry:true});return {buffer:r.buffer,scoreSeconds:score.scoreSeconds,bpm:110};
}

/** A reproducible reference impulse, not an imitation of the FDN or a measured room. */
export function syntheticImpulse(context,raw) {
 const p=sanitizeEffects(raw),sr=context.sampleRate,length=Math.ceil(p.decay*1.5*sr),buffer=context.createBuffer(2,length,sr);
 for(let ch=0;ch<2;ch++){
  let seed=0x71a3bc+ch*98761,low=0,energy=0;const data=buffer.getChannelData(ch);
  for(let i=0;i<length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/sr;
   const cutoff=Math.min(sr*.4,p.damping*Math.exp(-t/p.decay)),a=1-Math.exp(-2*Math.PI*cutoff/sr);
   low+=a*(noise-low);const value=i<sr*.008?0:low*Math.exp(-Math.log(1000)*t/p.decay);data[i]=value;energy+=value*value;
  }
  const gain=1/Math.sqrt(energy||1);for(let i=0;i<length;i++)data[i]*=gain;
 }
 return buffer;
}
const rooms=new Map();
async function roomImpulse(context,type) {
 const key=context.sampleRate+':'+type;
 if(!rooms.has(key))rooms.set(key,fetch(`${import.meta.env.BASE_URL}reverb/${type}.flac`).then(r=>{if(!r.ok)throw Error('Room impulse failed to load.');return r.arrayBuffer();}).then(b=>context.decodeAudioData(b)).then(b=>trimImpulse(context,b,MAX_SECONDS)).catch(e=>{rooms.delete(key);throw e;}));
 return rooms.get(key);
}
function gain(context,value,nodes){const n=context.createGain();n.gain.value=value;nodes.push(n);return n;}
const shaperCurve=(()=>{const curve=new Float32Array(8193);for(let i=0;i<curve.length;i++){const x=(i/(curve.length-1)*2-1)*3;curve[i]=x*(27+x*x)/(27+9*x*x);}return curve;})();

/** Native reference: same send layout, filtered stereo delay, convolution room. */
export async function nativeEffectsBus(context,raw,{reference='synthetic',room='reverb1'}={}) {
 const p=sanitizeEffects(raw),nodes=[],input=gain(context,1,nodes),sum=gain(context,1,nodes);
 if(p.bypass){input.gain.value=p.dry;input.connect(sum);return {input,connect:d=>sum.connect(d),dispose:()=>nodes.forEach(n=>n.disconnect()),memoryBytes:0,irSeconds:0};}
 const out=context.createWaveShaper(),scale=gain(context,1/3,nodes);out.curve=shaperCurve;nodes.push(out);sum.connect(scale);scale.connect(out);
 const dry=gain(context,p.dry,nodes);input.connect(dry);dry.connect(sum);
 const roomInput=gain(context,1,nodes),predelay=context.createDelay(.3);predelay.delayTime.value=p.predelay/1000;nodes.push(predelay);
 const send=gain(context,p.reverb,nodes);input.connect(send);send.connect(roomInput);
 let impulse=null,echo;
 if(p.reverb>0||p.delay>0&&p.delayToReverb>0){
  const convolver=context.createConvolver();convolver.normalize=reference!=='synthetic';
  impulse=reference==='synthetic'?syntheticImpulse(context,p):await roomImpulse(context,room);convolver.buffer=impulse;nodes.push(convolver);
  roomInput.connect(predelay);predelay.connect(convolver);
  const split=context.createChannelSplitter(2),merge=context.createChannelMerger(2);nodes.push(split,merge);convolver.connect(split);
  for(let from=0;from<2;from++)for(let to=0;to<2;to++){const width=gain(context,(1+(from===to?1:-1)*p.width)/2,nodes);split.connect(width,from);width.connect(merge,0,to);}
  const roomReturn=gain(context,10**(p.reverbReturn/20),nodes);merge.connect(roomReturn);roomReturn.connect(sum);
 }
 if(p.delay>0){
  echo=await createNativeEcho(context,p);input.connect(echo.input);echo.output.connect(sum);
  const intoRoom=gain(context,p.delayToReverb,nodes);echo.output.connect(intoRoom);intoRoom.connect(roomInput);
 }
 return {input,connect:d=>out.connect(d),dispose:()=>{echo?.dispose();nodes.forEach(n=>n.disconnect());},nativeDelayCompensationFrames:echo?.compensationFrames??0,memoryBytes:impulse?impulse.length*impulse.numberOfChannels*4:0,irSeconds:impulse?.duration??0};
}

export function tailMetrics(buffer,sourceEnds) {
 const sr=buffer.sampleRate,begin=Math.min(buffer.length,Math.round(sourceEnds*sr)),step=Math.round(sr*.1),bins=[];
 for(let at=begin;at<buffer.length;at+=step){let energy=0,count=0;for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=at;i<Math.min(buffer.length,at+step);i++){energy+=data[i]*data[i];count++;}}bins.push({time:at/sr,rms:Math.sqrt(energy/Math.max(1,count))});}
 let energy=0;const edc=[];for(let i=bins.length-1;i>=0;i--){energy+=bins[i].rms**2;edc[i]=energy;}
 const points=[];for(let i=0;i<bins.length;i++){bins[i].db=20*Math.log10(Math.max(1e-10,bins[i].rms));const db=10*Math.log10(Math.max(1e-20,edc[i]/(edc[0]||1)));if(db<=-5&&db>=-25)points.push([bins[i].time-sourceEnds,db]);}
 let rt60=null;if(points.length>=8){const n=points.length,sx=points.reduce((s,p)=>s+p[0],0),sy=points.reduce((s,p)=>s+p[1],0),sxy=points.reduce((s,p)=>s+p[0]*p[1],0),sxx=points.reduce((s,p)=>s+p[0]**2,0);const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx);if(slope<0)rt60=-60/slope;}
 const energyAt=(from,to)=>{const selected=bins.filter(b=>b.time>=sourceEnds+from&&b.time<sourceEnds+to);return Math.sqrt(selected.reduce((s,b)=>s+b.rms**2,0)/Math.max(1,selected.length));};
 return {bins,estimatedRT60:rt60,endDb:bins.at(-1)?.db??-200,rms:energyAt(0,Infinity),startDb:20*Math.log10(Math.max(1e-10,energyAt(0,1))),fiveSecondDb:20*Math.log10(Math.max(1e-10,energyAt(5,6)))};
}
export async function renderEffects(source,raw,{backend='fdn',sampleRate=48000,reference='synthetic',room='reverb1',window='full'}={}) {
 const p=sanitizeEffects(raw),tail=effectTail(p),seconds=source.duration+(window==='fixed'?10:Math.max(.5,tail)),context=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate);
 const started=performance.now();let bus,failure;
 try{
  bus=backend==='fdn'?await createEffectsBus(context,p,{onError:e=>{failure=e;}}):await nativeEffectsBus(context,p,{reference,room});
  const input=context.createBufferSource();input.buffer=source;input.connect(bus.input);bus.connect(context.destination);input.start();
  const prepared=performance.now(),buffer=await context.startRendering(),finished=performance.now();if(failure)throw failure;
  const metrics=measure(buffer);if(metrics.nonFinite)throw Error('Nonfinite effects output.');
  const memory=backend==='fdn'?effectsMemoryBytes():bus.memoryBytes;
  return {backend,buffer,prepareMs:prepared-started,renderMs:finished-prepared,seconds,sampleRate,sourceSeconds:source.duration,metrics,tail:tailMetrics(buffer,source.duration),memoryBytes:await memory,memoryKind:backend==='fdn'?'entire Wasm linear memory':'impulse samples only; native DSP memory unavailable',irSeconds:bus.irSeconds??null,nativeDelayCompensationFrames:bus.nativeDelayCompensationFrames??0,window,requestedTail:tail,truncated:window==='fixed'&&tail>10};
 }finally{bus?.dispose();}
}
