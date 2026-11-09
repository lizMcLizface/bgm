import {compileWorkbenchSource} from './workbenchPlan';
import {loadGraphAssets} from './graphAssets';
import {createWorkerRoute} from './workerBrowser';
export function createWorkbenchPreview({host,project,part,role,bpm,muted=false,mode='worker',onState=()=>{},onDone=()=>{},loadAssets=loadGraphAssets,makeRoute=createWorkerRoute}){
 let closed=false,finishing=null,route=null,lease=null,gain=null,timer=null,assets=null,plan=null,armed=false;const taps=[],peaks={source:0,channel:0,master:0},context=host.context,startedAtUtc=new Date().toISOString();
 function cleanup(){clearInterval(timer);route?.dispose();gain?.disconnect();for(const tap of taps){try{tap.from.disconnect(tap.node);}catch{}tap.node.disconnect();}lease?.release();}
 async function finish(reason='stopped',error=null){
  if(finishing)return finishing;if(closed)return null;closed=true;onState('stopping');clearInterval(timer);if(gain)gain.gain.setTargetAtTime(0,context.currentTime,.005);
  finishing=(async()=>{let stats=null;try{if(gain&&reason!=='completed')await new Promise(resolve=>setTimeout(resolve,30));if(route)stats=await route.stats();}catch(e){error??=String(e);}finally{cleanup();}
   const output=stats?.output,engine=stats?.worker?.graph??output?.serial?.graph??output?.serial,complete=!!plan&&output?.sourceFrame===plan.endFrame&&engine?.frame===plan.endFrame,eventPass=!!plan&&engine?.applied===plan.graph.events.length&&!engine?.late&&!engine?.overflow;
   const report={version:1,kind:'all.owned-source-preview',scope:'One selected finite source snapshot through existing All FX/mixer; peaks may include legacy keyboard/shared output, not isolated wet PCM or physical audio.',role,mode,startedAtUtc,completedAtUtc:new Date().toISOString(),reason,error:error??stats?.error??null,engineVersion:assets?.manifest.version??null,executor:route?.executor??null,plan,peaks:{...peaks},stats,complete,eventPass,pass:reason==='completed'&&!error&&!stats?.error&&complete&&eventPass&&!(output?.queue?.underrunFrames)&&Object.values(peaks).every(p=>p>0)};
   onState('stopped');onDone(report);return report;
  })();return finishing;
 }
 const ready=(async()=>{await Promise.resolve();try{
  if(context.sampleRate!==48000)throw Error('Rust source preview requires an existing 48 kHz AudioContext.');
  lease=host.openSourceStem(role,()=>{void finish('host-closed');});plan=compileWorkbenchSource({project,part,role,bpm,source:lease,tune:lease.tune,muted});
  assets=await loadAssets();if(closed)return null;lease.assertCurrent();
  route=await makeRoute(context,assets,plan.graph,{mode,options:{blockFrames:512,poolBlocks:6,scheduling:'message'},sourceIds:[1],endFrame:plan.endFrame,startPaused:true,onFinished:()=>{if(armed)void finish('completed');}});
  if(closed){route.dispose();return null;}lease.assertCurrent();route.check();
  gain=context.createGain();gain.gain.value=1;route.node.connect(gain,0);gain.connect(lease.input);
  for(const [name,from]of [['source',gain],['channel',lease.channelOutput],['master',lease.masterOutput]]){const node=context.createAnalyser();node.fftSize=2048;from.connect(node);taps.push({name,from,node,data:new Float32Array(2048)});}
  const observe=()=>{for(const t of taps){t.node.getFloatTimeDomainData(t.data);for(const v of t.data)peaks[t.name]=Math.max(peaks[t.name],Math.abs(v));}try{lease.assertCurrent();route.check();}catch(e){void finish('source-changed',String(e));}};
  timer=setInterval(observe,100);armed=true;route.start();onState('playing');return route.executor;
 }catch(e){await finish('error',String(e));throw e;}})();
 return {ready,stop:()=>finish('stopped'),get closed(){return closed;}};
}
