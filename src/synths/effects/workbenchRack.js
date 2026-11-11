import {createRack} from './graph';
import {BUS_IDS,busInstances,busRack,MIX_CHANNELS} from './parallelModel';
import {createDeskLimiter,createMixerAudio} from '../all/mixerAudio';

const safeDisconnect=(from,to)=>{try{from.disconnect(to);}catch{/* graph already disposed */}};
const peak=(node,buffer)=>{node.getFloatTimeDomainData(buffer);let p=0;for(const v of buffer)p=Math.max(p,Math.abs(v));return p;};
function stereoMeter(context,source){
 const split=context.createChannelSplitter(2),analysers=[0,1].map(ch=>{const a=context.createAnalyser();a.fftSize=1024;split.connect(a,ch);return a;}),samples=analysers.map(()=>new Float32Array(1024));source.connect(split);let closed=false;
 return {read(){if(closed)return {left:0,right:0,peak:0};const left=peak(analysers[0],samples[0]),right=peak(analysers[1],samples[1]);return {left,right,peak:Math.max(left,right)};},dispose(){if(closed)return;closed=true;safeDisconnect(source,split);split.disconnect();analysers.forEach(a=>a.disconnect());}};
}
function mixerMeters(context,mixer,masterNode){
 const channels=Object.fromEntries(MIX_CHANNELS.map(c=>[c.role,stereoMeter(context,mixer.channels[c.role].output)])),master=stereoMeter(context,masterNode);let closed=false;
 return {read(){if(closed)return {};const m=master.read();return {...Object.fromEntries(MIX_CHANNELS.map(c=>[c.role,channels[c.role].read().peak])),left:m.left,right:m.right};},dispose(){if(closed)return;closed=true;Object.values(channels).forEach(t=>t.dispose());master.dispose();}};
}
export async function createParallelRack(context,raw,parallel,{onError=()=>{},dynamicsFactory}={}){
 const results=await Promise.allSettled([...BUS_IDS.map(id=>createRack(context,busRack(parallel.buses[id]),{onError,dynamicsFactory,instances:busInstances(parallel.buses[id])})),createDeskLimiter(context)]);
 if(results.some(r=>r.status==='rejected')){await Promise.allSettled(results.map(async(r,i)=>{if(r.status==='fulfilled'){if(i<3)await r.value.dispose();else{r.value.port.postMessage({dispose:true});r.value.disconnect();}}}));throw results.find(r=>r.status==='rejected').reason;}
 const racks=Object.fromEntries(BUS_IDS.map((id,i)=>[id,results[i].value])),limiter=results[3].value;
 const nodes=[],gain=()=>{const n=context.createGain();n.channelCount=2;n.channelCountMode='explicit';nodes.push(n);return n;};
 const utilityLevel=gain(),insert={input:racks.master.input,connect:to=>{racks.master.connect(utilityLevel);utilityLevel.connect(to);}};
 const mixer=createMixerAudio(context,MIX_CHANNELS.map(c=>c.role),limiter,{auxiliary:false,trimRoles:true,masterInsert:insert});
 const input=gain(),output=mixer.output;
 const busPeaks=Object.fromEntries(BUS_IDS.map(id=>[id,stereoMeter(context,racks[id].node)]));
 input.connect(mixer.channels.dry.input);
 for(const id of ['drive','wet']){input.connect(racks[id].input);racks[id].connect(mixer.channels[id].input);}
 for(const c of MIX_CHANNELS)mixer.channels[c.role].output.connect(mixer.input);
 let disposed=false,disposal;const taps=new Set();
 const patch=(values,initial,instances,p)=>{
  if(disposed||!p)return;
  for(const id of BUS_IDS)racks[id].patch(busRack(p.buses[id]),initial,busInstances(p.buses[id]));
  mixer.patch(p.mixer);
  const set=(param,v)=>{if(initial)param.setValueAtTime(v,context.currentTime);else{param.cancelScheduledValues(context.currentTime);param.setTargetAtTime(v,context.currentTime,.012);}};
  // The saved serial rack's bypass/mix/trim are not part of this topology.
  // Only the visible output-module level is shared between the two setups.
  set(utilityLevel.gain,10**(values['master.output']/20));
 };
 function dispose(){if(disposed)return disposal;disposed=true;taps.forEach(t=>t.dispose());taps.clear();Object.values(busPeaks).forEach(t=>t.dispose());nodes.forEach(n=>n.disconnect());mixer.dispose();const closing=BUS_IDS.map(id=>racks[id].dispose());if(closing.some(p=>p&&typeof p.then==='function'))return disposal=Promise.all(closing);}
 try{patch(raw,true,null,parallel);}catch(error){await dispose();throw error;}
 return {input,node:output,connect:to=>output.connect(to),armRuntime:()=>Promise.all(BUS_IDS.map(id=>racks[id].armRuntime?.())),patch,applyDesk:state=>mixer.patch(state),openMeters(masterNode=output){const m=mixerMeters(context,mixer,masterNode);taps.add(m);return {read:m.read,dispose(){m.dispose();taps.delete(m);}};},
  clear:()=>BUS_IDS.forEach(id=>racks[id].clear()),get reduction(){return racks.master.reduction;},get meters(){return {busMeters:Object.fromEntries(BUS_IDS.map(id=>[id,{...racks[id].meters,reduction:racks[id].reduction,peak:busPeaks[id].read().peak}]))};},
  dispose,
 };
}

// Keep the source/monitor connections stable while a complete replacement graph
// loads. Parameter/chain edits within a mode are handled by its existing racks.
export async function createWorkbenchRack(context,values,{instances=null,parallel=null,onError=()=>{},dynamicsFactory}={}){
 const input=context.createGain(),output=context.createGain();let latest={values,instances,parallel},disposed=false,busy=false,current,retiring,disposal,replacement;const closing=new Set();
 const build=state=>state.parallel?createParallelRack(context,state.values,state.parallel,{onError,dynamicsFactory}):createRack(context,state.values,{instances:state.instances,onError,dynamicsFactory});
 const attach=(graph,type,initial=false)=>{const fade=context.createGain();fade.gain.value=initial?1:0;input.connect(graph.input);graph.connect(fade);fade.connect(output);return {graph,type,fade};};
 const drop=entry=>{if(!entry)return;safeDisconnect(input,entry.graph.input);entry.fade.disconnect();const pending=entry.graph.dispose();if(pending&&typeof pending.then==='function'){closing.add(pending);pending.then(()=>closing.delete(pending),error=>{closing.delete(pending);onError(error);});}};
 const apply=entry=>entry.graph.patch(latest.values,false,latest.instances,latest.parallel);
 try{current=attach(await build(latest),!!parallel,true);}catch(e){input.disconnect();output.disconnect();throw e;}
 async function replace(){
  busy=true;
  try{for(;;){
   const state=latest,type=!!state.parallel,graph=await build(state);
   if(disposed){await graph.dispose();return;}
   if(type!==!!latest.parallel){await graph.dispose();continue;}
   const next=attach(graph,type);try{apply(next);}catch(error){drop(next);throw error;}retiring=current;current=next;
   retiring.fade.gain.cancelScheduledValues(context.currentTime);retiring.fade.gain.setTargetAtTime(0,context.currentTime,.008);next.fade.gain.setTargetAtTime(1,context.currentTime,.008);
   await new Promise(resolve=>setTimeout(resolve,60));if(disposed)return;drop(retiring);retiring=null;
   if(current.type===!!latest.parallel)break;
  }}catch(error){if(!disposed)onError(error);}finally{busy=false;}
 }
 return {input,node:output,connect:to=>output.connect(to),armRuntime:async()=>{await replacement;if(disposed)throw Error('Workbench rack is disposed');return Promise.all([current,retiring].filter(Boolean).map(e=>e.graph.armRuntime?.()));},patch(raw,initial=false,nextInstances=latest.instances,nextParallel=latest.parallel){
  if(disposed)return;latest={values:raw,instances:nextInstances,parallel:nextParallel};
  if(current.type===!!nextParallel)apply(current);else if(!busy)replacement=replace();
 },applyDesk(state){if(disposed)return;if(latest.parallel)latest={...latest,parallel:{...latest.parallel,mixer:state}};current.graph.applyDesk?.(state);},
 openMeters(masterNode=output){let entry,tap,closed=false;return {read(){if(closed||disposed)return {};if(entry!==current){tap?.dispose();entry=current;tap=current.graph.openMeters?.(masterNode);}return tap?.read()??{};},dispose(){if(closed)return;closed=true;tap?.dispose();}};},
 clear(){current.graph.clear();retiring?.graph.clear();},setInstances:next=>{latest={...latest,instances:next};if(!current.type)current.graph.setInstances(next);},
 get reduction(){return current.graph.reduction;},get meters(){return current.graph.meters;},
 dispose(){if(disposed)return disposal;disposed=true;drop(current);drop(retiring);retiring=null;input.disconnect();output.disconnect();if(replacement||closing.size)return disposal=Promise.resolve(replacement).then(()=>Promise.all(closing));},
 };
}
