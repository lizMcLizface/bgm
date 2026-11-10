import React,{useState} from 'react';
import {packetProducerSnapshot} from './workerDeliveryTiming';

export function compactPreviewDiagnostics(r){
 const o=r.stats?.output,w=r.stats?.worker,g=w?.graph??o?.serial?.graph,q=o?.queue,e=r.executor;
 const pick=(value,keys)=>value?Object.fromEntries(keys.map(key=>[key,value[key]??null])):null;
 const text=(value,max)=>typeof value==='string'?value.slice(0,max):null;
 return {kind:'all.source-preview.diagnostics',version:2,runId:text(r.runId,128),hostRevision:text(r.hostRevision,80),sourceFingerprint:text(r.sourceFingerprint,64),engineVersion:r.engineVersion??null,startedAtUtc:r.startedAtUtc??null,browserUserAgent:text(r.browserUserAgent,320),sampleRate:r.sampleRate??null,role:r.role??null,reason:r.reason??null,error:text(r.error??r.stats?.error,400),complete:!!r.complete,pass:!!r.pass,listening:'not assessed',executor:pick(e,['requested','actual','scheduling','blockFrames','poolBlocks','bufferingLatencyMs','stopOnUnderrun','deliveryDiagnostics']),fallbackReason:text(e?.fallbackReason,200),frames:{planned:r.plan?.endFrame??null,consumed:o?.sourceFrame??null,output:o?.outputFrame??null,rendered:g?.frame??null},events:pick(g,['applied','late','overflow']),delivery:pick(q,['underrunFrames','underrunQuanta','recoveries','lateBlocks','rejectedBlocks','staleGeneration','acceptedBlocks']),lead:pick(q?.lead?.steady,['minFrames','zeroLeadQuanta','belowQuantumQuanta','firstZeroSourceFrame']),arrival:pick(q?.arrivals?.steady,['maxGapFrames','maxConsumedSinceArrivalFrames','overCapacityQuanta']),worker:pick(w,['blocks','renderMs','maxRenderMs','badRecycles']),timingScope:'Last packet: producer at send; worker/producerLater: queried later. No synchronized clocks.',lastPacket:q?.lastPacket?{...pick(q.lastPacket,['packetFrame','frames','sourceFrameAtArrival']),producer:packetProducerSnapshot(q.lastPacket.producer)}:null,producerLater:pick(w?.deliveryTiming,['available','taskWaitMaxMs','poolWaitMaxMs','recycleRttMaxMs','lastRecycleConsumerFrame','readyTaskAgeMs','poolEmptyAgeMs']),outputProcess:pick(o?.processTiming,['available','calls','maxMs','overQuantumPeriod'])};
}

export function previewDeliverySummary(report){
 const e=report.executor,o=report.stats?.output,g=report.stats?.worker?.graph??o?.serial?.graph,q=o?.queue;
 const known=value=>value??'unavailable';
 return `Actual executor: ${e?.actual??'not started'}; requested: ${e?.requested??report.mode}. Buffering: ${known(e?.bufferingLatencyMs)} ms. Source frames: ${known(o?.sourceFrame)} / ${known(report.plan?.endFrame)}. Events: ${known(g?.applied)} / ${known(report.plan?.graph?.events?.length)}. ${q?`Missing PCM: ${known(q.underrunFrames)} frames; late packets: ${known(q.lateBlocks)}.`:'PCM worker transport: not used or unavailable.'} Completed: ${report.complete?'yes':'no'}. Signal/delivery checks: ${report.pass?'passed':'not passed'}. Listening: not assessed.`;
}

export default function WorkbenchPreviewReport({report}){
 const [copyStatus,setCopyStatus]=useState(''),[manual,setManual]=useState(null),[copying,setCopying]=useState(false),text=JSON.stringify(report,null,2),compact=JSON.stringify(compactPreviewDiagnostics(report),null,2);
 const copy=async(value,label)=>{setCopying(true);try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(value);setCopyStatus(label+' copied.');setManual(null);}catch{setCopyStatus('Automatic copy is unavailable. Select and copy the diagnostics below.');setManual(value);}finally{setCopying(false);}};
 return <div>
  <p aria-label="Rust preview run identity">Run {report.runId??'unidentified historical run'} · {report.startedAtUtc} · {report.hostRevision??'historical host'} · engine {report.engineVersion??'unavailable'}</p>
  <p role="status" aria-label="Rust preview delivery summary">{previewDeliverySummary(report)}</p>
  <div className="row"><button type="button" disabled={copying} onClick={()=>copy(compact,'Compact diagnostics')}>Copy compact diagnostics</button><button type="button" disabled={copying} onClick={()=>copy(text,'Full report')}>Copy full report</button></div>
  <p role="status" aria-label="Rust preview copy status">{copyStatus}</p>
  {manual!==null&&<textarea aria-label="Copy Rust run diagnostics" readOnly rows={8} value={manual} onFocus={e=>e.target.select()} style={{width:'100%'}}/>}
  <details><summary>Compact diagnostics text</summary><textarea aria-label="Compact Rust diagnostics text" readOnly rows={8} value={compact} onFocus={e=>e.target.select()} style={{width:'100%'}}/></details>
  <details><summary>Full run report</summary><pre aria-label="Rust source preview report" style={{maxHeight:220,overflow:'auto',fontSize:11}}>{text}</pre></details>
 </div>;
}
