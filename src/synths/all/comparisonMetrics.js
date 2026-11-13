import { playbackSnapshot, playbackDifference } from './playbackDiagnostics';
import { fingerprint } from './comparisonSession';

export function distribution(values) {
    const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!sorted.length) return null;
    const at = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
    return { count: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) };
}
export function browserMemory(perf = performance) {
    const m = perf.memory;
    return m ? { scope: 'browser-reported JS heap; excludes Native audio and is not total process memory', usedBytes: m.usedJSHeapSize, totalBytes: m.totalJSHeapSize, limitBytes: m.jsHeapSizeLimit } : null;
}
// Observe the SAME normal All scheduler. Hash intended sample positions and
// payloads, not absolute context epochs, main-thread receipt times or UI frames.
export function createEventLedger(rate, seconds) {
    let origin = null;
    const events = [], late = [], roles = {};
    return { step(info) { if (origin === null) origin = info.time; },
        events(batch, now) {
            for (const e of batch) {
                if (origin === null || e.time >= origin + seconds) continue;
                const { time, ...payload } = e;
                events.push({ frame: Math.round((time-origin)*rate), ...payload });
                const leadMs = (time-now)*1000; late.push(leadMs); roles[e.track] = (roles[e.track] ?? 0)+1;
            }
        },
        get origin() { return origin; },
        async snapshot() { return { hash: await fingerprint(events), count: events.length, roles,
            lateEvents: late.filter(x => x<0).length, minimumLeadMs: late.length ? Math.min(...late) : null }; },
    };
}
export async function measurePhase({ host, seconds, signal, check, onProgress = () => {}, abort, now = () => performance.now() }) {
    const context = host.context, before = playbackSnapshot(context), started = now(), startedUtc = new Date().toISOString();
    const initialContext = context.currentTime, memoryBefore = browserMemory();
    const gaps = [], meterMax = {}, issues = new Set(); let last = started;
    const state = () => issues.add('AudioContext state changed');
    const visibility = () => { if (document.visibilityState !== 'visible') issues.add('Document was hidden'); };
    context.addEventListener?.('statechange', state); document.addEventListener('visibilitychange', visibility); visibility();
    try {
        while (context.currentTime-initialContext < seconds) {
            if (abort?.aborted) throw Error('Comparison stopped');
            if (now()-started > (seconds*3+10)*1000) throw Error('Audio clock did not complete the fixed measurement interval');
            if (context.state !== 'running') throw Error('AudioContext stopped during comparison');
            check(); const t=now(); if (last!==started) gaps.push(Math.max(0,t-last-250)); last=t;
            const levels=signal?.read() ?? {}; for(const [id,value] of Object.entries(levels)) meterMax[id]=Math.max(meterMax[id]??0,value);
            onProgress(Math.min(seconds,context.currentTime-initialContext));
            await new Promise(resolve=>setTimeout(resolve,250));
        }
        const after=playbackSnapshot(context);
        return { seconds, startedUtc, endedUtc: new Date().toISOString(), elapsedWallMs: now()-started,
            elapsedContextSeconds: context.currentTime-initialContext, before, after, ...playbackDifference(before,after),
            mainThreadTimerDelayMs: distribution(gaps), meterMax, memoryBefore, memoryAfter: browserMemory(), issues: [...issues],
            cpu: null, cpuScope: 'Not exposed by browser API. Import the optional scoped OS process sample for CPU/private memory.' };
    } finally { context.removeEventListener?.('statechange',state); document.removeEventListener('visibilitychange',visibility); }
}

export function summarizeComparison(data) {
    const runs=data.runs, reasons=[];
    if(runs.length!==data.plan.order.length) reasons.push('All four trials are required');
    const first=runs[0];
    for(const [index,run] of runs.entries()) {
        if(run.backend!==data.plan.order[index])reasons.push('Backend order differs from the comparison plan');
        if(run.error)reasons.push(run.error);
        reasons.push(...(run.issues??[]));
        if(first && run.actualHash!==first.actualHash)reasons.push('Restored sounds/effects/settings differ');
        if(first && run.events?.hash!==first.events?.hash)reasons.push('Scheduled note/hit workload differs');
        if(first && JSON.stringify(run.conditions)!==JSON.stringify(first.conditions))reasons.push('Sample rate, buffer, quality or viewport differs');
        if(!run.sequence?.observed)reasons.push('Output deadline counters unavailable or inconclusive');
        if(run.events?.lateEvents)reasons.push('Scheduler submitted late events');
        if(!Object.values(run.sequence?.meterMax??{}).some(v=>v>0))reasons.push('No nonzero output meter observation');
    }
    return { complete:runs.length===4, comparable:runs.length===4&&!reasons.length, reasons:[...new Set(reasons)],
        backends:Object.fromEntries(['current','rust'].map(backend=>[backend,{runs:runs.filter(r=>r.backend===backend).map(r=>r.index+1),
            underrunSeconds:runs.filter(r=>r.backend===backend).reduce((sum,r)=>sum+(r.sequence?.underrunSeconds??0),0),
            underrunEvents:runs.filter(r=>r.backend===backend).reduce((sum,r)=>sum+(r.sequence?.underrunEvents??0),0)}])),
        scope:'Matched fixed captured song through the actual All graph and normal scheduler/UI. No sound-quality, multicore or CPU-speedup claim follows from zero underruns. Live-input scheduling policy remains backend-specific.' };
}

export function processMetrics(reports, phase) {
    const rows=reports.flatMap(report=>report.samples.map(row=>({...row,scope:report.scope,scopeConfirmed:report.scopeConfirmed===true,ids:report.processIds})))
        .filter(row=>Date.parse(row.startUtc)>=Date.parse(phase.startedUtc)&&Date.parse(row.endUtc)<=Date.parse(phase.endedUtc));
    if(!rows.length)return null;
    const spans=rows.map(r=>({start:Date.parse(r.startUtc),end:Date.parse(r.endUtc)})).sort((a,b)=>a.start-b.start);
    const overlap=spans.some((s,i)=>i&&s.start<spans[i-1].end);
    const coveredMs=spans.reduce((sum,s)=>sum+s.end-s.start,0),coverage=coveredMs/(Date.parse(phase.endedUtc)-Date.parse(phase.startedUtc));
    const missingProcessSamples=rows.filter(r=>r.missing?.length).length;
    const scopeConfirmed=rows.every(row=>row.scopeConfirmed);
    return { samples:rows.length, overlap, coverage,scopeConfirmed,valid:scopeConfirmed&&!overlap&&!missingProcessSamples&&coverage>=.8, processIds:[...new Set(rows.flatMap(r=>r.ids))],
        scope:[...new Set(rows.map(r=>r.scope))], missingProcessSamples,
        coreEquivalentPercent:distribution(rows.map(r=>r.cpuCorePercent)),
        privateBytes:distribution(rows.map(r=>r.privateBytes)),
        note:'100% means one fully occupied logical core. Private bytes are process commit, not JS heap. These are scoped process measurements, not isolated DSP timings.' };
}
