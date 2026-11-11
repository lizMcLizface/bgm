// Prepared native composite: core + its BBD/space/output stage. External racks
// remain on the host. No factory/model modules are imported into the worklet.
export const CLASSIC_MODELS=Object.freeze(Array.from({length:14},(_,i)=>i));
const COUNTS=[128,48,76,144,52,176,144,96,136,136,136,16,125,136];
const shaped=new Set([0,1,2,3,4,6,12]);
const fail=()=>{throw Error('Invalid prepared classic configuration');};
export const classicWaveLength=model=>model===7?16384:model===12?8192:0;
export const classicParameter=(model,id)=>Number.isInteger(id)&&id>=0&&(id<COUNTS[model]||id>=180&&id<196&&shaped.has(model)||id>=200&&id<216);
export function validateClassicConfig(c){
 if(c?.version!==1||!CLASSIC_MODELS.includes(c.model)||!Number.isInteger(c.polyphony)||c.polyphony<1||c.polyphony>32||!Array.isArray(c.parameters)||c.parameters.length>256)fail();
 const seen=new Set();for(const p of c.parameters){if(!Array.isArray(p)||p.length!==2||!classicParameter(c.model,p[0])||seen.has(p[0])||!Number.isFinite(p[1])||!Number.isFinite(Math.fround(p[1])))fail();seen.add(p[0]);}
 const length=classicWaveLength(c.model);
 if(c.waves!==undefined&&(!length||!(Array.isArray(c.waves)||c.waves instanceof Float32Array)||c.waves.length!==length||Array.from(c.waves).some(v=>!Number.isFinite(v)||Math.abs(v)>64)))fail();
 if(c.model===7&&!c.waves)fail(); // VS has no generated fallback ROM.
 return c;
}
export const saveClassicConfig=c=>JSON.stringify({...validateClassicConfig(c),...(c.waves?{waves:Array.from(c.waves)}:{})},null,2)+'\n';
export const loadClassicConfig=text=>validateClassicConfig(JSON.parse(text));
