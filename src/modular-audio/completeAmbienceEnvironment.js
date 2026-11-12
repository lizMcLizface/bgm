import {createAmbienceStagedSession} from './ambienceStartStaging.js';
import {startPreparedAmbience} from './ambiencePreparedStart.js';
const owners=new WeakMap();
function unclean(receipt){const error=Error('Selected complete Ambience retirement was not cleanly acknowledged');error.code='COMPLETE_AMBIENCE_RETIREMENT_UNCONFIRMED';error.diagnostics={receipt};return error;}
/** Pure NEW selection adapter. Caller owns an explicit retained cold lease.
 * Existing environment/Generator/Native constructors are never mutated here. */
export function selectCompleteAmbienceEnvironment(base,coldLease,{prepareContext}={}) {
    const context=base?.context,host=coldLease?.value?.host;
    if(!context||coldLease.context!==context||host?.context!==context||coldLease.value.profile!=='complete-ambience-cold-lease-v1'||typeof host.create!=='function'||typeof base.prepareContext!=='function')throw Error('Explicit same-context cold complete Ambience prerequisite required');
    const create=options=>{
        if(options?.context&&options.context!==context)throw Error('Complete Ambience factory belongs to another context');
        const facade=host.create({...options,context,createSession:createAmbienceStagedSession}),dispose=facade.dispose.bind(facade);let retirement;
        facade.dispose=()=>retirement??=(dispose().then(receipt=>{if(!receipt.clean)throw unclean(receipt);return receipt;}));owners.set(facade,context);return facade;
    };
    return Object.freeze({...base,ambienceFactory:create,
        prepareAmbienceStart(facade,options){if(owners.get(facade)!==context)throw Error('Ambience start belongs to another selected environment');return startPreparedAmbience(facade,options);},
        checkRuntime(){base.checkRuntime?.();host.checkRuntime();},
        prepareContext:prepareContext??(next=>{if(typeof next?.startRendering==='function')return base.prepareContext(next);throw Object.assign(Error('A new live complete Ambience context requires its own explicit cold prerequisite'),{code:'COMPLETE_AMBIENCE_COLD_REQUIRED'});}),
        boundaries:Object.freeze({...base.boundaries,ambience:'Selected complete owned live Ambience with explicit cold prerequisite, staged lazy resources and half-second prepared start; old offline path remains separate',completeAmbienceVersion:host.version,defaultChanged:false})});
}
