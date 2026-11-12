import {createSourceDisposalFence} from '../modular-audio/sourceDisposalFence.js';
/** Exact per-node terminal authority. At most one current and one retiring node
 * per wrapper; released history retains data only, never live node references. */
export class ProcessorRetirements {
    constructor(context,{label='Native processor',capacity=2,timeoutMs=1000}={}) {
        if(!context||capacity!==2||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid bounded processor ownership');
        this.context=context;this.label=label;this.capacity=capacity;this.timeoutMs=timeoutMs;this.records=new Map();this.retirementPromises=new WeakMap();this.history=[];this.constructing=0;this.sequence=0;this.closed=false;this.error=null;this.disposal=null;
    }
    check(){if(this.closed||this.error)throw this.error??Error(this.label+' disposed');}
    preflight(){this.check();if(this.records.size+this.constructing>=this.capacity||this.sequence===0xffffffff)throw Error(this.label+' source capacity exhausted before mutation');}
    create(kind,make,{beforeDisconnect=null}={}) {
        this.preflight();if(!['worklet','script'].includes(kind)||typeof make!=='function'||beforeDisconnect!==null&&typeof beforeDisconnect!=='function')throw Error('Invalid actual processor factory');
        this.constructing++;let node,record;try{node=make();if(!node||this.records.has(node)||this.retirementPromises.has(node))throw Error('Processor factory returned no independent node');record={id:++this.sequence,node,kind,extras:[],phase:'active',fence:null,promise:null,error:null,callbackCleared:false,beforeDisconnect};this.records.set(node,record);
            if(kind==='worklet'){
                const fence=createSourceDisposalFence(this.context,node,{label:this.label,timeoutMs:this.timeoutMs});record.fence=fence;
                const previous=node.port.onmessage,onError=node.onprocessorerror;
                node.port.onmessage=event=>{if(!fence.receive(event.data))previous?.(event);};
                node.onprocessorerror=event=>{const error=Error(this.label+' processor failed');record.error??=error;this.error??=error;fence.fail(error);onError?.(event);};
                node.sourceDisposalStatus=fence.status;node.disposeOwned=()=>this.retire(node);
            }
            return node;
        }catch(error){if(record){const cleanup=this.retire(node);error.cleanupReady=cleanup;cleanup.catch(cleanupError=>{error.cleanupError??=cleanupError;});}throw error;}finally{this.constructing--;}
    }
    ownExtra(node,extra){const record=this.records.get(node);if(!record||record.phase!=='active'||record.extras.length>=1||!extra?.disconnect)throw Error('Invalid private processor adjunct');record.extras.push(extra);return extra;}
    retire(node) {
        const record=this.records.get(node);if(!record){const known=this.retirementPromises.get(node);if(known)return known;throw Error('Cannot retire an unowned processor');}if(record.promise)return record.promise;
        let resolve,reject;record.promise=new Promise((yes,no)=>{resolve=yes;reject=no;});record.promise.catch(()=>{});this.retirementPromises.set(node,record.promise);record.phase='retiring';const errors=[];let terminal;
        if(record.kind==='worklet')try{if(!record.fence)throw Error('Actual worklet has no terminal receiver');terminal=record.fence.dispose();}catch(error){errors.push(error);}
        else try{node.onaudioprocess=null;record.callbackCleared=node.onaudioprocess===null;if(!record.callbackCleared)throw Error('ScriptProcessor callback was not cleared');}catch(error){errors.push(error);}
        if(record.beforeDisconnect)try{record.beforeDisconnect();}catch(error){errors.push(error);}
        for(const target of[node,...record.extras])try{target.disconnect();}catch(error){errors.push(error);}
        Promise.allSettled(terminal?[terminal]:[]).then(results=>{for(const result of results)if(result.status==='rejected')errors.push(result.reason);if(record.error&&!errors.includes(record.error))errors.push(record.error);
            if(errors.length){record.error=errors.length===1?errors[0]:new AggregateError(errors,this.label+' retirement failed');record.phase='quarantined';this.error??=record.error;reject(record.error);return;}
            record.phase='retired';const receipt=record.kind==='worklet'?record.fence.status():{profile:'script-processor-callback-closure-v1',clean:true,callbackCleared:true,sourceEndedAcknowledged:false};this.history.push({id:record.id,kind:record.kind,phase:record.phase,receipt});if(this.history.length>4)this.history.shift();this.records.delete(node);resolve(receipt);
        });return record.promise;
    }
    dispose(){if(this.disposal)return this.disposal;this.closed=true;const pending=[...this.records.keys()].map(node=>this.retire(node));this.disposal=Promise.allSettled(pending).then(results=>{const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(this.error&&!errors.includes(this.error))errors.push(this.error);if(errors.length)throw new AggregateError(errors,this.label+' owner retirement failed');return{clean:true,profile:'processor-owner-set-retirement-v1',remaining:this.records.size};});this.disposal.catch(()=>{});return this.disposal;}
    actors(){return [...this.records.values()].map(record=>({node:record.node,kind:record.kind,id:record.id,phase:record.phase}));}
    status(){return{profile:'bounded-processor-owner-set-v1',capacity:this.capacity,constructing:this.constructing,closed:this.closed,error:this.error?String(this.error):null,actors:[...this.records.values()].map(record=>({id:record.id,kind:record.kind,phase:record.phase,extras:record.extras.length,error:record.error?String(record.error):null,terminal:record.fence?.status()??null,callbackCleared:record.callbackCleared})),history:this.history.slice()};}
}
