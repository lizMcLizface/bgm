import{isGeneratorPreparedSweepFacade}from'./generatorPreparedSweep.js';
const records=new WeakMap();
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_OUTPUT_BIRTH_REFUSED'});
const node=(value,context)=>value?.context===context&&typeof value.connect==='function'&&typeof value.disconnect==='function';
/** Actual constructor hook: default GainNode intrinsic1, no setter or target.
 * Never reconstruct this history from an AudioParam getter after construction. */
export function rememberGeneratorMasterOutputBirth(g){
 if(!g||records.has(g)||g.AC?.state!=='suspended'||g.AC.currentTime!==0)return null;
 const context=g.AC;if(!node(g.output,context)||!node(g.levelTrim,context)||g.output===g.levelTrim||g.sweep)return null;
 const birth=Object.freeze({context,output:g.output,trim:g.levelTrim,initial:1,assigned:false,initialTarget:false});
 records.set(g,{birth,valid:true,reason:null});return birth;
}
export function invalidateGeneratorMasterOutputBirth(g,reason){const record=records.get(g);if(record){record.valid=false;record.reason??=reason;}}
export function generatorMasterOutputBirth(g){
 const record=records.get(g),birth=record?.birth;if(!record?.valid)throw refuse('Original master-output constructor history is unavailable');
 if(g.AC!==birth.context||g.output!==birth.output||g.levelTrim!==birth.trim||g.sweep&&!isGeneratorPreparedSweepFacade(g,g.sweep))throw refuse('Original unswept master-output identity changed');
 return birth;
}
