const records=new WeakMap();
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_SCALAR_BIRTH_REFUSED'});
const node=(value,context)=>value?.context===context&&typeof value.connect==='function'&&typeof value.disconnect==='function';
/** Called only at the actual Generator constructor boundary. This records
 * authored initial values and edges, never AudioParam getter reconstruction. */
export function rememberGeneratorMasterScalarBirth(g,{destination}={}){
 if(records.has(g)||g?.AC?.state!=='suspended'||g.AC.currentTime!==0)return null;
 const context=g.AC,volume=g.settings?.ambienceVolume??.8;
 if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0||volume>1||![g.output,g.levelTrim,g.ambienceOut,destination].every(value=>node(value,context))||new Set([g.output,g.levelTrim,g.ambienceOut,destination]).size!==4)return null;
 const birth=Object.freeze({context,output:g.output,trim:g.levelTrim,ambience:g.ambienceOut,destination,ambienceVolume:volume,trimInitial:1,trimAssigned:false,ambienceInitial:(volume/.8)**2,ambienceAssigned:true});
 records.set(g,{birth,valid:true,reason:null});return birth;
}
export function invalidateGeneratorMasterScalarBirth(g,reason){const record=records.get(g);if(record){record.valid=false;record.reason??=reason;}}
export function generatorMasterScalarBirth(g){
 const record=records.get(g),birth=record?.birth;
 if(!record||!record.valid)throw refuse('Original master scalar constructor history is unavailable');
 if(g.AC!==birth.context||g.output!==birth.output||g.levelTrim!==birth.trim||g.ambienceOut!==birth.ambience||(g.settings?.ambienceVolume??.8)!==birth.ambienceVolume)throw refuse('Master scalar identity/settings changed after construction');
 return birth;
}
