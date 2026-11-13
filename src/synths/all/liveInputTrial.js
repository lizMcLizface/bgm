import {fingerprint} from './comparisonSession';
import {playbackSnapshot,playbackDifference} from './playbackDiagnostics';
export const LIVE_TRIAL_KEY='synths:all:live-input-trials';
export function liveInputRecipeIdentity(recipe) {
    // Continuous regenerates its idle song seed on reload. This test sends its
    // own fixed live keys and never plays that generated material. Keep the full
    // recipe in the report, and exclude only this unused seed from the match.
    const copy=JSON.parse(JSON.stringify(recipe));
    if(copy.settings)delete copy.settings.seed;
    return copy;
}
export function liveInputPattern(seconds=30) {
    const rows=[],part=seconds/3;
    const note=(at,n,held)=>{const key=`latency:${rows.length}`;rows.push({at,type:'on',key,n,velocity:.65},{at:at+held,type:'off',key});};
    for(let t=0;t<part-.5;t+=1)note(t,60+(Math.round(t)%5)*2,.35);
    for(let t=part;t<2*part-.75;t+=1)for(const n of[60,64,67])note(t,n,.6);
    for(let t=2*part;t<seconds-.3;t+=.125)note(t,[60,64,67,72][Math.round((t-2*part)*8)%4],.2);
    return rows.sort((a,b)=>a.at-b.at);
}
export async function measureLiveInput({host,performer,role,recipe,seconds=30,onProgress=()=>{},abort={aborted:false}}) {
    await host.wake();
    const voice=host.g.roles[role]?.instrument?.voice,backend=voice?.backend,context=host.context;
    if(!['owned-subtractive','owned-fm'].includes(backend?.kind)||!backend.liveInputTiming||!backend.flush)throw Error('Select a ready Rust Core/FM voice on the keybed for this test.');
    if(performer.keys.size)throw Error('Release held keys before starting the live-input test.');
    const capturedRecipe=JSON.parse(JSON.stringify(recipe));
    const plan=liveInputPattern(seconds),beforeStats=await backend.flush(),initialTiming=backend.liveInputTimingStatus(),before=playbackSnapshot(context);
    const started=performance.now(),startedUtc=new Date().toISOString(),issues=new Set(),dispatch=[],owned=new Set();let index=0,failure=null,afterStats=null,meter,lastProgress=-1;
    const visible=()=>{if(document.visibilityState!=='visible')issues.add('Document was hidden');};
    const state=()=>issues.add('AudioContext state changed');
    visible();document.addEventListener('visibilitychange',visible);context.addEventListener('statechange',state);
    let peak=0;
    try {
        meter=host.openMeters();
        while(performance.now()-started<seconds*1000) {
            if(abort.aborted)throw Error('Live-input test stopped');
            if(context.state!=='running')throw Error('Audio context stopped');
            if(backend.error)throw backend.error;
            const elapsed=(performance.now()-started)/1000;
            while(index<plan.length&&plan[index].at<=elapsed) {
                const event=plan[index++],at=performance.now(),frame=Math.round(context.currentTime*context.sampleRate);
                if(event.type==='on'){owned.add(event.key);performer.down(event.key,event.n,event.velocity);}else{performer.up(event.key);owned.delete(event.key);}
                dispatch.push({index:index-1,type:event.type,note:event.n,contextFrame:frame,wallDelayMs:at-started-event.at*1000});
            }
            if(performer.keys.size!==owned.size)issues.add('Other live keys changed the workload');
            peak=Math.max(peak,meter.read()[role]??0);
            // Keep diagnostics rendering out of the 10 ms input polling loop.
            if(Math.floor(elapsed)!==lastProgress){lastProgress=Math.floor(elapsed);onProgress(elapsed,seconds);}
            await new Promise(resolve=>setTimeout(resolve,10));
        }
        if(index!==plan.length)throw Error('Live test did not dispatch its complete input pattern');
        // Include final releases and allow authored off/retune events to execute
        // before reading actual Rust late/drop counters. Never rewrite their time.
        await new Promise(resolve=>setTimeout(resolve,backend.liveInputTiming.leadSeconds*1000+100));
        afterStats=await backend.flush();
        if(backend.error)throw backend.error;
    }catch(error){failure=String(error.message??error);}
    finally {
        for(const key of owned)try{performer.up(key);}catch(error){issues.add('Release refused after source failure: '+error.message);}
        meter?.dispose();document.removeEventListener('visibilitychange',visible);context.removeEventListener('statechange',state);
    }
    const after=playbackSnapshot(context),timing=backend.liveInputTimingStatus();
    if(timing.total-initialTiming.total<plan.length)issues.add('Backend did not observe all live calls');
    if(timing.events.some(e=>!e.defaulted))issues.add('Explicit timestamps bypassed the selected live-input policy');
    const late=afterStats?afterStats.late-beforeStats.late:null,dropped=afterStats?afterStats.dropped-beforeStats.dropped:null;
    return {version:2,kind:'all-live-input-latency',role,leadMs:backend.liveInputTiming.leadSeconds*1000,seconds,startedUtc,endedUtc:new Date().toISOString(),
        sampleRate:context.sampleRate,baseLatencySeconds:context.baseLatency,outputLatencySeconds:context.outputLatency,
        recipe:capturedRecipe,recipeHash:await fingerprint(capturedRecipe),inputRecipeHash:await fingerprint(liveInputRecipeIdentity(capturedRecipe)),patternHash:await fingerprint(plan),plannedCalls:plan.length,dispatchedCalls:dispatch.length,dispatch,
        before,after,...playbackDifference(before,after),beforeStats,afterStats,late,dropped,
        backendEvents:timing.total-initialTiming.total,timing,engineVersion:backend.engineVersion,peak,issues:[...issues],failure,
        pass:!failure&&!issues.size&&late===0&&dropped===0&&index===plan.length&&peak>0,
        scope:'Normal All keybed Performer → startNote/stopNote/retune → selected Rust default-time policy. Device underruns reported separately. Configured lead is not measured end-to-end acoustic latency.'};
}
export function readLiveTrials(){try{return JSON.parse(sessionStorage.getItem(LIVE_TRIAL_KEY)??'[]');}catch{return [];}}
export function saveLiveTrial(report){const rows=[...readLiveTrials(),report];sessionStorage.setItem(LIVE_TRIAL_KEY,JSON.stringify(rows));return rows;}
