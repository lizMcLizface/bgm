const requireClean = receipt => {if(receipt && typeof receipt==='object' && (receipt.clean===false||receipt.acknowledged===false||receipt.released===false||receipt.quarantined===true))throw Error('Explicit audio owner returned an unclean retirement receipt');return receipt;};
/** Bounded private constructor ownership. A completed callback is not a claim
 * that an untyped processor released; source capability remains its own actor. */
export class AudioConstructorJournal {
    constructor({capacity=256,label='Audio constructor'}={}) {
        if(!Number.isInteger(capacity)||capacity<1||capacity>1024||typeof label!=='string'||!label.length||label.length>100)throw Error('Invalid constructor ownership journal');
        this.capacity=capacity;this.label=label;this.records=[];this.seen=new WeakSet();this.state='open';this.retirement=null;
    }
    create(label,make,release) {
        if(this.state!=='open'||this.records.length>=this.capacity||typeof label!=='string'||!label.length||label.length>100||typeof make!=='function'||typeof release!=='function')throw Error('Constructor ownership admission refused');
        const value=make();if(!value||(typeof value!=='object'&&typeof value!=='function')||this.seen.has(value))throw Error('Constructor returned no independent private owner');
        this.seen.add(value);this.records.push({label,value,release,attempted:false,closed:false,error:null});return value;
    }
    retire() {
        if(this.retirement)return this.retirement;this.state='retiring';let resolve,reject;this.retirement=new Promise((yes,no)=>{resolve=yes;reject=no;});this.retirement.catch(()=>{});const pending=[];
        // Invoke every close before awaiting any of them. Each callback owns only
        // its explicit private actor; no Native context/graph traversal occurs.
        for(const record of this.records.slice().reverse()) {record.attempted=true;let work;try{work=record.release(record.value);if(work===this.retirement)throw Error('Constructor cleanup returned its own retirement fence');}catch(error){work=Promise.reject(error);}pending.push(Promise.resolve(work).then(requireClean).then(()=>{record.closed=true;},error=>{record.error=error;throw error;}));}
        Promise.allSettled(pending).then(results=>{const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);this.state=errors.length?'cleanup-failed':'retired';if(errors.length)reject(new AggregateError(errors,this.label+' cleanup failed'));else resolve({clean:true,profile:'constructor-cleanup-journal-v1',owners:this.records.length});});return this.retirement;
    }
    failure(reason) {
        const error=reason&&typeof reason==='object'?reason:Error(String(reason)),inner=error.cleanupReady,outer=this.retire();
        const cleanupReady=Promise.allSettled([...(inner?.then?[inner]:[]),outer]).then(results=>{const errors=results.flatMap(result=>{if(result.status==='rejected')return[result.reason];try{requireClean(result.value);return[];}catch(error){return[error];}});if(errors.length)throw errors.length===1?errors[0]:new AggregateError(errors,this.label+' nested cleanup failed');return{clean:true,profile:'constructor-cleanup-journal-v1',owners:this.records.length};});
        error.cleanupReady=cleanupReady;cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});return error;
    }
    status(){return {profile:'constructor-cleanup-journal-v1',state:this.state,capacity:this.capacity,owners:this.records.length,records:this.records.map(record=>({label:record.label,attempted:record.attempted,closed:record.closed,error:record.error?String(record.error):null}))};}
}

/** Attempt every explicit private-owner action before observing any result.
 * This is aggregation, not processor termination authority. */
export function settleAudioCleanup(label,actions) {
    if(typeof label!=='string'||!Array.isArray(actions)||actions.length>256||actions.some(action=>typeof action!=='function'))throw Error('Invalid bounded audio cleanup actions');
    const pending=actions.map(action=>{try{return Promise.resolve(action()).then(requireClean);}catch(error){return Promise.reject(error);}});
    return Promise.allSettled(pending).then(results=>{const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);if(errors.length)throw new AggregateError(errors,label+' cleanup failed');return {clean:true,profile:'explicit-audio-cleanup-actions-v1',actions:actions.length};});
}
