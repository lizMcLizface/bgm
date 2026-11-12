/** Bound an owner's observation, not the context-global addModule task. */
export function observeProcessorModule(load,{timeoutMs=10000,timers=globalThis}={}) {
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid processor module deadline');
    let done=false,resolve;const promise=new Promise(yes=>resolve=yes),finish=value=>{if(done)return;done=true;timers.clearTimeout(timer);resolve(value);},timer=timers.setTimeout(()=>finish({loaded:false,error:Error('Processor module observation timed out')}),timeoutMs);
    Promise.resolve(load).then(()=>finish({loaded:true}),error=>finish({loaded:false,error}));
    return {promise,cancel:()=>finish({cancelled:true})};
}
