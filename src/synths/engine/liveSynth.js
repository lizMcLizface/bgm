// Live AudioWorklet host for the classic-synth kernel. The synths pages use their
// own AudioContext with an interactive latency hint: playing a piano through it
// needs a short output buffer more than the generator's dropout insurance.
import versions from './kernelVersion.json';
import {MODELS} from './offline';
import {createRack} from '../effects/graph';
import {cleanRack} from '../effects/params';
import {createOutputMonitor} from '../effects/outputMonitor';

export {MODELS};
export const CONTROLS={bend:0,pressure:1,mod:2,expression:3,brightness:4,sustain:5,soft:6};
const NOTE_ON=0,NOTE_OFF=1,PRESSURE=2,CONTROL=3;
const asset=file=>`${import.meta.env.BASE_URL}synths/${file}?v=${versions.kernel}`;

let compiled;
const worklets=new WeakMap();
export function loadClassicsWorklet(context){
 if(!worklets.has(context))worklets.set(context,context.audioWorklet.addModule(asset('classics-processor.js')).catch(error=>{worklets.delete(context);throw error;}));
 return worklets.get(context);
}
export function loadKernel(){
 return compiled??=fetch(asset('classics.wasm')).then(r=>{if(!r.ok)throw Error(`Could not load the synth engine (${r.status}).`);return r.arrayBuffer();}).then(b=>WebAssembly.compile(b)).catch(error=>{compiled=null;throw error;});
}

/** Creates the context synchronously (call from a tap/click), then loads the kernel. */
export function startLiveSynth({model=MODELS.cs80,params=[],waves=null,rack=cleanRack(),latency='interactive',context:sharedContext,destination,polyphony,onStats=()=>{},onError=()=>{}}={}){
 const Context=window.AudioContext||window.webkitAudioContext;
 const context=sharedContext??new Context({latencyHint:latency});
 const resumed=Number.isFinite(context.length)?Promise.resolve():context.resume().catch(()=>{});
 let outboard,monitor,node;
 return (async()=>{
  if(!context.audioWorklet)throw Error('Audio needs a secure page: open this over https:// (or localhost), not plain http.');
  const [module]=await Promise.all([loadKernel(),loadClassicsWorklet(context),resumed]);
  let stats={active:0,peak:0},outputPeak=0;
  node=new AudioWorkletNode(context,'calmbgm-classics',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module,model,params,waves,polyphony}});
  await new Promise((resolve,reject)=>{node.port.onmessage=({data})=>{
   if(data.type==='ready')resolve();
   else if(data.type==='error'){reject(Error(data.message));onError(Error(data.message));}
   else if(data.type==='stats'){stats=data;onStats({...data,peak:outputPeak,reduction:outboard?.reduction??0});}
  };node.onprocessorerror=()=>{const error=Error('Synth worklet failed. Reload the page.');reject(error);onError(error);};});
  outboard=await createRack(context,rack,{onError});
  monitor=await createOutputMonitor(context,peak=>{outputPeak=peak;onStats({...stats,peak,reduction:outboard.reduction});});
  node.connect(outboard.input);outboard.connect(monitor.node);monitor.node.connect(destination??context.destination);
  // Batch everything sent in one task into a single message.
  let events=[],edits=[],steps=[],queued=false;
  const flush=()=>{queued=false;if(edits.length){node.port.postMessage({type:'params',values:edits});edits=[];}if(steps.length){node.port.postMessage({type:'seq',values:steps});steps=[];}if(events.length){node.port.postMessage({type:'events',values:events});events=[];}};
  const queue=()=>{if(!queued){queued=true;queueMicrotask(flush);}};
  let closed=false;
  return {
   context,node,
   get latency(){return (context.baseLatency||0)+(context.outputLatency||0);},
   setParam(id,value){edits.push([id,value]);queue();},
   setParams(pairs){edits.push(...pairs);queue();},
   noteOn(id,note,velocity,time){events.push([NOTE_ON,id,note,velocity,time]);queue();},
   noteOff(id,time){events.push([NOTE_OFF,id,0,0,time]);queue();},
   pressure(id,value,time){events.push([PRESSURE,id,value,0,time]);queue();},
   control(which,value,time){events.push([CONTROL,which,value,0,time]);queue();},
   /** Sequencer commands for the drum machines and the bass line: [[cmd,a,b],…] (see syn_seq in the kernel). */
   seq(commands){steps.push(...commands);queue();},
   /** The vector synthesizer's 128 waves × 128 samples (Float32Array of 16,384). */
   setWaves(data){node.port.postMessage({type:'waves',waves:data});},
   /** Asks for the newest n output samples (mono): handler({end, rate, samples}); `end` counts frames since the engine started. */
   requestScope:monitor.requestScope,
   setRack:values=>outboard.patch(values),clearRack:()=>outboard.clear(),
   panic(){flush();node.port.postMessage({type:'panic'});outboard.clear();},
   async close(){if(closed)return;closed=true;flush();node.port.postMessage({type:'dispose'});node.disconnect();outboard.dispose();monitor.dispose();if(!sharedContext)await context.close().catch(()=>{});},
  };
 })().catch(error=>{node?.port.postMessage({type:'dispose'});node?.disconnect();outboard?.dispose();monitor?.dispose();if(!sharedContext)context.close().catch(()=>{});throw error;});
}
