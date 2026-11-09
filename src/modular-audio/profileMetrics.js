import {BUFFER_PROFILES,profileDetails} from './bufferProfiles.js';
import {summarizeQueueLead} from './queueLeadSummary.js';
function distribution(values){if(!values.length)return null;const a=values.slice().sort((x,y)=>x-y),at=q=>a[Math.min(a.length-1,Math.ceil(a.length*q)-1)];return {count:a.length,p50:at(.5),p95:at(.95),max:a[a.length-1]};}
export function histogramBounds(bins){const count=bins.reduce((a,b)=>a+b,0);if(!count)return {count:0,p50UpperBoundMs:null,p95UpperBoundMs:null,p99UpperBoundMs:null};const bound=q=>{let total=0;for(let i=0;i<bins.length;i++){total+=bins[i];if(total>=Math.ceil(count*q))return 2**i/1000;}return null;};return {count,p50UpperBoundMs:bound(.5),p95UpperBoundMs:bound(.95),p99UpperBoundMs:bound(.99)};}
export function assessDelivery(stats,end,expectedEvents){
  const output=stats?.output,engines=(stats?.workers??(stats?.worker?[stats.worker]:output?.serial?[output.serial]:[])).filter(Boolean),graphs=engines.map(e=>e.graph),master=output?.master?.graph;
  const sourceComplete=engines.length>0&&graphs.every(g=>g?.frame===end),masterComplete=!master||master.frame===end;
  const applied=graphs.reduce((n,g)=>n+(g?.applied??0),0)+(master?.applied??0),roles=engines.flatMap(e=>e.roles??[]).filter(Boolean);
  const eventPass=applied===expectedEvents&&graphs.every(g=>g&&!g.late&&!g.overflow)&&(!master||!master.late&&!master.overflow)&&roles.every(s=>!s.late&&!s.dropped);
  return {complete:output?.sourceFrame===end&&sourceComplete&&masterComplete,appliedEvents:applied,eventPass};
}
export function summarizeProfiles(rows,rate){
  return BUFFER_PROFILES.map(p=>{
    const runs=rows.filter(r=>r.profile===p.id&&r.phase==='measured'),actual=runs.filter(r=>r.executor?.actual==='pool'&&r.rate===rate);
    const workers=[0,1,2].map(group=>{const stats=actual.map(r=>r.stats?.workers?.[group]).filter(Boolean),bins=Array(32).fill(0);for(const s of stats)for(let i=0;i<32;i++)bins[i]+=s.blockMsHistogramLog2Us[i];return {group,renderAndCopyTotalMs:distribution(stats.map(s=>s.renderMs)),maxBlockMs:stats.length?Math.max(...stats.map(s=>s.maxRenderMs)):null,...histogramBounds(bins)};});
    const timers=actual.map(r=>r.stats?.output?.processTiming).filter(t=>t?.available),timingBins=Array(32).fill(0);for(const t of timers)for(let i=0;i<32;i++)timingBins[i]+=t.histogramLog2Us[i];
    const queueLead=summarizeQueueLead(actual.map(r=>r.stats?.output?.queue?.lead),rate),groupLead=[0,1,2].map(group=>summarizeQueueLead(actual.map(r=>r.stats?.output?.queue?.groups?.[group]?.lead),rate));
    return {profile:p.id,...profileDetails(p.id,rate),measuredRuns:runs.length,actualPoolRuns:actual.length,passedRuns:actual.filter(r=>r.pass).length,starvingRuns:runs.filter(r=>(r.stats?.output?.queue?.underrunFrames??0)>0).length,incompleteRuns:runs.filter(r=>!r.delivery?.complete).length,missingFrames:runs.reduce((n,r)=>n+(r.stats?.output?.queue?.underrunFrames??0),0),expiredBlocks:runs.reduce((n,r)=>n+(r.stats?.output?.queue?.groups??[]).reduce((s,g)=>s+g.lateBlocks,0),0),prepareMs:distribution(runs.map(r=>r.prepareMs).filter(Number.isFinite)),wasmCapacityBytes:distribution(actual.map(r=>(r.stats?.workers??[]).reduce((n,w)=>n+w.memoryBytes,0)+(r.stats?.output?.master?.memoryBytes??0))),workers,queueLead,groupLead,processTiming:{availableRuns:timers.length,unavailableRuns:actual.length-timers.length,maxMs:timers.length?Math.max(...timers.map(t=>t.maxMs)):null,overQuantumPeriod:timers.length?timers.reduce((n,t)=>n+t.overQuantumPeriod,0):null,...histogramBounds(timingBins)}};
  });
}
