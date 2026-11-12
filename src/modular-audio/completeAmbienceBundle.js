/** NEW component callback for a detached stopped-runtime bundle. The caller
 * publishes the private unity output through its own exact-edge journal. */
export async function buildCompleteAmbienceBundle({context,environment,settings,seed=1,offset=0,signal}={}) {
    if(environment?.context!==context||typeof environment.ambienceFactory!=='function'||typeof environment.prepareAmbienceStart!=='function'||!settings||typeof context?.createGain!=='function')throw Error('Selected complete Ambience bundle contract required');
    const checked=()=>{if(signal?.aborted)throw Object.assign(Error('Complete Ambience bundle construction cancelled'),{name:'AbortError'});environment.checkRuntime?.();};
    checked();let ambience,output;
    try{ambience=environment.ambienceFactory({context,seed,offset});output=context.createGain();await ambience.ready;checked();await ambience.setShape(settings.ambienceShape);await ambience.setLevels(settings.ambience);await ambience.setWander(settings.ambienceWander);await ambience.prepare();await ambience.whenIdle();checked();await ambience.connect(output);await ambience.whenIdle();checked();let disposal;
        return Object.freeze({context,ambience,output,prepareStart:options=>environment.prepareAmbienceStart(ambience,options),
            check(){checked();ambience.checkRuntime();if(ambience.running)throw Error('Candidate Ambience must remain stopped until runtime publication');},
            describe:()=>({profile:'detached-complete-ambience-component-v1',stopped:!ambience.running,status:ambience.status()}),
            dispose(){return disposal??=(async()=>{let receipt,error;try{receipt=await ambience.dispose();}catch(e){error=e;}try{output.disconnect();}catch(e){error=error?new AggregateError([error,e],'Ambience component cleanup failed'):e;}if(error)throw error;return receipt;})();}});
    }catch(error){const cleanup=[];if(ambience)try{cleanup.push(await ambience.dispose());}catch(e){cleanup.push({clean:false,error:e.message});}if(output)try{output.disconnect();}catch(e){cleanup.push({clean:false,error:e.message});}error.diagnostics={...(error.diagnostics??{}),completeAmbienceBundleCleanup:cleanup};throw error;}
}
