const abort=()=>Object.assign(Error('Prepared Ambience start cancelled or settings changed'),{name:'AbortError'});
const signature=facade=>JSON.stringify({levels:facade.levels,shape:facade.shape,wander:facade.wander});
/** Explicit startup transaction for a selected profile. Resources are staged
 * without birth; only the subsequent ordinary start creates lazy waves. */
export async function startPreparedAmbience(facade,{offset=0,requestedAt=0,leadSeconds=.5,signal,isCurrent=()=>true}={}) {
    if(!facade?.session&&!(facade?.ready instanceof Promise)||!Number.isFinite(offset)||offset<0||offset>1e6||!Number.isFinite(requestedAt)||requestedAt<0||leadSeconds!==.5||typeof isCurrent!=='function')throw Error('Invalid prepared Ambience startup contract');
    const checked=()=>{if(signal?.aborted||!isCurrent())throw abort();facade.checkRuntime();};
    checked();await facade.ready;checked();const staging=facade.session.startStaging;if(!staging)throw Error('Prepared start requires an explicit staged session');let token;
    try{await facade.prepare();await facade.whenIdle();checked();const before=signature(facade);token=await staging.prepare({offset,levels:{...facade.levels}});await facade.whenIdle();checked();if(signature(facade)!==before)throw abort();staging.assertCurrent(token,{offset,levels:facade.levels});
        const readyAt=facade.AC.currentTime,startAt=Math.max(requestedAt,readyAt+leadSeconds),lateBefore=facade.sourcePreparationLateFrames;
        await facade.start(startAt,offset);await facade.whenIdle();checked();const lateFrames=facade.sourcePreparationLateFrames-lateBefore;if(lateFrames!==0)throw Object.assign(Error('Prepared Ambience start exceeded its declared future epoch'),{code:'COMPLETE_AMBIENCE_START_LATE',diagnostics:{readyAt,startAt,lateFrames}});
        return {profile:'prepared-complete-ambience-start-v1',readyAt,startAt,requestedAt,offset,leadSeconds,lateFrames,staging:token,constructors:[...facade.session.layers.values()].map(({layer,birth,offset})=>({layer,birth,offset}))};
    }catch(error){if(token){const cleanup=await staging.cancel(token);if(!cleanup.clean){facade.session.bed.fail(Error('Prepared start cancellation unconfirmed'));error.cleanup=cleanup;}}throw error;}
}
