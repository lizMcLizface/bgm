import {reserveContextPreparation,contextPreparationStatus} from './contextPreparationRegistry.js';
import {prepareAmbienceCompleteHost} from './ambienceCompleteHost.js';
const owners=new WeakMap(),PROFILE='complete-ambience-cold-lease-v1',KEY='complete-ambience-cold-owner-v1';
const cold=context=>context?.state==='suspended'&&context.currentTime===0&&typeof context.startRendering!=='function';
function refusal(code,message,extra={}){return Object.assign(Error(message),{code,...extra});}
function requireCold(context){if(!cold(context))throw refusal('COMPLETE_AMBIENCE_COLD_REQUIRED','Complete Ambience first preparation requires a virgin suspended context before its first wake');}
function cleanReceipt(result){if(result?.clean!==true)throw refusal('COMPLETE_AMBIENCE_CLEANUP_UNCONFIRMED','Complete Ambience context cleanup was not acknowledged cleanly',{mustRetireContext:true,diagnostics:{cleanup:result}});return result;}
/** The FIRST lease is the caller's explicit context-session/bootstrap reference.
 * Candidate leases are separate refs. No hidden keeper or Source7a is created.
 * Call before stoppedRuntimeBundle's synchronous wake:true reservation. */
export function acquireCompleteAmbienceColdLease(context,{signal,prepare=prepareAmbienceCompleteHost,label='complete-ambience-session'}={}) {
    let owner=owners.get(context);
    if(!owner){requireCold(context);if(typeof prepare!=='function')throw Error('Explicit complete Ambience preparation factory required');}
    else if(owner.prepare!==prepare)throw refusal('COMPLETE_AMBIENCE_AUTHORITY_MISMATCH','Cold context already has another complete Ambience acquisition authority');
    else if(owner.state==='closing'||owner.state==='retired'||owner.state==='failed')throw refusal('COMPLETE_AMBIENCE_CONTEXT_RETIRED','Complete Ambience context owner is retired or uncertain; use a fresh context',{mustRetireContext:true});
    // This reservation is deliberately synchronous, before host/assets awaits.
    const ticket=reserveContextPreparation(context,{label,signal,allowCold:true,wake:false});
    if(!owner){owner={prepare,state:'reserved',value:null,acquire:null};
        owner.acquire=async()=>{
            requireCold(context);owner.state='preparing';let host;
            try{host=await prepare(context);if(!host||host.context!==context||typeof host.create!=='function'||typeof host.disposeContext!=='function')throw Error('Complete Ambience cold host contract differs');
                if(!cold(context)){const cleanup=await host.disposeContext();throw refusal('COMPLETE_AMBIENCE_COLD_RACE','Context advanced during cold complete Ambience preparation',{mustRetireContext:true,diagnostics:{cleanup}});}
                owner.state='ready';const value=owner.value=Object.freeze({profile:PROFILE,host,coldPreparedFrame:0});
                return {context,value,release:async()=>{owner.state='closing';try{const result=cleanReceipt(await host.disposeContext());owner.state='retired';return result;}catch(error){owner.state='failed';throw error;}}};
            }catch(error){owner.state='failed';if(host&&cold(context)){try{cleanReceipt(await host.disposeContext());}catch(cleanupError){error.cleanupError=cleanupError;error.mustRetireContext=true;}}throw error;}
        };owners.set(context,owner);
    }
    const entry=owner;
    return (async()=>{try{await ticket.ready;const value=await ticket.shared(KEY,entry.acquire);if(entry.state!=='ready')throw refusal('COMPLETE_AMBIENCE_CONTEXT_RETIRED','Complete Ambience cold prerequisite is no longer ready',{mustRetireContext:true});
            const published=ticket.publish(()=>value);let release;
            return Object.freeze({context,value,release(){return release??=(published.retire());},retain(options={}){return acquireCompleteAmbienceColdLease(context,{...options,prepare:entry.prepare});},snapshot(){return {profile:PROFILE,state:entry.state,scope:published.snapshot(),context:contextPreparationStatus(context)};}});
        }catch(error){try{await ticket.cancel(error);}catch(cleanupError){error.cleanupError=cleanupError;error.mustRetireContext=true;}throw error;}})();
}
