import {WasmBackend} from '../../synth-lab/backend';
import {FMBackend} from '../../synth-lab/fmBackend';
import {createRack} from '../effects/graph';
import {createOutputMonitor} from '../effects/outputMonitor';
import {POLY,FM} from './patches';

// Same source, inserts and FDN effects as the pre-existing lab renderers.
// Only event IDs, flat panel parameters and the output scope are adapted.
export function startDiySynth({kind,params=[],rack,latency='interactive',onStats=()=>{},onError=()=>{}}){
 const context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:latency});
 const resumed=context.resume();
 const schema=kind==='fm'?FM:POLY,values=schema.params.defaultValues();
 const accept=pairs=>{for(const [id,value]of pairs){const spec=schema.params.PARAMS[id];if(spec)values[spec.key]=schema.params.clampValue(spec.key,value);}};
 accept(params);
 let backend,outboard,monitor,output,closed=false,queued=false;
 let active=0;const ids=new Map(),controls={bend:0,pressure:0,mod:0,expression:1,brightness:0,soft:0};
 const effective=()=>{
  const p=schema.inflate(values);
  p.global.bend=Math.max(-12,Math.min(12,p.global.bend+controls.bend));
  p.global.pressure=Math.max(p.global.pressure,controls.pressure);
  p.global.wheel=Math.max(p.global.wheel,controls.mod);
  if(kind==='fm')p.global.index=Math.min(3,p.global.index*2**(controls.brightness-controls.soft*.5));
  else for(const l of p.layers)l.cutoff=Math.min(18000,l.cutoff*2**(controls.brightness*2-controls.soft));
  return p;
 };
 const flush=()=>{queued=false;if(closed||!backend)return;backend.patch(effective(),{seconds:.035});output.gain.setTargetAtTime(.7*controls.expression*(1-controls.soft*.25),context.currentTime,.015);};
 const queue=()=>{if(!queued){queued=true;queueMicrotask(flush);}};
 const close=async()=>{if(closed)return;closed=true;ids.clear();backend?.dispose();outboard?.dispose();monitor?.dispose();output?.disconnect();await context.close().catch(()=>{});};
 return (async()=>{
  if(!context.audioWorklet)throw Error('Audio needs HTTPS or localhost.');
  await resumed;
  const patch=effective();
  backend=await (kind==='fm'?FMBackend:WasmBackend).create(context,patch,{onStats:s=>{active=s.active;},onError});
  const initialRack=rack??Object.fromEntries([...Object.entries(patch.inserts).map(([k,v])=>['inserts.'+k,v]),...Object.entries(patch.effects).map(([k,v])=>['effects.'+k,v])]);
  outboard=await createRack(context,initialRack,{onError});
  output=context.createGain();output.gain.value=.7;
  monitor=await createOutputMonitor(context,peak=>onStats({active,peak,reduction:outboard.reduction}));
  backend.connect(outboard.input);outboard.connect(output);output.connect(monitor.node);monitor.node.connect(context.destination);
  return {
   context,node:backend.node,get latency(){return (context.baseLatency||0)+(context.outputLatency||0);},
   setParam(id,value){accept([[id,value]]);queue();},setParams(pairs){accept(pairs);queue();},
   noteOn(id,note,velocity){if(ids.has(id))backend.off(ids.get(id));ids.set(id,backend.on(note,velocity));},
   noteOff(id){if(ids.has(id)){backend.off(ids.get(id));ids.delete(id);}},
   pressure(id,value){if(ids.has(id))backend.pressure(value,ids.get(id));},
   control(which,value){
    if(which===5){backend.sustain(value>=.5);return;}
    const key=['bend','pressure','mod','expression','brightness',null,'soft'][which];
    if(key){controls[key]=value;queue();}
   },
   setRack:values=>outboard.patch(values),clearRack:()=>outboard.clear(),
   requestScope:monitor.requestScope,
   panic(){ids.clear();backend.panic();outboard.clear();active=0;},close,
  };
 })().catch(async error=>{await close();throw error;});
}
