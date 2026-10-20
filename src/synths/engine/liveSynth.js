// Live AudioWorklet host for the classic-synth kernel. The synths pages use their
// own AudioContext with an interactive latency hint: playing a piano through it
// needs a short output buffer more than the generator's dropout insurance.
import versions from './kernelVersion.json';
import {MODELS} from './offline';

export {MODELS};
export const CONTROLS={bend:0,pressure:1,mod:2,expression:3,brightness:4,sustain:5,soft:6};
const NOTE_ON=0,NOTE_OFF=1,PRESSURE=2,CONTROL=3;
const asset=file=>`${import.meta.env.BASE_URL}synths/${file}?v=${versions.kernel}`;

let compiled;
export function loadKernel(){
 return compiled??=fetch(asset('classics.wasm')).then(r=>{if(!r.ok)throw Error(`Could not load the synth engine (${r.status}).`);return r.arrayBuffer();}).then(b=>WebAssembly.compile(b)).catch(error=>{compiled=null;throw error;});
}

/** Creates the context synchronously (call from a tap/click), then loads the kernel. */
export function startLiveSynth({model=MODELS.cs80,params=[],waves=null,latency='interactive',onStats=()=>{},onError=()=>{}}={}){
 const Context=window.AudioContext||window.webkitAudioContext;
 const context=new Context({latencyHint:latency});
 const resumed=context.resume().catch(()=>{});
 return (async()=>{
  const [module]=await Promise.all([loadKernel(),context.audioWorklet.addModule(asset('classics-processor.js')),resumed]);
  const node=new AudioWorkletNode(context,'calmbgm-classics',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module,model,params,waves}});
  await new Promise((resolve,reject)=>{node.port.onmessage=({data})=>{
   if(data.type==='ready')resolve();
   else if(data.type==='error'){reject(Error(data.message));onError(Error(data.message));}
   else if(data.type==='stats')onStats(data);
  };});
  node.connect(context.destination);
  // Batch everything sent in one task into a single message.
  let events=[],edits=[],queued=false;
  const flush=()=>{queued=false;if(edits.length){node.port.postMessage({type:'params',values:edits});edits=[];}if(events.length){node.port.postMessage({type:'events',values:events});events=[];}};
  const queue=()=>{if(!queued){queued=true;queueMicrotask(flush);}};
  let closed=false;
  return {
   context,node,
   get latency(){return (context.baseLatency||0)+(context.outputLatency||0);},
   setParam(id,value){edits.push([id,value]);queue();},
   setParams(pairs){edits.push(...pairs);queue();},
   noteOn(id,note,velocity){events.push([NOTE_ON,id,note,velocity]);queue();},
   noteOff(id){events.push([NOTE_OFF,id,0,0]);queue();},
   pressure(id,value){events.push([PRESSURE,id,value,0]);queue();},
   control(which,value){events.push([CONTROL,which,value,0]);queue();},
   /** The vector synthesizer's 128 waves × 128 samples (Float32Array of 16,384). */
   setWaves(data){node.port.postMessage({type:'waves',waves:data});},
   panic(){flush();node.port.postMessage({type:'panic'});},
   async close(){if(closed)return;closed=true;flush();node.port.postMessage({type:'dispose'});node.disconnect();await context.close().catch(()=>{});},
  };
 })().catch(error=>{context.close().catch(()=>{});throw error;});
}
