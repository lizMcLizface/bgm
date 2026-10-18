import {stressPlan,stressConfig} from './stressPlan';
import {renderEnsemble} from './ensembleBackend';
import {clearNoteCache,noteCacheStats} from '../app/engine/noteBufferCache';
import {insertsMemoryBytes} from './inserts';
export const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;};
export function stressSummary(runs){
 const measured=runs.filter(r=>!r.warmup),renderMs=median(measured.map(r=>r.renderMs)),prepareMs=median(measured.map(r=>r.prepareMs));
 const counter=key=>Math.max(0,...measured.map(r=>Object.values(r.sourceStats).reduce((sum,s)=>sum+(s[key]??0),0)));
 return {runs:measured.length,renderMs,prepareMs,audioPerRender:renderMs>0?measured[0].seconds*1000/renderMs:null,worstRenderMs:Math.max(0,...measured.map(r=>r.renderMs)),peak:Math.max(0,...measured.map(r=>r.metrics.peak)),nonFinite:measured.reduce((n,r)=>n+r.metrics.nonFinite,0),silent:measured.some(r=>r.metrics.rms<1e-8),clipped:measured.some(r=>r.metrics.fullScale>0),late:counter('late'),dropped:counter('dropped'),steals:counter('steals'),missingStats:measured.some(r=>r.missingSourceStats.length>0)};
}
export async function runStressCase(spec,{signal,repeats=3,warmup=true,clearCache=true,onProgress=()=>{},onSample=()=>{},timeoutMs=90000,render=renderEnsemble}={}){
 repeats=[1,3].includes(Number(repeats))?Number(repeats):3;const config=stressConfig(spec.config??spec),plan=stressPlan(config),runs=[];
 if(clearCache)clearNoteCache();const cacheBefore=noteCacheStats();
 const check=()=>{if(signal?.aborted)throw Error('Matrix cancelled.');};
 for(let i=0;i<repeats+(warmup?1:0);i++){
  check();const token=new AbortController(),forward=()=>token.abort(),timeout=setTimeout(()=>token.abort(),timeoutMs);signal?.addEventListener('abort',forward,{once:true});
  try{onProgress(`${spec.name??'Custom'} · ${warmup&&i===0?'warm-up':`measured ${i+(warmup?0:1)}/${repeats}`}`);const r=await render(plan,config.routing,{audit:true,signal:token.signal,onProgress:()=>{}});check();if(token.signal.aborted)throw Error('Case time limit reached.');const {buffer,...data}=r;const sample={...data,tail:plan.stress.tailTruncated?{available:false,reason:'Fixed window does not cover the conservative full tail.'}:data.tail,warmup:warmup&&i===0,insertsWasmBytes:r.instrumentInsertCount?await insertsMemoryBytes()*r.instrumentInsertCount:0};runs.push(sample);onSample(sample);}
  catch(e){if(signal?.aborted)throw Error('Matrix cancelled.');if(token.signal.aborted)throw Error(`Case exceeded ${timeoutMs/1000} s wall-time limit.`);throw e;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',forward);}
 }
 return {id:spec.id??'custom',name:spec.name??'Custom',config,protocol:{repeats,warmup,clearCache,timeoutMs},fixture:{version:2,cycleSeconds:plan.cycleSeconds,effects:plan.effects,parts:plan.parts},manifest:plan.stress,voices:plan.voices,sourceKinds:plan.parts.map(p=>({id:p.id,kind:p.kind,family:p.family})),runs,summary:stressSummary(runs),cacheBefore,cacheAfter:noteCacheStats(),window:{seconds:plan.seconds,sourceSeconds:plan.sourceSeconds,fullTailSeconds:plan.stress.fullSeconds,truncated:plan.stress.tailTruncated},limits:'Offline wall throughput, not live CPU/underruns. peakActive is sampled per callback. Wasm linear memory and unique retained prepared-note PCM exclude native-kit noise buffers, browser nodes, cached overlapping PCM, GPU and process memory.'};
}
export async function runStressMatrix(cases,options={}){
 if(cases.length>32)throw Error('At most 32 cases per matrix.');const rows=[];
 for(const spec of cases){if(options.signal?.aborted)throw Error('Matrix cancelled.');let row;
  try{row={status:'complete',...await runStressCase(spec,options)};}
  catch(e){if(options.signal?.aborted)throw e;row={id:spec.id??'custom',name:spec.name??'Custom',status:'failed',error:e.message,config:stressConfig(spec.config??spec)};}
  rows.push(row);options.onCase?.(row,rows.length,cases.length);
 }
 return rows;
}
