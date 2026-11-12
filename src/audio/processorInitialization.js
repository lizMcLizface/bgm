/** Observe one actual processor's positive initialization receipt. This is not
 * terminal-release authority and never advances a render/source clock. */
export function createProcessorInitialization({material,sampleRate,voices,timeoutMs=10000,timers=globalThis}={}) {
    if(!['piano','plucked'].includes(material)||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(voices)||voices<1||voices>32||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||typeof timers?.setTimeout!=='function'||typeof timers?.clearTimeout!=='function')throw Error('Invalid physical initialization observation');
    const expected=Object.freeze({material,sampleRate,voices});
    let phase='deferred',timer=null,resolve,reject,receipt=null,reason=null,lateReady=0;
    const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});ready.catch(()=>{});
    const clear=()=>{if(timer!==null){timers.clearTimeout(timer);timer=null;}};
    const fail=(error,state='failed')=>{if(!['deferred','waiting'].includes(phase))return false;reason=error instanceof Error?error:Error(String(error));phase=state;clear();reject(reason);return true;};
    const observe=()=>{if(phase==='waiting'&&timer===null)timer=timers.setTimeout(()=>fail(Object.assign(Error('Physical processor initialization timed out'),{code:'PHYSICAL_SOURCE_INITIALIZATION_TIMEOUT'})),timeoutMs);};
    return {
        ready,
        get reason(){return reason;},
        arm({startDeadline=true}={}){if(phase!=='deferred'||typeof startDeadline!=='boolean')throw Error('Physical initialization is already bound');phase='waiting';if(startDeadline)observe();},
        observe,
        pause(){clear();},
        fail,
        cancel(error=Object.assign(Error('Physical source disposed before initialization'),{code:'AUDIO_OWNER_DISPOSED'})){return fail(error,'cancelled');},
        receive(data){
            if(!data||typeof data!=='object')return false;
            if(data.type==='error'){fail(Object.assign(Error(String(data.error??'Physical processor initialization failed')),{code:'PHYSICAL_SOURCE_INITIALIZATION_FAILED'}));return true;}
            if(data.type==='disposed'){fail(Object.assign(Error('Physical processor ended before initialization'),{code:'PHYSICAL_SOURCE_INITIALIZATION_TERMINATED'}));return true;}
            if(data.type!=='ready')return false;
            if(!['deferred','waiting'].includes(phase)){lateReady=Math.min(0xffffffff,lateReady+1);return true;}
            if(phase!=='waiting'||data.material!==material||data.sampleRate!==sampleRate||data.voices!==voices){fail(Object.assign(Error('Physical processor initialization identity mismatch'),{code:'PHYSICAL_SOURCE_INITIALIZATION_IDENTITY'}));return true;}
            receipt=Object.freeze({profile:'physical-processor-initialized-v1',...expected});phase='ready';clear();resolve(receipt);return true;
        },
        status(){return{profile:'physical-initialization-observation-v1',phase,ready:phase==='ready',expected:{...expected},deadlineActive:timer!==null,receipt,error:reason?String(reason):null,lateReady};},
    };
}
