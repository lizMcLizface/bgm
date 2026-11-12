/** Explicit runtime authority; never song data or a Native silence inference. */
export const CONTINUOUS_PREPARED_CONTEXT=Object.freeze({version:1,profile:'continuous-while-prepared-7a',autoSuspend:false,externalSuspension:'retire-and-explicit-reprepare',authorityVersion:'7a0838a735108706'});
export function validateContextLifecyclePolicy(policy){
 if(policy===undefined)return undefined;
 if(!policy||Object.keys(policy).length!==5||Object.keys(CONTINUOUS_PREPARED_CONTEXT).some(key=>policy[key]!==CONTINUOUS_PREPARED_CONTEXT[key]))throw Error('Unsupported prepared context lifecycle policy');
 return policy;
}
export function preparedContextAllowsIdleSuspend(environment){return validateContextLifecyclePolicy(environment?.contextLifecycle)?.autoSuspend!==false;}
