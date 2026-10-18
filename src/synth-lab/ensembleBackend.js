import {createLabSource} from './labSources';
import {audioContext} from '../audio/context';
import {ensemblePlan,ensembleEvents,effectsLayout} from './ensemblePlan';
import {createRoutedEffects,createInstrumentEffects,connectEnsembleChannel} from './routedEffects';
import {measure} from './bench';
import {tailMetrics} from './effectsBench';
import {createInstrumentInserts} from './inserts';
import {insertsActive} from './insertsConfig';

async function instrumentOutput(context,node,part,owned,onError){
 if(!insertsActive(part.patch.inserts))return node;
 const insert=await createInstrumentInserts(context,part.patch.inserts,{onError});owned.push(insert);node.connect(insert.input);return insert.node;
}

const closeNode=source=>source.dispose();
const sourceNode=createLabSource;
const check=signal=>{if(signal?.aborted)throw Error('Render cancelled.');};

/** One multichannel render captures every stem together, preserving timing. */
export async function captureEnsemble(plan,{signal,onProgress=()=>{}}={}){
 const rate=plan.config.sampleRate,context=new OfflineAudioContext(plan.parts.length*2,Math.ceil(plan.sourceSeconds*rate),rate),nodes=[],splitters=[],inserts=[];
 const merger=context.createChannelMerger(plan.parts.length*2);merger.connect(context.destination);const started=performance.now();let failure;
 const abort=()=>{nodes.forEach(closeNode);inserts.forEach(n=>n.dispose());merger.disconnect();};signal?.addEventListener('abort',abort,{once:true});
 try{check(signal);
  for(const part of plan.parts){
   const source=await sourceNode(context,part,{offline:true,signal,onProgress,events:ensembleEvents(part,rate),onError:e=>{failure=e;}}),split=context.createChannelSplitter(2);nodes.push(source);splitters.push(split);check(signal);const output=await instrumentOutput(context,source.node,part,inserts,e=>{failure=e;});output.connect(split);split.connect(merger,0,part.id*2);split.connect(merger,1,part.id*2+1);
  }
  check(signal);const prepared=performance.now(),all=await context.startRendering(),finished=performance.now();check(signal);if(failure)throw failure;
  const stems=plan.parts.map(part=>{const buffer=context.createBuffer(2,all.length,rate);for(let ch=0;ch<2;ch++)buffer.copyToChannel(all.getChannelData(part.id*2+ch),ch);return buffer;});
  return {stems,instrumentInsertCount:inserts.length,prepareMs:prepared-started,renderMs:finished-prepared,pcmBytes:stems.reduce((s,b)=>s+b.length*b.numberOfChannels*4,0)};
 }finally{signal?.removeEventListener('abort',abort);nodes.forEach(closeNode);inserts.forEach(n=>n.dispose());splitters.forEach(n=>n.disconnect());merger.disconnect();}
}

async function effectsGraph(context,plan,path,{onStats=()=>{},onError=()=>{}}={}){
 const layout=effectsLayout(plan,path),buses=[],routes=[],master=context.createGain();master.gain.value=plan.config.master;
 try{
  for(let index=0;index<layout.count;index++){
   const bus=await createRoutedEffects(context,layout.settings(index),{kind:layout.kind,onStats:s=>onStats(index,s),onError});buses.push(bus);bus.connect(master);
  }
  if(path==='local')for(const part of plan.parts)routes.push(await createInstrumentEffects(context,buses[layout.assign(part)],part.voiceEffects));
  return {buses,master,layout,inputFor:part=>routes[part.id]??buses[layout.assign(part)],connect:d=>master.connect(d),memoryBytes:buses.reduce((sum,b)=>sum+b.memoryBytes,0),nativeDelayCount:path==='local'?routes.reduce((n,r)=>n+r.nativeDelayCount,0):buses.reduce((n,b)=>n+(b.nativeDelayCount??0),0),nativeDelayCompensationFrames:(routes.length?routes:buses).map(b=>b.nativeDelayCompensationFrames??0),dispose(){routes.forEach(r=>r.dispose());buses.forEach(b=>b.dispose());master.disconnect();}};
 }catch(e){routes.forEach(r=>r.dispose());buses.forEach(b=>b.dispose());master.disconnect();throw e;}
}

export async function renderEnsemble(plan,path,{capture=null,signal,onProgress=()=>{},audit=false}={}){
 const rate=plan.config.sampleRate,context=new OfflineAudioContext(2,Math.ceil(plan.seconds*rate),rate),nodes=[],channels=[],buffers=[],inserts=[],sourceStats={},started=performance.now();let graph,failure;
 const abort=()=>{nodes.forEach(closeNode);inserts.forEach(n=>n.dispose());graph?.dispose();};signal?.addEventListener('abort',abort,{once:true});
 try{check(signal);
  if(plan.config.scope==='stems'&&capture?.stems.length!==plan.parts.length)throw Error('Capture the identical stems before an effects-only comparison.');
  graph=await effectsGraph(context,plan,path,{onError:e=>{failure=e;}});graph.connect(context.destination);
  for(const part of plan.parts){
   let node;
   if(plan.config.scope==='stems'){node=context.createBufferSource();node.buffer=capture.stems[part.id];buffers.push(node);}
   else{const source=await sourceNode(context,part,{offline:true,signal,onProgress,auditStats:audit,onStats:s=>{sourceStats[part.id]=s;},stopFrame:Math.ceil(Math.min(plan.seconds,plan.sourceSeconds)*rate),events:ensembleEvents(part,rate),onError:e=>{failure=Error(`${part.name}: ${e.message}`);}});nodes.push(source);node=source.node;check(signal);}
   const output=plan.config.scope==='stems'?node:await instrumentOutput(context,node,part,inserts,e=>{failure=e;});channels.push(connectEnsembleChannel(context,output,graph.inputFor(part),part));if(plan.config.scope==='stems')node.start();
  }
  const retained=new Set();if(audit)for(const source of nodes)for(const b of source.buffers?.values()??[])retained.add(b);
  check(signal);const prepared=performance.now(),buffer=await context.startRendering(),finished=performance.now();check(signal);if(failure)throw failure;const metrics=measure(buffer);if(metrics.nonFinite)throw Error('Nonfinite ensemble output.');
  if(audit){for(let i=0;i<20&&nodes.some((source,id)=>!source.stats&&!sourceStats[plan.parts[id].id]?.final);i++)await new Promise(resolve=>setTimeout(resolve,10));for(const [id,source]of nodes.entries())if(source.stats)sourceStats[plan.parts[id].id]=source.stats();}
  return {path,buffer,prepareMs:prepared-started,renderMs:finished-prepared,seconds:plan.seconds,scoreSeconds:plan.cycleSeconds,sourceSeconds:plan.sourceSeconds,sampleRate:rate,metrics,tail:tailMetrics(buffer,plan.sourceSeconds),effectsBuses:path==='dry'?0:graph.buses.length,effectsWasmBytes:graph.memoryBytes,nativeDelayCount:graph.nativeDelayCount,nativeDelayCompensationFrames:graph.nativeDelayCompensationFrames,scope:plan.config.scope,instrumentInsertCount:plan.config.scope==='stems'?capture.instrumentInsertCount:inserts.length,insertsIncludedInCapture:plan.config.scope==='stems',...(audit?{sourceStats,preparedUniqueBytes:[...retained].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),sourceWasmBytes:Object.values(sourceStats).reduce((n,s)=>n+(s.memory??0),0),missingSourceStats:plan.parts.filter(p=>!sourceStats[p.id]).map(p=>p.id)}:{})};
 }finally{signal?.removeEventListener('abort',abort);channels.forEach(c=>c.dispose());buffers.forEach(b=>{b.disconnect();});nodes.forEach(closeNode);inserts.forEach(n=>n.dispose());graph?.dispose();}
}

/** Full synthesis runs live through the same graph, on the shared AudioContext. */
export async function playEnsemble(raw,path,{onStats=()=>{},onError=()=>{},signal,onProgress=()=>{},makePlan=ensemblePlan,destination=audioContext.destination}={}){
 const plan=makePlan({...raw,sampleRate:audioContext.sampleRate,rate:audioContext.sampleRate,scope:'full'}),backends=[],channels=[],inserts=[];let graph,timer,stopped=false;
 const stats={sources:{},effects:{},missedCycles:0,scheduledCycles:0};let failure,ready=false;
 const dispose=()=>{if(stopped)return;stopped=true;clearInterval(timer);backends.forEach(b=>b.panic());channels.forEach(c=>c.dispose());backends.forEach(b=>b.dispose());inserts.forEach(n=>n.dispose());graph?.dispose();};
 const fail=e=>{failure=e;onError(e);if(ready)dispose();};
 try{
  await audioContext.resume();graph=await effectsGraph(audioContext,plan,path,{onStats:(index,s)=>{stats.effects[index]=s;onStats(stats);},onError:fail});if(failure)throw failure;graph.connect(destination);
  for(const part of plan.parts){const backend=await createLabSource(audioContext,part,{signal,onProgress,onStats:s=>{stats.sources[part.id]=s;onStats(stats);},onError:fail});backends.push(backend);if(failure)throw failure;const output=await instrumentOutput(audioContext,backend.node,part,inserts,fail);channels.push(connectEnsembleChannel(audioContext,output,graph.inputFor(part),part));}
  check(signal);const start=audioContext.currentTime+.2;let cycle=0;
  const schedule=()=>{
   const now=audioContext.currentTime,next=start+cycle*plan.cycleSeconds;
   if(next<now-.1){const jump=Math.ceil((now+.2-start)/plan.cycleSeconds);stats.missedCycles+=jump-cycle;cycle=jump;}
   while(start+cycle*plan.cycleSeconds<now+plan.cycleSeconds){
    plan.parts.forEach((part,i)=>{backends[i].events(ensembleEvents(part,audioContext.sampleRate,{offset:start+cycle*plan.cycleSeconds,cycle}));for(const p of part.patches??[])backends[i].patch(p.patch,{time:start+cycle*plan.cycleSeconds+p.time,seconds:p.seconds});});
    cycle++;stats.scheduledCycles++;
   }
  };
  schedule();timer=setInterval(schedule,100);ready=true;
  return {plan,path,start,stats,instrumentInsertCount:inserts.length,context:audioContext,effectsBuses:path==='dry'?0:graph.buses.length,nativeDelayCount:graph.nativeDelayCount,effectsWasmBytes:graph.memoryBytes,nativeDelayCompensationFrames:graph.nativeDelayCompensationFrames,dispose,setLevel(id,value){channels[id]?.gain.setTargetAtTime(Math.max(0,Math.min(2,value)),audioContext.currentTime,.02);}};
 }catch(e){dispose();throw e;}
}
