import {createInstrumentInserts} from '../../synth-lab/inserts';
import {createEffectsBus} from '../../synth-lab/effects';
import Compressor from '../../nodes/compressor';
import {rackPackets} from './params';
import {orderFromCode,chainUnits,stagesFor} from './order';
import {EXTRA_KINDS,createExtraStage} from './extras';

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
export async function createRack(context,values,{onError=()=>{}}={}){
 const pool=[]; // inserts kernel instances, created as the order needs them
 const extra={}; // added units' stages, created when first put in the chain
 const split={}; // the reverb and the delay on a bus each, made when the reverb is put before the delay
 let effects,metering=false,wired='',latest=values,busy=false,disposed=false,failed=false;
 const nodes=[],gain=()=>{const n=context.createGain();nodes.push(n);return n;};
 const input=gain(),trim=gain(),processed=gain(),bypass=gain(),output=gain();
 const compIn=gain(),clean=gain(),compressed=gain(),compOut=gain();
 const compressor=new Compressor(context);nodes.push(compressor.getNode());
 let links=[];
 const link=(from,to)=>{from.connect(to);links.push([from,to]);};
 const unlink=()=>{for(const [from,to] of links){try{from.disconnect(to);}catch{/* already gone */}}links=[];};
 const dispose=()=>{disposed=true;pool.forEach(i=>i.dispose());Object.values(extra).forEach(s=>s.dispose());Object.values(split).forEach(b=>b.dispose());effects?.dispose();nodes.forEach(n=>n.disconnect());};
 // the inserts packet for one run of effects: the effects outside the run are zeroed, the output trim belongs to the last run
 const runPacket=(inserts,units,last)=>{
  const p={...inserts};
  if(!units.includes('saturation'))p.saturation=0;
  if(!units.includes('eq'))p.lowGain=p.midGain=p.highGain=0;
  for(const k of ['phaser','flanger','chorus'])if(!units.includes(k))p[k]=0;
  if(!last)p.gain=0;
  return p;
 };
 const stagesOf=raw=>{const {master}=rackPackets(raw);return stagesFor(orderFromCode(master.order),chainUnits(master.chain),master.reverbFirst>=.5);};
 const signature=stages=>stages.map(s=>s.kind==='inserts'?'i:'+s.units.join('+'):s.kind).join('|');
 const patch=(raw,initial=false)=>{
  latest=raw;
  const {inserts:i,effects:e,compressor:c,master:m,extras:x}=rackPackets(raw);
  metering=!!(m.enabled&&c.enabled);
  const stages=stagesOf(raw),runs=stages.filter(s=>s.kind==='inserts');
  pool.forEach((inst,k)=>{const run=runs[k];inst.patch(run?runPacket(i,run.units,k===runs.length-1):{...i,saturation:0,lowGain:0,midGain:0,highGain:0,phaser:0,flanger:0,chorus:0,gain:0});});
  for(const [kind,stage] of Object.entries(extra))stage.patch(x[kind],initial);
  effects.patch(e);
  // the two halves of the space unit when the reverb comes first: the reverb keeps the dry level, the delay passes what it is given
  split.reverb?.patch({...e,delay:0,delayToReverb:0});split.delay?.patch({...e,reverb:0,dry:1});
  const set=(param,v)=>initial?param.setValueAtTime(v,context.currentTime):param.setTargetAtTime(v,context.currentTime,.012);
  set(trim.gain,10**(m.input/20));set(processed.gain,m.enabled&&!busy?m.mix*10**(m.output/20):0);set(bypass.gain,m.enabled?(1-m.mix)*10**((m.input+m.output)/20):1);
  // the compressor's mix blends the compressed signal with the dry one (parallel compression)
  set(clean.gain,c.enabled?1-c.mix:1);set(compressed.gain,c.enabled?c.mix*10**(c.makeup/20):0);
  for(const key of ['threshold','ratio','knee','attack','release'])set(compressor.getNode()[key],c[key]);
  if(!initial&&!busy&&signature(stages)!==wired)rewire();
 };
 // creates what a set of stages needs: inserts instances and added-unit stages (some load asynchronously)
 const ensure=async stages=>{
  const runs=stages.filter(s=>s.kind==='inserts');
  while(pool.length<runs.length){const inst=await createInstrumentInserts(context,rackPackets(latest).inserts,{onError});if(disposed){inst.dispose();return false;}pool.push(inst);}
  for(const stage of stages)if((stage.kind==='reverb'||stage.kind==='delay')&&!split[stage.kind]){const bus=await createEffectsBus(context,rackPackets(latest).effects,{onError});if(disposed){bus.dispose();return false;}split[stage.kind]=bus;}
  for(const stage of stages)if(EXTRA_KINDS.includes(stage.kind)&&!extra[stage.kind]){const made=await createExtraStage(context,stage.kind);if(disposed){made.dispose();return false;}extra[stage.kind]=made;made.patch(rackPackets(latest).extras[stage.kind],true);}
  return true;
 };
 // trim -> stages in order -> processed
 const wire=stages=>{
  unlink();
  link(compIn,clean);link(compIn,compressor.getNode());compressor.connect(compressed);link(clean,compOut);link(compressed,compOut);
  link(input,trim);link(processed,output);link(input,bypass);link(bypass,output);
  let from=trim,k=0;
  for(const stage of stages){
   let into,out;
   if(stage.kind==='inserts'){const inst=pool[k++];into=inst.input;out=inst.node;}
   else if(stage.kind==='compressor'){into=compIn;out=compOut;}
   else if(stage.kind==='space'){into=effects.input;out=effects.node;}
   else if(stage.kind==='reverb'||stage.kind==='delay'){into=split[stage.kind].input;out=split[stage.kind].node;}
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
  }catch(error){console.error("rack rewire failed",error);onError(error);failed=true;}
  finally{busy=false;if(!disposed&&!failed)patch(latest);}
 }
 try{
  const p=rackPackets(values);
  effects=await createEffectsBus(context,p.effects,{onError});
  const stages=stagesOf(values);
  if(!await ensure(stages))return null;
  wire(stages);
  patch(values,true);
  return {input,node:output,patch,connect:destination=>output.connect(destination),clear(){pool.forEach(i=>i.clear());Object.values(extra).forEach(s=>s.clear?.());Object.values(split).forEach(b=>b.clear());effects.clear();},get reduction(){return metering?compressor.getNode().reduction:0;},dispose};
 }catch(error){dispose();throw error;}
}
