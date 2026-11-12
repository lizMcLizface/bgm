import {buildCompleteAmbienceBundle} from './completeAmbienceBundle.js';
const abort=()=>Object.assign(Error('Complete Ambience candidate is no longer current'),{name:'AbortError'});
const aggregate=(errors,message)=>{const unique=[...new Set(errors)];return unique.length===1?unique[0]:new AggregateError(unique,message);};
const nonAbort=error=>error&&error.name!=='AbortError';
/** NEW explicit owner contract. No synchronous start(), implicit publication or
 * duplicate facade/output ownership. The parent tracks this component once. */
export async function createCompleteAmbienceCandidate({context,data,environment,signal,startAdmission,seed=1,offset=0,build=buildCompleteAmbienceBundle,timers=globalThis,disposeDeadlineMs=15000}={}) {
    if(!context||environment?.context!==context||!data?.settings||typeof startAdmission!=='function'||startAdmission.constructor?.name==='AsyncFunction'||typeof build!=='function')throw Error('Explicit same-context complete Ambience prepared-start binding required');
    if(!Number.isInteger(disposeDeadlineMs)||disposeDeadlineMs<1||disposeDeadlineMs>30000)throw Error('Invalid complete Ambience disposal deadline');
    if(signal?.aborted)throw abort();
    const component=await build({context,environment,settings:data.settings,seed,offset,signal}),a=component.ambience;
    let closed=false,pending=null,startAbort=null,disposal=null,sequence=0,generation=0,lastReceipt=null,startFailure=null,stopping=null,stopWork=null,stopPromise=null,stopFailure=null,lastStopReceipt=null,stopRequest=null,stopObservationAbort=null,disposalFailure=null,cleanupStarted=false,cleanupSettled=false;
    const alive=()=>{if(closed||signal?.aborted)throw abort();};
    const admitted=()=>{alive();return startAdmission(owner)===true;};
    function observation(){const weather=a.weather?.status?.()??{nodes:[]};return {running:Boolean(a.running),active:Boolean(a.active),playing:a.playing?.size??0,sources:a.sources?.size??0,weatherNodes:weather.nodes?.length??0,weatherBindings:weather.bindings?.length??0,jobs:a.jobs?.size??0,queue:a.queue?.pending??0,retirements:a.retirements?.size??0,error:a.status?.().error??weather.error??null};}
    const quiet=s=>!s.running&&!s.active&&!s.playing&&!s.sources&&!s.weatherNodes&&!s.weatherBindings&&!s.jobs&&!s.queue&&!s.retirements&&!s.error;
    function stoppedStatus(){let state;try{state=observation();}catch(error){state={error:error.message};}const error=disposalFailure??stopFailure??startFailure;return {version:1,profile:'complete-ambience-stopped-admission-v1',stopped:!closed&&!pending&&!stopping&&!error&&quiet(state),closed,pendingStart:Boolean(pending),pendingStop:Boolean(stopping),quarantined:Boolean(stopFailure||disposalFailure),error:error?.message??state.error??null,state,receipt:lastStopReceipt,authoredFade:stopRequest?{time:stopRequest.time,endAt:stopRequest.time+stopRequest.fade,active:Boolean(stopping)&&context.currentTime<stopRequest.time+stopRequest.fade}:null};}
    const owner={profile:'explicit-complete-ambience-candidate-v1',context,ambience:a,output:component.output,ready:Promise.resolve(),stoppedStatus,
        check(){alive();if(!stoppedStatus().stopped)throw Error('Complete Ambience candidate has not reached its acknowledged stopped boundary');component.check();},
        checkRuntime(){alive();if(stopFailure||startFailure)throw stopFailure??startFailure;environment.checkRuntime?.();a.checkRuntime();},
        describe(){return {profile:owner.profile,closed,pendingStart:Boolean(pending),sequence,lastReceipt,stopped:stoppedStatus(),component:component.describe(),retirement:{cleanupStarted,cleanupSettled,error:disposalFailure?.message??null}};},
        async prepareStart(options={}) {
            alive();if(stopFailure||startFailure)throw stopFailure??startFailure;if(!admitted())throw Error('Complete Ambience start requires the current published async-start binding');
            if(stopping&&stopRequest&&context.currentTime<stopRequest.time+stopRequest.fade)throw Object.assign(Error('An active authored Ambience fade cannot be canceled by this prepared-start profile'),{code:'COMPLETE_AMBIENCE_FADE_ACTIVE'});
            if(pending||stopping||a.running)throw Error('Complete Ambience start is already pending or running or stopping');
            if(!options||typeof options!=='object'||options.isCurrent!==undefined&&typeof options.isCurrent!=='function'||sequence===0xffffffff)throw Error('Invalid complete Ambience start admission');
            const current=options.isCurrent??(()=>true),requestedAt=options.requestedAt??context.currentTime,epoch=++generation,controller=new AbortController();startAbort=controller;sequence++;stopPromise=null;
            const work=Promise.resolve().then(()=>component.prepareStart({...options,requestedAt,signal:controller.signal,isCurrent:()=>epoch===generation&&!closed&&!signal?.aborted&&!options.signal?.aborted&&admitted()&&current()}));pending=work;
            try{const receipt=await work;lastReceipt=receipt;return receipt;}catch(error){if(nonAbort(error))startFailure??=error;throw error;}finally{if(pending===work)pending=null;if(startAbort===controller)startAbort=null;}
        },
        stop({time=context.currentTime,fade=.4,deadlineMs=15000}={}) {
            alive();if(!Number.isFinite(time)||time<0||time>137438953||time-context.currentTime>86400||!Number.isFinite(fade)||fade<0||fade>5||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000)throw Error('Invalid bounded complete Ambience stop');
            if(stopping||stopFailure)return stopPromise;
            if(stopPromise&&stoppedStatus().stopped)return stopPromise;
            const requestedAt=context.currentTime,prior=pending,cancelledPendingStart=Boolean(prior),loops=new Set(),weather=new Set();let rejectObservation;const observationAbort=new Promise((_,reject)=>rejectObservation=reject);observationAbort.catch(()=>{});stopObservationAbort=rejectObservation;const observed=work=>Promise.race([Promise.resolve(work),observationAbort]);stopRequest={time,fade,deadlineMs};generation++;startAbort?.abort(abort());
            const capture=()=>{if((a.sources?.size??0)>16||(a.weather?.nodes?.size??0)>4)throw Error('Complete Ambience stop actor capacity exceeded');for(const source of a.sources??[])loops.add(source);for(const source of a.weather?.nodes??[])weather.add(source);if(loops.size>16||weather.size>4)throw Error('Complete Ambience stop actor capacity exceeded');};
            const receipts=async()=>{const pending=[...(a.retirements??[]),...[...loops,...weather].map(source=>source.retirement).filter(Boolean)],results=await observed(Promise.allSettled(pending));return results.filter(result=>result.status==='rejected'||result.value?.clean===false||result.value?.acknowledged===false).map(result=>result.status==='rejected'?result.reason:Error('Complete Ambience source retirement was not acknowledged cleanly'));};
            const work=(async()=>{const errors=[];capture();if(prior){const[result]=await observed(Promise.allSettled([prior]));if(result.status==='rejected'&&nonAbort(result.reason))errors.push(result.reason);}if(startFailure)errors.push(startFailure);capture();
                if(a.running||a.active||(a.sources?.size??0)||(a.weather?.nodes?.size??0))try{await observed(a.stop(time,fade));}catch(error){errors.push(error);}
                try{await observed(a.whenIdle());}catch(error){if(nonAbort(error))errors.push(error);}capture();errors.push(...await receipts());if(errors.length)throw aggregate(errors,'Complete Ambience startup/stop retirement failed');
                for(;;){if(closed)throw abort();capture();const state=observation(),sourceStates=[...loops].map(source=>source.status());const failed=sourceStates.filter(source=>source.phase==='quarantined'||source.error||source.cleanupIssues?.length);if(state.error||failed.length)throw Object.assign(Error(state.error??'Complete Ambience source stop was quarantined'),{diagnostics:{state,sources:sourceStates}});if(quiet(state))break;await observed(new Promise(resolve=>timers.setTimeout(resolve,10)));}
                errors.push(...await receipts());const sources=[...loops].map(source=>source.status()),weatherReceipts=(await observed(Promise.allSettled([...weather].map(source=>source.retirement)))).map(result=>result.status==='fulfilled'?result.value:{clean:false,acknowledged:false,error:result.reason?.message});
                if(sources.some(source=>source.phase!=='retired'||!source.endObserved||!source.spatialAcknowledged||!source.cursorAcknowledged||source.cleanupIssues?.length)||weatherReceipts.some(receipt=>!receipt?.clean||!receipt?.acknowledged))errors.push(Error('Complete Ambience stopped boundary lacks actual source-ended/cancel/free acknowledgements'));
                if(errors.length)throw aggregate(errors,'Complete Ambience stop receipt failed');return {version:1,profile:'complete-ambience-stop-receipt-v1',clean:true,acknowledged:true,stopped:true,requestedAt,time,fade,deadlineMs,observedAt:context.currentTime,cancelledPendingStart,fadeEndpoint:time+fade,deadlineOrigin:'authored-fade-endpoint',sources,weather:weatherReceipts};})();stopWork=work;work.catch(()=>{});
            let timeout;const bounded=Promise.race([work,new Promise((_,reject)=>timeout=timers.setTimeout(()=>{const error=Object.assign(Error('Complete Ambience stop acknowledgement timed out; owner quarantined'),{code:'COMPLETE_AMBIENCE_STOP_UNCERTAIN'});rejectObservation(error);reject(error);},Math.max(0,(time+fade-context.currentTime)*1000)+deadlineMs))]);
            stopping=bounded;stopPromise=bounded.then(receipt=>{if(!stopFailure)lastStopReceipt=receipt;return receipt;},error=>{if(nonAbort(error))stopFailure??=error;throw error;}).finally(()=>{timers.clearTimeout(timeout);if(stopping===bounded)stopping=null;});stopPromise.catch(()=>{});return stopPromise;
        },
        dispose(){if(disposal)return disposal;closed=true;generation++;startAbort?.abort(abort());stopObservationAbort?.(abort());
            // Start actual component retirement now: observer waits may depend
            // on cancellation performed by this very cleanup operation.
            cleanupStarted=true;const cleanup=Promise.resolve().then(()=>component.dispose());cleanup.then(()=>cleanupSettled=true,()=>cleanupSettled=true);cleanup.catch(()=>{});
            const waits=[pending,stopWork,cleanup].filter(Boolean),settled=Promise.allSettled(waits);let timeout;
            const work=Promise.race([settled,new Promise((_,reject)=>timeout=timers.setTimeout(()=>reject(Object.assign(Error('Complete Ambience component retirement timed out; resources retained'),{code:'COMPLETE_AMBIENCE_DISPOSAL_UNCERTAIN'})),disposeDeadlineMs))]);
            disposal=work.then(results=>{const errors=results.filter(result=>result.status==='rejected'&&nonAbort(result.reason)).map(result=>result.reason);if(startFailure)errors.push(startFailure);if(stopFailure)errors.push(stopFailure);const receipt=results.at(-1);if(receipt.status==='fulfilled'&&(receipt.value?.clean!==true||receipt.value?.acknowledged===false||receipt.value?.quarantined===true))errors.push(Error('Complete Ambience component retirement was not acknowledged cleanly'));if(errors.length)throw aggregate(errors,'Complete Ambience owner retirement failed');return receipt.value;},error=>{const errors=[error];if(startFailure)errors.push(startFailure);if(stopFailure)errors.push(stopFailure);throw aggregate(errors,'Complete Ambience owner retirement failed');}).catch(error=>{disposalFailure??=error;throw error;}).finally(()=>timers.clearTimeout(timeout));disposal.catch(()=>{});return disposal;
        }
    };
    if(signal?.aborted){await owner.dispose();throw abort();}
    return Object.freeze(owner);
}
