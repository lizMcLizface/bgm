import {compileWorkbenchSource,hashWorkbenchPlan} from './workbenchPlan';
import {loadGraphAssets} from './graphAssets';
import {createWorkerRoute} from './workerBrowser';
import {newListeningId} from './listeningRecord';
export function createWorkbenchPreview({host,project,part,role,bpm,muted=false,mode='serial',workerPoolBlocks=6,silentProbe=false,onState=()=>{},onDone=()=>{},loadAssets=loadGraphAssets,makeRoute=createWorkerRoute}){
 let closed=false,finishing=null,route=null,lease=null,gain=null,timer=null,assets=null,plan=null,probe=null,sourceHash=Promise.resolve(null),armed=false;const taps=[],peaks={source:0,channel:0,master:0},context=host.context,runId=newListeningId(),startedAtUtc=new Date().toISOString(),browserUserAgent=globalThis.navigator?.userAgent??null;
 function cleanup(){clearInterval(timer);route?.dispose();gain?.disconnect();for(const tap of taps){try{tap.from.disconnect(tap.node);}catch{}tap.node.disconnect();}lease?.release();}
 async function finish(reason='stopped',error=null){
  if(finishing)return finishing;if(closed)return null;closed=true;onState('stopping');clearInterval(timer);if(gain)gain.gain.setTargetAtTime(0,context.currentTime,.005);
  finishing=(async()=>{let stats=null;try{if(gain&&reason!=='completed')await new Promise(resolve=>setTimeout(resolve,30));if(route)stats=await route.stats();}catch(e){error??=String(e);}finally{cleanup();}
   const output=stats?.output,engine=stats?.worker?.graph??output?.serial?.graph??output?.serial,complete=!!plan&&output?.sourceFrame===plan.endFrame&&engine?.frame===plan.endFrame,eventPass=!!plan&&engine?.applied===plan.graph.events.length&&!engine?.late&&!engine?.overflow;
   const report={version:1,kind:'all.owned-source-preview',hostRevision:'all-preview-delivery-v5',diagnosticProbe:probe?{...probe,complete:reason==='probe-completed'&&output?.sourceFrame===probe.targetFrames}:null,sourceFingerprint:await sourceHash,runId,browserUserAgent,sampleRate:context.sampleRate,scope:'One selected finite source snapshot through existing All FX/mixer; peaks may include legacy keyboard/shared output, not isolated wet PCM or physical audio. Listening is not assessed by these checks.',role,mode,startedAtUtc,completedAtUtc:new Date().toISOString(),reason,error:error??stats?.error??null,engineVersion:assets?.manifest.version??null,executor:route?.executor??null,plan,peaks:{...peaks},stats,complete,eventPass,pass:reason==='completed'&&!error&&!stats?.error&&complete&&eventPass&&!(output?.queue?.underrunFrames)&&Object.values(peaks).every(p=>p>0)};
   onState('stopped');onDone(report);return report;
  })();return finishing;
 }
 const ready=(async()=>{await Promise.resolve();try{
  if(context.sampleRate!==48000)throw Error('Rust source preview requires an existing 48 kHz AudioContext.');
  if(![6,8,12].includes(workerPoolBlocks))throw Error('Rust source preview worker capacity must be six, eight or twelve blocks.');
  if(typeof silentProbe!=='boolean'||silentProbe&&mode!=='worker')throw Error('Silent delivery probe requires the worker executor.');
  lease=host.openSourceStem(role,()=>{void finish('host-closed');});plan=compileWorkbenchSource({project,part,role,bpm,source:lease,tune:lease.tune,muted});
  if(silentProbe)probe={muted:true,targetFrames:Math.min(plan.endFrame,96000)};
  sourceHash=hashWorkbenchPlan(plan);
  assets=await loadAssets();if(closed)return null;lease.assertCurrent();
  route=await makeRoute(context,assets,plan.graph,{mode,options:{blockFrames:512,poolBlocks:mode==='worker'?workerPoolBlocks:6,scheduling:'message'},sourceIds:[1],endFrame:probe?.targetFrames??plan.endFrame,startPaused:true,stopOnUnderrun:!silentProbe,deliveryDiagnostics:true,onFinished:d=>{if(armed)void finish(d?.reason==='delivery-gap'?'delivery-gap':d?.reason==='failed'?'error':silentProbe?'probe-completed':'completed',d?.reason==='delivery-gap'?'One-worker delivery missed audio frames. Use Serial reference; the preview has stopped.':null);}});
  if(closed){route.dispose();return null;}lease.assertCurrent();route.check();
  if(silentProbe&&route.executor.actual!=='worker')throw Error('Silent delivery probe needs an actual worker, not a startup fallback.');
  gain=context.createGain();gain.gain.value=silentProbe?0:1;route.node.connect(gain,0);gain.connect(lease.input);
  for(const [name,from]of [['source',gain],['channel',lease.channelOutput],['master',lease.masterOutput]]){const node=context.createAnalyser();node.fftSize=2048;from.connect(node);taps.push({name,from,node,data:new Float32Array(2048)});}
  const observe=()=>{for(const t of taps){t.node.getFloatTimeDomainData(t.data);for(const v of t.data)peaks[t.name]=Math.max(peaks[t.name],Math.abs(v));}try{lease.assertCurrent();}catch(e){void finish('source-changed',String(e));return;}try{route.check();}catch(e){void finish('error',String(e));}};
  timer=setInterval(observe,100);armed=true;route.start();onState('playing');return route.executor;
 }catch(e){await finish('error',String(e));throw e;}})();
 return {ready,stop:()=>finish('stopped'),get closed(){return closed;}};
}
