import {summarizeCpuProfile} from './dspProfileSummary.mjs';

// Trace chunks are emitted by a profiler helper thread. Their tid is NOT the
// sampled thread: join them to the Profile event by process/profile identity.
export function traceCpuProfiles(trace){
 const events=trace.traceEvents??trace,threads=new Map(),profiles=new Map();
 const key=e=>`${e.pid}:${e.id??JSON.stringify(e.id2)}`;
 for(const e of events){
  if(e.name==='thread_name')threads.set(`${e.pid}:${e.tid}`,e.args?.name??'Unknown');
  if(e.name==='Profile')profiles.set(key(e),{pid:e.pid,tid:e.tid,id:e.id??e.id2,startTime:e.args?.data?.startTime??e.ts,nodes:new Map(),samples:[],timeDeltas:[]});
 }
 let orphanChunks=0;
 for(const e of events){
  if(e.name!=='ProfileChunk')continue;
  const p=profiles.get(key(e));if(!p){orphanChunks++;continue;}
  const d=e.args?.data??{},cpu=d.cpuProfile??{};
  for(const n of cpu.nodes??[])p.nodes.set(n.id,{...p.nodes.get(n.id),...n});
  p.samples.push(...(cpu.samples??[]));p.timeDeltas.push(...(d.timeDeltas??[]));
 }
 return {orphanChunks,profiles:[...profiles.values()].map(p=>{
  if(p.samples.length!==p.timeDeltas.length)throw Error('Incomplete trace CPU sample times.');
  const nodes=[...p.nodes.values()].map(n=>({...n,children:[...(n.children??[])]})),byId=new Map(nodes.map(n=>[n.id,n]));
  for(const n of nodes)if(n.parent!==undefined){const parent=byId.get(n.parent);if(parent&&!parent.children.includes(n.id))parent.children.push(n.id);}
  const profile={nodes,samples:p.samples,timeDeltas:p.timeDeltas,startTime:p.startTime,endTime:p.startTime+p.timeDeltas.reduce((a,b)=>a+b,0)};
  const kinds={};for(let i=0;i<p.samples.length;i++){const kind=byId.get(p.samples[i])?.callFrame.codeType??'unknown';kinds[kind]=(kinds[kind]??0)+p.timeDeltas[i]/1000;}
  return {pid:p.pid,tid:p.tid,id:p.id,thread:threads.get(`${p.pid}:${p.tid}`)??'Unknown',kinds,profile,summary:summarizeCpuProfile(profile)};
 })};
}

export function summarizeWorkletTrace(trace){
 const parsed=traceCpuProfiles(trace),worklets=parsed.profiles.filter(p=>/AudioWorklet/i.test(p.thread));
 const events=trace.traceEvents??trace;
 return {...parsed,worklets,wasmEvents:events.filter(e=>e.ph==='X'&&/^wasm\./.test(e.name)).reduce((rows,e)=>{
  const row=rows[e.name]??={count:0,wallMs:0,cpuMs:0};row.count++;row.wallMs+=(e.dur??0)/1000;row.cpuMs+=(e.tdur??0)/1000;return rows;
 },{}),limits:'Sampled CPU attribution with tracing overhead, including graph preparation and rendering. Worklet ownership comes from Profile events, never chunk emitter tids. Inlined DSP may be charged to its caller; inclusive rows overlap. V8 program/other samples do not resolve native DSP or idle time. Offline threads are not realtime deadline/underrun measurements.'};
}
