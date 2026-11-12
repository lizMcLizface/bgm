/** Terminal Native BufferSource actions over the already-owned finite Set.
 * Extra failure detail is bounded; this neither admits notes nor acknowledges
 * an AudioWorklet release or the audio-thread source-ended event. */
export function retireNativeBufferSources(sources,{errorCapacity=16}={}) {
    if(!(sources instanceof Set)||!Number.isInteger(errorCapacity)||errorCapacity<1||errorCapacity>16)throw Error('Invalid Native buffer terminal ownership');
    const initialSize=sources.size,errors=[];let actors=0,failureCount=0;
    for(const item of sources) {
        if(actors>=initialSize)throw Error('Native buffer ownership mutated during synchronous retirement');
        const index=actors++;let failed=false;
        for(const action of ['stop','disconnect'])try {
            const result=item.source[action]();
            if(result?.then) {result.catch?.(()=>{});throw Error('Native terminal action unexpectedly returned an asynchronous actor');}
        }catch(cause) {
            failed=true;failureCount++;
            if(errors.length<errorCapacity)errors.push(Object.assign(new Error('Native buffer '+action+' failed at '+index,{cause}),{actorIndex:index,action}));
        }
        if(!failed)sources.delete(item);
    }
    if(failureCount)throw Object.assign(new AggregateError(errors,'Native buffer terminal actions failed; uncertain owners retained'),{actors,failureCount,omittedErrors:failureCount-errors.length,retained:sources.size});
    return {profile:'native-buffer-terminal-actions-v1',clean:true,actors,remaining:sources.size,sourceEndedAcknowledged:false};
}
