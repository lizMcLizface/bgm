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
export function startLiveSynth({model=MODELS.cs80,params=[],waves=null,rack=cleanRack(),latency='interactive',context:sharedContext,destination,polyphony,sourceNodeFactory,rackPluginFactory,rackDynamicsFactory,rackNativeFactory,onStats=()=>{},onError=()=>{}}={}){
 const Context=window.AudioContext||window.webkitAudioContext;
 const context=sharedContext??new Context({latencyHint:latency});
 // A shared context belongs to its host, which wakes it on Play. Awaiting its
 // resume here deadlocks setup restoration behind the browser's gesture gate.
 const resumed=sharedContext||Number.isFinite(context.length)?Promise.resolve():context.resume().catch(()=>{});
 let outboard,monitor,node,nativeGate,sourceInput;
 return (async()=>{
  if(!context.audioWorklet)throw Error('Audio needs a secure page: open this over https:// (or localhost), not plain http.');
  const captured=sourceNodeFactory?{params:params.map(p=>p.slice()),waves:waves?Float32Array.from(waves):null}:null;
  const [module]=sourceNodeFactory?(await resumed,[]):await Promise.all([loadKernel(),loadClassicsWorklet(context),resumed]);
  if(captured){params=captured.params;waves=captured.waves;}
  let stats={active:0,peak:0},outputPeak=0;
  const savedParams=new Map(params.map(([id,value])=>[id,value])),savedControls=new Map();
  let savedWaves=waves?Float32Array.from(waves):null,revision=0,sequenced=false,futureControl=false;
  node=sourceNodeFactory?await sourceNodeFactory(context,{model,params,waves:savedWaves,polyphony}):new AudioWorkletNode(context,'calmbgm-classics',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module,model,params,waves:savedWaves,polyphony}});
  await new Promise((resolve,reject)=>{if(sourceNodeFactory){if(!node?.port||typeof node.connect!=='function'||!node.ready||typeof node.ready.then!=='function'){reject(Error('Prepared classic source factory must return an actual ready AudioWorkletNode'));return;}node.ready.then(resolve,reject);}node.port.onmessage=({data})=>{
   node.handleOwnedMessage?.(data);
   if(data.type==='ready')resolve();
   else if(data.type==='error'){reject(Error(data.message));onError(Error(data.message));}
   else if(data.type==='stats'){stats=data;onStats({...data,peak:outputPeak,reduction:outboard?.reduction??0});}
  };node.onprocessorerror=()=>{const error=Error('Synth worklet failed. Reload the page.');node.handleOwnedMessage?.({type:'error',message:error.message});reject(error);onError(error);};});
  outboard=await createRack(context,rack,{pluginFactory:rackPluginFactory,dynamicsFactory:rackDynamicsFactory,nativeFactory:rackNativeFactory,onError});
  monitor=await createOutputMonitor(context,peak=>{outputPeak=peak;onStats({...stats,peak,reduction:outboard.reduction});});
  // Both paths already contain the native BBD/space/output stage. Inject before
  // the external rack, and silence native background hiss only during a lease.
  nativeGate=context.createGain();sourceInput=context.createGain();
  node.connect(nativeGate);nativeGate.connect(outboard.input);sourceInput.connect(outboard.input);
  outboard.connect(monitor.node);monitor.node.connect(destination??context.destination);
  // Batch everything sent in one task into a single message.
  let events=[],edits=[],steps=[],queued=false;
  const flush=()=>{queued=false;if(edits.length){node.port.postMessage({type:'params',values:edits});edits=[];}if(steps.length){node.port.postMessage({type:'seq',values:steps});steps=[];}if(events.length){node.port.postMessage({type:'events',values:events});events=[];}};
  const queue=()=>{if(!queued){queued=true;queueMicrotask(flush);}};
  let closed=false,holds=0;
  return {
   context,node,sourceInput,
   armRuntime:()=>context.state==='running'?Promise.all([node.armRuntime?.(),outboard.armRuntime?.()]):Promise.resolve(),
   captureSource(){if(closed||sequenced||futureControl)throw Error('Classic source is closed or has unsupported scheduled controls/sequencing');return {revision,version:1,model,parameters:Array.from(savedParams,([id,value])=>[id,value]),...(savedWaves?{waves:Array.from(savedWaves)}:{}),polyphony:Math.max(1,Math.min(32,polyphony??32)),controls:Array.from(savedControls,([id,value])=>[id,value])};},
   get sourceRevision(){return revision;},
   get closed(){return closed;},
   holdSourceInput(){if(closed)throw Error('Classic source is closed');holds++;nativeGate.gain.value=0;let released=false;return ()=>{if(released)return;released=true;holds--;if(!closed&&holds===0)nativeGate.gain.value=1;};},
   get latency(){return (context.baseLatency||0)+(context.outputLatency||0);},
   setParam(id,value){savedParams.set(id,value);revision++;edits.push([id,value]);queue();},
   setParams(pairs){for(const [id,value]of pairs){savedParams.set(id,value);edits.push([id,value]);}revision++;queue();},
   noteOn(id,note,velocity,time){events.push([NOTE_ON,id,note,velocity,time]);queue();},
   noteOff(id,time){events.push([NOTE_OFF,id,0,0,time]);queue();},
   pressure(id,value,time){events.push([PRESSURE,id,value,0,time]);queue();},
   control(which,value,time){savedControls.set(which,value);futureControl||=Number.isFinite(time)&&time>context.currentTime;revision++;events.push([CONTROL,which,value,0,time]);queue();},
   /** Sequencer commands for the drum machines and the bass line: [[cmd,a,b],…] (see syn_seq in the kernel). */
   seq(commands){sequenced=true;revision++;steps.push(...commands);queue();},
   /** The vector synthesizer's 128 waves × 128 samples (Float32Array of 16,384). */
   setWaves(data){savedWaves=Float32Array.from(data);revision++;node.port.postMessage({type:'waves',waves:savedWaves});},
   /** Asks for the newest n output samples (mono): handler({end, rate, samples}); `end` counts frames since the engine started. */
   requestScope:monitor.requestScope,
   setRack(values){revision++;outboard.patch(values);},clearRack:()=>outboard.clear(),
   panic(){revision++;flush();node.port.postMessage({type:'panic'});outboard.clear();},
   async close(){if(closed)return;closed=true;flush();const stopped=node.disposeOwned?node.disposeOwned():(node.port.postMessage({type:'dispose'}),Promise.resolve());node.disconnect();nativeGate.disconnect();sourceInput.disconnect();const effectsStopped=outboard.dispose();monitor.dispose();try{await Promise.all([stopped,effectsStopped]);}finally{if(!sharedContext)await context.close().catch(()=>{});}},
  };
 })().catch(async error=>{if(node?.disposeOwned)await node.disposeOwned();else node?.port.postMessage({type:'dispose'});node?.disconnect();nativeGate?.disconnect();sourceInput?.disconnect();outboard?.dispose();monitor?.dispose();if(!sharedContext)context.close().catch(()=>{});throw error;});
}
