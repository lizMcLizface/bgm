import React, {useMemo,useRef,useState} from 'react';
import {allRuntimeStatus} from './runtimeBackend';
import {comparisonUrl,createComparison,initializeComparisonStorage,saveComparisonRun,writeComparison,fingerprint,snapshotDifferences} from './comparisonSession';
import {createEventLedger,measurePhase,summarizeComparison,processMetrics} from './comparisonMetrics';

const mb=bytes=>Number.isFinite(bytes)?(bytes/1048576).toFixed(1)+' MiB':'Unavailable';
const fixed=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):'Unavailable';
export function workloadState(host, recipe, desk) {
    return {settings:host.g.settings,book:host.book,soundState:host.snapshotSounds(),mixer:host.mixerSnapshot(),
        desk:desk??recipe.desk,bpm:recipe.bpm,mutes:recipe.mutes,solos:recipe.solos,tuning:recipe.tuning,project:recipe.project};
}
async function conditions(context) {
    const [{PERFORMANCE},{perfEnabled},{masterBus},{tuning}]=await Promise.all([import('../../audio/performance'),import('../../audio/perfMode'),import('../../audio/bus'),import('../tuning')]);
    return {sampleRate:context.sampleRate,baseLatencySeconds:context.baseLatency,quality:{...PERFORMANCE,perf:perfEnabled()},
        bufferSetting:localStorage.getItem('bgm-audio-buffer'),globalGain:masterBus.gain.value,tuning:tuning.get(),
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent,logicalProcessors:navigator.hardwareConcurrency};
}
export default function BackendComparison({session,host,runtime,backend,ready,busy,capture,onPrepare,play,stop,leave,observer,readDesk}) {
    const [data,setData]=useState(session),[seconds,setSeconds]=useState(30),[message,setMessage]=useState(''),[running,setRunning]=useState(false);
    const abort=useRef(null),input=useRef(null);
    const summary=useMemo(()=>data?summarizeComparison(data):null,[data]),complete=data?.runs.length===4,finishedTrial=data&&data.runs.length>session.runs.length;
    const reportText=useMemo(()=>data?JSON.stringify({...data,recipe:undefined,conveniences:undefined,summary},null,2):'',[data,summary]);
    const wrongBackend=data&&!complete&&backend!==data.plan.order[data.runs.length];
    async function freeze() {
        try {
            const recipe=capture(); if(recipe.pendingGenerator)throw Error('Apply or clear the queued generator change before freezing a comparison.');
            if(recipe.ambience?.run)throw Error('Stop ambience before freezing. Random ambient playback is outside this matched music comparison.');
            await host.wake(); await host.awaitDeskState?.();
            const conveniences={};for(let i=0;i<localStorage.length;i++){const name=localStorage.key(i);if(name.startsWith('synths:'))conveniences[name]=localStorage.getItem(name);}
            const next=await createComparison({recipe,conditions:await conditions(host.context),returnUrl:location.href,conveniences,seconds});
            await leave(comparisonUrl(next));
        }catch(error){setMessage(error.message);}
    }
    async function run() {
        if(running||!ready||complete||finishedTrial)return;
        const index=data.runs.length,issues=[];
        const token={aborted:false};abort.current=token;setRunning(true);setMessage('Preparing the frozen workload…');
        let meter,record;
        try {
            if(backend!==data.plan.order[index])throw Error('Wrong backend for this trial; use Next trial to reload.');
            if(await fingerprint(data.recipe)!==data.recipeHash)throw Error('Frozen comparison snapshot changed');
            await host.wake();await host.awaitDeskState?.();
            const startConditions=await conditions(host.context);
            if(JSON.stringify(startConditions)!==JSON.stringify(data.conditions))issues.push('Conditions differ from the frozen workbench');
            const actual=workloadState(host,data.recipe,readDesk());
            const expected={settings:data.recipe.settings,book:data.recipe.book,soundState:data.recipe.soundState,mixer:data.recipe.mixer,desk:data.recipe.desk,bpm:data.recipe.bpm,mutes:data.recipe.mutes,solos:data.recipe.solos,tuning:data.recipe.tuning,project:data.recipe.project};
            const actualHash=await fingerprint(actual),expectedHash=await fingerprint(expected),restorationDifferences=snapshotDifferences(expected,actual);
            if(actualHash!==expectedHash)issues.push('Restored graph differs from the frozen snapshot');
            meter=host.openMeters();
            const check=()=>{runtime?.environment?.checkRuntime?.();for(const r of Object.values(host.g.roles)){if(r.instrument?.error)throw Error(String(r.instrument.error));}};
            const phase=async(label,duration)=>measurePhase({host,seconds:duration,signal:meter,check,abort:token,onProgress:elapsed=>setMessage(`${label}: ${Math.floor(elapsed)} / ${duration} s`)});
            const idle=await phase('Idle',data.plan.idleSeconds);
            observer.current=createEventLedger(host.context.sampleRate,data.plan.warmupSeconds+data.plan.measureSeconds);
            await play('song');
            const warmup=await phase('Playing warm-up',data.plan.warmupSeconds);
            const sequence=await phase('Measuring the captured song',data.plan.measureSeconds);
            if(!observer.current.origin)throw Error('Normal All scheduler did not start');
            const events=await observer.current.snapshot();
            if(await fingerprint(workloadState(host,data.recipe,readDesk()))!==actualHash)issues.push('Workload changed during trial');
            if(JSON.stringify(await conditions(host.context))!==JSON.stringify(startConditions))issues.push('Conditions changed during trial');
            issues.push(...idle.issues,...warmup.issues,...sequence.issues);
            record={index,backend,actualHash,expectedHash,restorationDifferences,conditions:startConditions,runtime:allRuntimeStatus(runtime,host),idle,warmup,sequence,events,issues,
                liveInputLeadSeconds:backend==='rust'?.128:0,liveInputScope:'Configured Core/FM live-input lead; not a measured end-to-end latency. Sequence input uses the same All scheduler.'};
        }catch(error){record={index,backend,error:error.message,issues};}
        finally {stop();observer.current=null;meter?.dispose();abort.current=null;setRunning(false);}
        try {const next=saveComparisonRun(data,record);setData(next);setMessage(record.error?`Trial failed: ${record.error}`:next.runs.length===4?'Comparison complete. Download the results or return to your saved workbench.':'Trial saved. Reload for the next backend.');}catch(error){setMessage(error.message);}
    }
    async function next() {try {initializeComparisonStorage(data);await leave(comparisonUrl(data));}catch(error){setMessage(error.message);}}
    async function importProcesses(event) {
        try {
            const files=Array.from(event.target.files??[]),reports=[];
            for(const file of files){if(file.size>16*1024*1024)throw Error('Process report exceeds 16 MiB');const report=JSON.parse(await file.text());
                if(report.version!==1||report.kind!=='all-comparison-process-samples'||typeof report.scope!=='string'||!Array.isArray(report.processIds)||!Array.isArray(report.samples)||report.samples.some(s=>!Number.isFinite(Date.parse(s.startUtc))||!Number.isFinite(Date.parse(s.endUtc))||!Number.isFinite(s.cpuCorePercent)||!Number.isFinite(s.privateBytes)||!Array.isArray(s.missing)))throw Error('Unsupported process sample file');reports.push(report);}
            const next={...data,processReports:reports};writeComparison(next);setData(next);setMessage('Scoped process samples imported.');
        }catch(error){setMessage(error.message);}finally{event.target.value='';}
    }
    function download() {
        const report={...data,conveniences:undefined,summary:summarizeComparison(data),
            measuredProcesses:data.runs.map(run=>({trial:run.index+1,backend:run.backend,idle:run.idle?processMetrics(data.processReports,run.idle):null,sequence:run.sequence?processMetrics(data.processReports,run.sequence):null}))};
        const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`all-backend-comparison-${data.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if(!session)return <details className="backend-comparison"><summary>Compare backends</summary>
        <p>Freeze this captured song, sounds and effects. Run Current → Rust → Rust → Current in fresh documents, with the same latency and quality. Your saved workbench is preserved. Ambience must be stopped.</p>
        <label>Measured song interval <select aria-label="Comparison duration" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}><option value={10}>10 seconds · quick check</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></label>
        <button disabled={!ready||busy} onClick={freeze}>Freeze workbench and compare</button><p role="status">{message}</p>
    </details>;
    return <section className="backend-comparison" aria-label="Backend comparison">
        <h2>Same-song backend comparison</h2>
        <p>{data.recipe.scene} · {data.conditions.sampleRate} Hz · {(data.conditions.baseLatencySeconds*1000).toFixed(1)} ms base latency · {data.plan.warmupSeconds} s playing warm-up + {data.plan.measureSeconds} s measured song per trial. Edits are locked; saves are isolated.</p>
        {!complete&&<p>Trial {data.runs.length+1}/4: <strong>{data.plan.order[data.runs.length]==='rust'?'Rust integrated':'Current'}</strong>. Each trial starts the captured song at its beginning.</p>}
        {!ready&&backend==='rust'&&!wrongBackend&&<button disabled={busy} onClick={onPrepare}>Prepare Rust audio</button>}
        {!complete&&<button disabled={!ready||busy||running||finishedTrial||wrongBackend} onClick={run}>Run comparison trial</button>}
        {running&&<button onClick={()=>{abort.current.aborted=true;stop();}}>Stop comparison</button>}
        {(finishedTrial||wrongBackend)&&!complete&&<button disabled={running||busy} onClick={next}>Next trial · reload backend</button>}
        <button disabled={running} onClick={download}>Download comparison</button>
        <button disabled={running||busy} onClick={()=>leave(data.returnUrl).catch(e=>setMessage(e.message))}>Return to saved workbench</button>
        <p role="status" aria-label="Comparison progress">{message}</p>
        <table><caption>Actual device deadlines and browser JS heap</caption><thead><tr><th>Trial</th><th>Backend</th><th>Notes/hits</th><th>Underruns</th><th>Fallback</th><th>JS heap after</th><th>Status</th></tr></thead><tbody>
            {data.runs.map(run=><tr key={run.index}><td>{run.index+1}</td><td>{run.backend}</td><td>{run.events?.count??'Unavailable'}</td><td>{run.sequence?.underrunEvents??'Unavailable'}</td><td>{fixed(run.sequence?.underrunPercent)}%</td><td>{mb(run.sequence?.memoryAfter?.usedBytes)}</td><td>{run.error??(run.issues.length?'Review conditions':'Recorded')}</td></tr>)}
        </tbody></table>
        <p>{complete?(summary.comparable?'Matched inputs and conditions verified. Review the measurements below.':'Comparison needs review: '+summary.reasons.join('; ')):'Complete all four trials before drawing a conclusion.'}</p>
        <p>JS heap snapshots can include retained contexts and garbage awaiting collection; they cannot rank total audio memory. CPU/private-memory conclusions require confirmed process scope and coverage below.</p>
        <details inert={running?'':undefined}><summary>CPU and total process memory</summary><p>Browser JS heap excludes Native audio memory. For scoped CPU/private bytes, run tools/measureAllComparison.ps1 with the renderer process ID, then import its JSON. CPU is reported per logical core; missing or overlapping samples prevent a CPU conclusion.</p>
            <input ref={input} type="file" multiple accept="application/json,.json" aria-label="Import process measurements" onChange={importProcesses}/>
            <table><thead><tr><th>Trial</th><th>CPU median / p95 (one core)</th><th>Private bytes median</th><th>Scope</th></tr></thead><tbody>{data.runs.map(run=>{const m=run.sequence&&processMetrics(data.processReports,run.sequence);return <tr key={run.index}><td>{run.index+1}</td><td>{m?.valid?`${fixed(m.coreEquivalentPercent?.p50)}% / ${fixed(m.coreEquivalentPercent?.p95)}%`:'Not measured'}</td><td>{m?.valid?mb(m.privateBytes?.p50):'Not attributable'}</td><td>{m?!m.scopeConfirmed?'CPU scope unconfirmed':!m.valid?'Invalid process coverage':m.scope.join('; '):'Not measured'}</td></tr>;})}</tbody></table>
        </details>
        <details inert={running?'':undefined}><summary>Comparison evidence and limitations</summary><p>{summary.scope}</p><p>Timer delays measure main-thread responsiveness, not DSP CPU. Short samples do not certify glitch-free playback. Random generator extension and ambience are excluded; the captured song loops unchanged. Configured Core/FM live lead remains 128 ms for Rust. Output device latency is reported separately.</p><pre aria-label="Backend comparison report">{reportText}</pre></details>
    </section>;
}
