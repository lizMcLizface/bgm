import{OwnedRoomConvolver}from'../src/modular-audio/ownedRoomConvolver.js';
import{OwnedRoomControlLive,loadRoomControlLiveAssets}from'../src/modular-audio/ownedRoomControlLive.js';
import{createContinuousPrivateRoom as createLiveRoomComplete}from'../src/modular-audio/roomContinuousNode.js';
import{roomContinuousSpec}from'../src/modular-audio/roomContinuousSpec.js';
import{loadRoomReservedControlAssets}from'../src/modular-audio/ownedRoomReservedControl.js';
import{loadOfflineRoomCompleteAssets}from'../src/modular-audio/ownedOfflineRoomComplete.js';
import{OwnedLiveRoomComplete}from'../src/modular-audio/ownedLiveRoomComplete.js';
import{liveRoomCompleteProgram}from'../src/modular-audio/liveRoomCompleteProgram.js';
import{roomConvolutionSpec,ROOM_STEREO_DOWNMIX}from'../src/modular-audio/ownedRoomConvolver.js';
import{ownedLongConvolverSpec}from'../src/modular-audio/ownedConvolver.js';
import{roomColourFramedSpec}from'../src/modular-audio/ownedRoomColourFramed.js';
import{roomCompleteMixSpec}from'../src/modular-audio/ownedRoomCompleteMix.js';
import{prepareNativeContextClock}from'../src/modular-audio/nativeContextClock.js';
import{liveRoomCompleteSourcePlan,liveRoomCompleteSourceInput}from'./liveRoomCompleteSource.js';
import{liveRoomCompare,liveRoomDelayed}from'./liveRoomCompleteCompare.js';
const base=()=>import.meta.env?.BASE_URL??'/',align=n=>Math.ceil(n/128)*128,assert=(v,m)=>{if(!v)throw Error(m);},sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
function bounded(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' timed out')),ms))]).finally(()=>clearTimeout(timer));}
export function lifecycleRoomProgram(assets,rate,channels,light){
 const room=roomConvolutionSpec(ownedLongConvolverSpec(rate,light?[.7,.1,-.03]:[[.7,.1,-.03],[.6,-.05,.02]],{inputChannels:light?1:channels}),roomColourFramedSpec(rate,{channels,events:[],activity:[{frame:0,inputChannels:channels,delayProcessing:'audio',filterProcessing:'audio'}]}),{colour:assets.colour.manifest,convolver:assets.convolver.manifest},{routing:light&&channels===2?ROOM_STEREO_DOWNMIX:'matching'});
 return roomContinuousSpec(room);
}
export function lifecycleRoomExpected(assets,program,input,epoch,events){
 const frames=input[0].length,room=new OwnedRoomConvolver(assets,program.room),rate=program.room.convolver.sampleRate,wetChannels=program.room.convolver.ir.length,sourceChannels=input.length,mix=new OwnedRoomControlLive(assets.control.module,{sampleRate:rate,sourceChannels,wetChannels}),output=Array.from({length:Math.max(sourceChannels,wetChannels)},()=>new Float32Array(frames+program.latencyFrames)),first=epoch+program.latencyFrames;
 try{
  mix.sync(0);mix.admitPair(.35,0,0);for(const e of events)mix.admitPair(e.amount,e.drySeconds,e.wetSeconds);
  for(let f=0;f<frames;f+=128){for(let c=0;c<sourceChannels;c++)room.input[c].set(input[c].subarray(f,f+128));room.render(128);mix.sync(first+f,{isolated:f===0});for(let c=0;c<sourceChannels;c++)mix.inputDry[c].set(input[c].subarray(f,f+128));for(let c=0;c<wetChannels;c++)mix.inputWet[c].set(room.output[c].subarray(0,128));mix.render();for(let c=0;c<output.length;c++)output[c].set(mix.output[c],program.latencyFrames+f);}return output;
 }finally{room.dispose();mix.dispose();}
}
async function captureKit(ctx){
 const r=await fetch(base()+'room-complete-live-review/build.json',{cache:'no-store'});assert(r.ok,'Continuous Room lifecycle capture manifest missing');const manifest=await r.json(),p=await fetch(base()+'room-complete-live-review/processor.js?v='+manifest.version,{cache:'no-store'});assert(p.ok&&await sha(await p.arrayBuffer())===manifest.processor,'Continuous Room lifecycle capture bytes differ');await ctx.audioWorklet.addModule(base()+'room-complete-live-review/processor.js?v='+manifest.version);return manifest;
}
function makeCapture(ctx,manifest,clock,epoch,frames,channels){
 const node=new AudioWorkletNode(ctx,manifest.processorName,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[channels],channelCount:channels,channelCountMode:'explicit',channelInterpretation:'discrete',processorOptions:{epoch,frames,channels}}),monitor=ctx.createGain();monitor.gain.value=0;node.connect(monitor);monitor.connect(ctx.destination);
 let resolve,reject,done=false;const captured=new Promise((a,b)=>{resolve=a;reject=b;});captured.catch(()=>{});node.port.onmessage=({data})=>{if(data.kind==='error')reject(Error(data.error));else if(data.kind==='captured'){done=true;resolve(data);}};node.onprocessorerror=()=>reject(Error('Continuous Room lifecycle capture failed'));const lease=clock.connect(node,{onError:e=>{if(!done)reject(e);}});
 return{node,captured,dispose:async()=>{node.disconnect();monitor.disconnect();node.port.postMessage({kind:'dispose'});node.port.close();await lease.release();}};
}
async function streamRound(ctx,assets,manifest,round,allOwners,progress){
 const channels=round===1?2:1,light=round!==1,program=lifecycleRoomProgram(assets,ctx.sampleRate,channels,light),captureFrames=Math.max(align(ctx.sampleRate*.4),6144)+align(ctx.sampleRate*.2)+512,input=liveRoomCompleteSourceInput(ctx.sampleRate,channels,captureFrames),owners=[],captures=[];let source,result,primary,frames=null;
 try{
  for(let i=0;i<2;i++){const p=await createLiveRoomComplete(ctx,program);p.commitAmount(await p.prepareAmount(.35));owners.push(p);allOwners.push(p);}
  const clock=await prepareNativeContextClock(ctx),plan=liveRoomCompleteSourcePlan(ctx.sampleRate,ctx.currentTime+.5,captureFrames,program.latencyFrames);captures.push(makeCapture(ctx,manifest,clock,plan.epoch,captureFrames,channels));for(const p of owners)captures.push(makeCapture(ctx,manifest,clock,plan.epoch,captureFrames+program.latencyFrames,p.geometry.outputChannels));
  source=ctx.createBufferSource();const buffer=ctx.createBuffer(channels,plan.sourceBufferFrames,ctx.sampleRate);for(let c=0;c<channels;c++){const p=new Float32Array(plan.sourceBufferFrames);p.set(input[c],plan.prefix);buffer.copyToChannel(p,c);}source.buffer=buffer;source.connect(captures[0].node);for(let i=0;i<2;i++){source.connect(owners[i].input);owners[i].output.connect(captures[i+1].node);}
  const first=plan.epoch+program.latencyFrames,rate=ctx.sampleRate,events=[{amount:.8,drySeconds:(first+13)/rate,wetSeconds:(first+41)/rate},{amount:.5,drySeconds:first/rate+.27,wetSeconds:first/rate+.27+1/rate}];const bookings=await Promise.all(owners.map(p=>Promise.all(events.map(e=>p.schedulePair(e.amount,e.drySeconds,e.wetSeconds)))));const starts=await Promise.all(owners.map(p=>p.start({startFrame:plan.epoch})));assert(ctx.currentTime<plan.sourceSeconds,'Continuous Room lifecycle source booking missed future start');source.start(plan.sourceSeconds);progress('Streaming open incoming Room round '+(round+1)+' before choosing its END');
  const inspectAt=(plan.epoch+Math.max(align(rate*.12),program.blockFrames*2))/rate;await new Promise(r=>setTimeout(r,Math.max(0,(inspectAt-ctx.currentTime)*1000)));const endSelectionSeconds=ctx.currentTime,open=await Promise.all(owners.map(p=>p.stats()));assert(open.every(s=>s.endFrame===null&&s.worker.frame>0&&s.transport.transport.sourceFrame>0&&!s.transport.transport.workerSealed),'The actual input stream was not open and advancing before final selection');
  frames=Math.max(align(rate*.4),program.blockFrames*3)+128+(round%2)*128;assert(frames<captureFrames&&open.every(s=>frames>s.transport.transport.sourceFrame+128),'Selected final boundary is no longer future');const endAdmissions=await Promise.all(owners.map(p=>p.endAt({sourceFrame:frames})));assert(endAdmissions.every(d=>d.sourceFrame>0&&d.sourceFrame<d.frame),'END was not admitted after actual capture advanced');
  const expected=lifecycleRoomExpected(assets,program,input.map(p=>p.slice(0,frames)),plan.epoch,events).map(p=>{const full=new Float32Array(captureFrames+program.latencyFrames);full.set(p);return full;});
  const data=await bounded(Promise.all([...captures.map(p=>p.captured),...owners.map(p=>p.completed)]),Math.ceil((plan.sourceSeconds-ctx.currentTime+(captureFrames+program.latencyFrames)/ctx.sampleRate+10)*1000),'Continuous Room lifecycle stream'),sourceComparison=liveRoomCompare(data[0].channels,input,{exact:true}),comparisons=[1,2].map(i=>liveRoomCompare(data[i].channels,expected,{exact:true})),independence=liveRoomCompare(data[1].channels,data[2].channels,{exact:true}),states=await Promise.all(owners.map(p=>p.stats()));
  result={round,channels,light,program:program.profile,frames:frames,captureFrames,openEndSelection:{seconds:endSelectionSeconds,sourceEpoch:plan.epoch,elapsedSourceSeconds:endSelectionSeconds-plan.epoch/rate,openStates:open,selectedFrame:frames,receiptSourceFrontiers:endAdmissions.map(d=>d.sourceFrame)},latencyFrames:program.latencyFrames,plan,starts,endAdmissions,events,bookings,clockGeneration:clock.spec.generation,sourceComparison,comparisons,independence,states,completions:data.slice(3),checksPassed:sourceComparison.checksPassed&&comparisons.every(p=>p.checksPassed)&&independence.checksPassed&&states.every(p=>p.transport.transport.drained&&!p.transport.transport.underrunFrames&&!p.transport.transport.rejectedPackets&&p.worker.frame===frames),nativePcmAssessed:false,scope:'Actual worker/delivery PCM against separately prepared identical Rust program plus exact independent input/outputs; original Native parity is the separate24-case suite.'};
  return result;
 }catch(e){primary=e;e.diagnostics={round,context:{rate:ctx.sampleRate,state:ctx.state,time:ctx.currentTime},owners:owners.map(o=>({identity:o.identity,error:o.error,failure:o.failureDiagnostics??null}))};throw e;}
 finally{const issues=[];try{source?.disconnect();}catch(e){issues.push(e);}const releases=await Promise.allSettled(owners.map(p=>p.dispose()));issues.push(...releases.filter(p=>p.status==='rejected').map(p=>p.reason));for(const p of captures)try{await p.dispose();}catch(e){issues.push(e);}if(result)result.cleanup={releases:releases.map(p=>p.status==='fulfilled'?p.value:String(p.reason)),allReleased:owners.every(p=>p.released&&p.output===null),contextState:ctx.state};if(issues.length){if(primary)primary.cleanupErrors=issues.map(String);else throw new AggregateError(issues,'Continuous Room lifecycle round cleanup failed');}}
}
export async function runRoomContinuousLifecycle({rate=48000,progress=()=>{}}={}){
 const report={kind:'room.continuous-input-reused-retirement-quota',version:1,rate,muted:true,nativePcmAssessed:false,rounds:[],complete:false,checksPassed:false,scope:'Three actual same-context generations; actual incoming audio, no initial finite source budget. Two independent streams per round, zero-DSP offroute probes, real third-owner quota refusal and terminal live suspend/reprepare. Future output-time pairs are separate from source-local colour; no GUI IR swapping or live suspension freeze.'},allOwners=[];let ctx,primary;
 try{
  const assets=await loadOfflineRoomCompleteAssets();assets.control=await loadRoomReservedControlAssets();ctx=new AudioContext({sampleRate:rate});assert(ctx.sampleRate===rate,'Lifecycle rate unavailable');await bounded(ctx.resume(),10000,'Continuous Room lifecycle AudioContext resume');const capture=await captureKit(ctx);report.capture=capture;
  for(let i=0;i<3;i++){
   const row=await streamRound(ctx,assets,capture,i,allOwners,progress);report.rounds.push(row);if(!row.checksPassed)return report;
   if(i<2){
    const program=lifecycleRoomProgram(assets,rate,1,true),probes=[];for(let j=0;j<2;j++){const p=await createLiveRoomComplete(ctx,program);probes.push(p);allOwners.push(p);}const before=await Promise.all(probes.map(p=>p.stats()));let quotaRefusal=null;
    try{const p=await createLiveRoomComplete(ctx,program);allOwners.push(p);}catch(e){quotaRefusal=String(e);}
    assert(quotaRefusal?.includes('quota'),'Actual third Room quota refusal missing');assert(before.every(s=>s.worker.frame===0&&s.transport.core.unit.audioFrames===0&&s.transport.core.unit.parameterFrames===0&&s.transport.transport.sourceFrame===0),'Offroute probe advanced numerical DSP');
    await probes[1].dispose();progress('Retiring live Room generation '+before[0].clock.spec.generation);await bounded(ctx.suspend(),10000,'Continuous Room lifecycle suspend');await probes[0].dispose();let refused=null;try{await probes[0].start();}catch(e){refused=String(e);}
    row.retirement={quotaRefusal,before,state:ctx.state,errors:probes.map(p=>p.error),released:probes.map(p=>p.released),nodeReleased:probes.map(p=>p.output===null),staleStartRefused:refused};
    assert(ctx.state==='suspended'&&probes.every(p=>p.released&&p.output===null)&&probes[0].error&&refused,'Retired Room owner retained authority');await bounded(ctx.resume(),10000,'Continuous Room lifecycle reprepare resume');
   }
  }
  assert(new Set(report.rounds.map(p=>p.clockGeneration)).size===3,'Continuous Room lifecycle reused a retired Native clock generation');report.complete=report.checksPassed=true;
 }catch(e){primary=e;report.error=String(e);report.stack=e.stack;report.diagnostics=e.diagnostics;report.cleanupErrors=e.cleanupErrors;}
 finally{
  const release=await Promise.allSettled(allOwners.map(p=>p.dispose()));report.cleanup={owners:allOwners.length,releases:release.map(p=>p.status==='fulfilled'?p.value:String(p.reason)),allReleased:allOwners.every(p=>p.released&&p.output===null),ownerDiagnostics:allOwners.map(p=>({identity:p.identity,error:p.error,cleanupError:p.cleanupError??null,cleanupFailures:p.cleanupFailures??null,failure:p.failureDiagnostics??null,released:p.released}))};
  if(ctx)try{await ctx.close();}catch(e){report.contextCleanupError=String(e);report.checksPassed=false;}
  report.cleanup.afterCloseAllReleased=allOwners.every(p=>p.released&&p.output===null);if(release.some(p=>p.status==='rejected')||!report.cleanup.afterCloseAllReleased){report.checksPassed=false;report.error??='Lifecycle aggregate release failed';}
 }
 return report;
}
if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);$('run').onclick=async()=>{$('run').disabled=true;try{const r=await runRoomContinuousLifecycle({rate:Number($('rate').value),progress:t=>$('status').textContent=t});$('report').value=JSON.stringify(r,null,2);$('summary').textContent=JSON.stringify({checksPassed:r.checksPassed,complete:r.complete,rounds:r.rounds.length,generations:r.rounds.map(p=>p.clockGeneration),error:r.error,cleanup:r.cleanup},null,2);$('status').textContent=r.checksPassed?'Checks passed':'Stopped at first failure';}catch(e){const failure={complete:false,checksPassed:false,error:String(e),stack:e.stack};$('report').value=JSON.stringify(failure,null,2);$('summary').textContent=JSON.stringify(failure,null,2);$('status').textContent=String(e);}finally{$('run').disabled=false;}};
}
