import {sourcePlan,sourceConfig} from './sourcePlan';
import {captureEnsemble,renderEnsemble} from './ensembleBackend';
import {defaultInserts} from './insertsConfig';
import {noteCacheStats} from '../app/engine/noteBufferCache';
export async function renderSources(config,{signal,onProgress=()=>{}}={}){
 const plan=sourcePlan(config),dry=structuredClone(plan),rows=[];for(const part of dry.parts)part.patch.inserts=defaultInserts();
 for(const [id,name,original,path]of [['dry','Dry source',dry,'dry'],['inserts','Instrument inserts',plan,'dry'],['space','Inserts, echoes & rooms',plan,'local']]){
  if(signal?.aborted)throw Error('Render cancelled.');onProgress('Rendering '+name+'…');const r=await renderEnsemble(original,path,{signal,onProgress});rows.push({id,name,channels:[r.buffer.getChannelData(0).slice(),r.buffer.getChannelData(1).slice()],prepareMs:r.prepareMs,renderMs:r.renderMs,metrics:r.metrics,effectsBuses:r.effectsBuses,nativeDelayCount:r.nativeDelayCount,instrumentInsertCount:r.instrumentInsertCount});
 }
 return {fixture:{config:sourceConfig(config),kind:'mixed',patches:plan.parts.map(p=>p.patch),parts:plan.parts,bars:plan.config.bars,bpm:plan.config.bpm,seconds:plan.seconds,scoreSeconds:.05+plan.cycleSeconds,sourceSeconds:plan.sourceSeconds,cache:noteCacheStats()},rows,benchmark:false};
}
/** Used by routing regression checks; capture includes inserts exactly once. */
export async function compareSourceCapture(config){const plan=sourcePlan(config),capture=await captureEnsemble(plan),full=await renderEnsemble(plan,'dry');plan.config.scope='stems';const captured=await renderEnsemble(plan,'dry',{capture});let maxDifference=0;for(let ch=0;ch<2;ch++){const a=full.buffer.getChannelData(ch),b=captured.buffer.getChannelData(ch);for(let i=0;i<a.length;i++)maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));}return {maxDifference,parts:plan.parts.map(p=>p.kind),full:full.metrics,captured:captured.metrics};}
