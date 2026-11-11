import {createInstrumentInserts} from '../../synth-lab/inserts';
import {createEffectsBus} from '../../synth-lab/effects';
import Compressor from '../../nodes/compressor';
import {rackPackets} from './params';
import {orderFromCode,chainUnits,stagesFor} from './order';
import {EXTRA_KINDS,createExtraStage} from './extras';
import {rackStages} from './routing';
import {instanceStages} from './instances';
import {DRIVE_PEDALS} from './driveModel';
import {createDriveStage} from './driveStage';
export const spaceStagePacket=(kind,e)=>kind==='reverb'?{...e,delay:0,delayToReverb:0}:{...e,reverb:0,delayToReverb:0,dry:1};

// One rack per running instrument. Its controller may be in another tab;
// the audio graph always stays alongside its source and AudioContext.
//
// The units in the chain (master.chain) run in the order the user sets (master.order, see order.js); a unit that is not in
// the chain is not wired at all. The inserts kernel runs saturation, EQ, phaser, flanger and chorus in one fixed order, so each
// run of insert effects already in that order shares one kernel instance (the default order is one instance, as before) and the
// others get their own, masked so they only run their own effects; the compressor, the space unit (delay into reverb, with the
// dry signal) and the added units (extras.js) are single stages. Every link of the chain is stereo (two channels, explicit):
// the phaser, flanger and chorus offset their left and right modulation, so a mono source leaves them as a wide stereo signal and
// each later effect treats the two channels separately; the compressor (a stereo-linked DynamicsCompressorNode) sees both
// channels at once, so a compressor after the modulation effects reacts to the combined level and one before them does not;
// the space unit is stereo in and out (ping-pong and width act on the two channels).
export async function createRack(context,values,{onError=()=>{},instances=null,pluginFactory,dynamicsFactory}={}){
 if(dynamicsFactory!==undefined&&typeof dynamicsFactory!=='function')throw Error('Invalid prepared rack dynamics factory');
 const pool=[]; // inserts kernel instances, created as the order needs them
 const extra={}; // added units' stages, created when first put in the chain
 const split={}; // independent reverb/delay buses, also used by legacy reverb-first rigs
 const drives={};let instanceGraph=instances;
 let effects,metering=false,wired='',latest=values,busy=false,disposed=false,failed=false;
 const nodes=[],gain=()=>{const n=context.createGain();nodes.push(n);return n;};
 const input=gain(),trim=gain(),processed=gain(),bypass=gain(),output=gain();
 const ownedCompressor=dynamicsFactory?dynamicsFactory(context,{kind:'compressor',onError}):null;
 if(ownedCompressor&&(!ownedCompressor.input||!ownedCompressor.output||typeof ownedCompressor.patch!=='function')){ownedCompressor.dispose?.();throw Error('Invalid prepared compressor stage');}
 const compIn=gain(),clean=ownedCompressor?null:gain(),compressed=ownedCompressor?null:gain(),compOut=ownedCompressor?ownedCompressor.output:gain();
 const compressor=ownedCompressor?null:new Compressor(context);if(compressor)nodes.push(compressor.getNode());
 const detector=context.createAnalyser();detector.fftSize=256;nodes.push(detector);const detectorSamples=new Float32Array(256);
 let links=[];
 const link=(from,to)=>{from.connect(to);links.push([from,to]);};
 const unlink=()=>{for(const [from,to] of links){try{from.disconnect(to);}catch{/* already gone */}}links=[];};
 let disposal;
 const dispose=()=>{if(disposed)return disposal;disposed=true;const pending=[],close=s=>{try{const result=s?.dispose?.();if(result?.then)pending.push(result);}catch(error){onError(error);}};pool.forEach(close);Object.values(extra).forEach(close);Object.values(drives).forEach(close);Object.values(split).forEach(close);close(effects);close(ownedCompressor);nodes.forEach(n=>n.disconnect());if(pending.length)disposal=Promise.allSettled(pending).then(results=>{for(const result of results)if(result.status==='rejected')onError(result.reason);});return disposal;};
 // the inserts packet for one run of effects: the effects outside the run are zeroed, the output trim belongs to the last run
 const runPacket=(inserts,units,last)=>{
  const p={...inserts};
  if(!units.includes('saturation'))p.saturation=0;
  if(!units.includes('eq'))p.lowGain=p.midGain=p.highGain=0;
  for(const k of ['phaser','flanger','chorus'])if(!units.includes(k))p[k]=0;
  if(!last)p.gain=0;
  return p;
 };
 const stagesOf=raw=>instanceGraph?instanceStages(instanceGraph,raw):rackStages(raw);
 const signature=stages=>stages.map(s=>s.kind==='inserts'?'i:'+s.units.join('+'):s.kind).join('|');
 const patch=(raw,initial=false,nextInstances=instanceGraph)=>{
  if(disposed)return;instanceGraph=nextInstances;
  latest=raw;
  const {inserts:i,effects:e,compressor:c,master:m,extras:x}=rackPackets(raw);
  metering=!!(m.enabled&&c.enabled);
  const stages=stagesOf(raw),runs=stages.filter(s=>s.kind==='inserts');
  pool.forEach((inst,k)=>{const run=runs[k];inst.patch(run?runPacket(i,run.units,k===runs.length-1):{...i,saturation:0,lowGain:0,midGain:0,highGain:0,phaser:0,flanger:0,chorus:0,gain:0});});
  for(const [kind,stage] of Object.entries(extra))stage.patch(x[kind],initial);
  for(const [id,stage] of Object.entries(drives)){const item=instanceGraph?.instances.find(i=>i.id===id);if(item)stage.patch(item,initial);}
  effects?.patch(e);
  // Isolate each space processor: reverb owns its dry-level control, delay passes the incoming dry signal.
  for(const [kind,bus] of Object.entries(split))bus.patch(spaceStagePacket(kind,e));
  const set=(param,v)=>initial?param.setValueAtTime(v,context.currentTime):param.setTargetAtTime(v,context.currentTime,.012);
  set(trim.gain,10**(m.input/20));set(processed.gain,m.enabled&&!busy?m.mix*10**(m.output/20):0);set(bypass.gain,m.enabled?(1-m.mix)*10**((m.input+m.output)/20):1);
  // the compressor's mix blends the compressed signal with the dry one (parallel compression)
  if(ownedCompressor)ownedCompressor.patch(c,initial);
  else{set(clean.gain,c.enabled?1-c.mix:1);set(compressed.gain,c.enabled?c.mix*10**(c.makeup/20):0);
  for(const key of ['threshold','ratio','knee','attack','release'])set(compressor.getNode()[key],c[key]);}
  if(!initial&&!busy&&signature(stages)!==wired)rewire();
 };
 // creates what a set of stages needs: inserts instances and added-unit stages (some load asynchronously)
 const ensure=async stages=>{
  if(stages.some(s=>s.kind==='space')&&!effects){const bus=await createEffectsBus(context,rackPackets(latest).effects,{onError});if(disposed){bus.dispose();return false;}effects=bus;}
  const runs=stages.filter(s=>s.kind==='inserts');
  while(pool.length<runs.length){const inst=await createInstrumentInserts(context,rackPackets(latest).inserts,{onError});if(disposed){inst.dispose();return false;}pool.push(inst);}
  for(const stage of stages)if((stage.kind==='reverb'||stage.kind==='delay')&&!split[stage.kind]){const bus=await createEffectsBus(context,spaceStagePacket(stage.kind,rackPackets(latest).effects),{onError});if(disposed){bus.dispose();return false;}split[stage.kind]=bus;}
  for(const stage of stages)if(EXTRA_KINDS.includes(stage.kind)&&!extra[stage.kind]){const made=await createExtraStage(context,stage.kind,{pluginFactory,dynamicsFactory,onError,initialPacket:rackPackets(latest).extras[stage.kind]});if(disposed){made.dispose();return false;}extra[stage.kind]=made;made.patch(rackPackets(latest).extras[stage.kind],true);}
  for(const stage of stages)if(DRIVE_PEDALS[stage.kind]&&!drives[stage.instance.id]){const made=createDriveStage(context,stage.kind);drives[stage.instance.id]=made;made.patch(stage.instance,true);}
  return true;
 };
 // trim -> stages in order -> processed
 const wire=stages=>{
  unlink();
  if(ownedCompressor){link(compIn,ownedCompressor.input);link(compIn,detector);}
  else{link(compIn,clean);link(compIn,compressor.getNode());link(compIn,detector);link(compressor.getNode(),compressed);link(clean,compOut);link(compressed,compOut);}
  link(input,trim);link(processed,output);link(input,bypass);link(bypass,output);
  let from=trim,k=0;
  for(const stage of stages){
   let into,out;
   if(stage.kind==='inserts'){const inst=pool[k++];into=inst.input;out=inst.node;}
   else if(stage.kind==='compressor'){into=compIn;out=compOut;}
   else if(stage.kind==='space'){into=effects.input;out=effects.node;}
   else if(stage.kind==='reverb'||stage.kind==='delay'){into=split[stage.kind].input;out=split[stage.kind].node;}
   else if(DRIVE_PEDALS[stage.kind]){into=drives[stage.instance.id].input;out=drives[stage.instance.id].output;}
   else{into=extra[stage.kind].input;out=extra[stage.kind].output;}
   link(from,into);from=out;
  }
  link(from,processed);
  wired=signature(stages);
 };
 // the rack is muted for a few milliseconds while the links change, so a reorder, an add or a remove does not click
 async function rewire(){
  busy=true;
  try{
   for(;;){
    const stages=stagesOf(latest),sig=signature(stages);
    if(!await ensure(stages))return;
    const now=context.currentTime;processed.gain.cancelScheduledValues(now);processed.gain.setTargetAtTime(0,now,.004);
    await new Promise(r=>setTimeout(r,25));
    if(disposed)return;
    wire(stages);
    if(signature(stagesOf(latest))===sig)break; // a newer chain arrived while this one was being built: go round again
   }
  }catch(error){if(!disposed){console.error("rack rewire failed",error);onError(error);failed=true;}}
  finally{busy=false;if(!disposed&&!failed)patch(latest);}
 }
 try{
  const stages=stagesOf(values);
  if(!await ensure(stages))return null;
  wire(stages);
  patch(values,true);
  return {input,node:output,dynamicsBackend:ownedCompressor?'owned-rust':'native',armRuntime:()=>Promise.all([ownedCompressor,...Object.values(extra)].filter(s=>s?.arm).map(s=>s.arm())),patch,setInstances:next=>patch(latest,false,next),connect:destination=>output.connect(destination),clear(){pool.forEach(i=>i.clear());Object.values(extra).forEach(s=>s.clear?.());Object.values(split).forEach(b=>b.clear());effects?.clear();},get reduction(){return metering?(ownedCompressor?ownedCompressor.reduction:compressor.getNode().reduction):0;},get meters(){
   let peak=0;if(metering&&stagesOf(latest).some(s=>s.kind==='compressor')){detector.getFloatTimeDomainData(detectorSamples);for(const s of detectorSamples)peak=Math.max(peak,Math.abs(s));}
   return {compressorInputDb:20*Math.log10(Math.max(1e-5,peak)),limiterReduction:extra.limiter?.reduction??0,drivePeaks:Object.fromEntries(Object.entries(drives).filter(([id])=>instanceGraph?.chain.includes(id)).map(([id,s])=>[id,s.peak]))};
  },dispose};
 }catch(error){dispose();throw error;}
}
