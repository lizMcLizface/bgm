/** Exact original Generator constructor recipe; no outer fade/sweep ownership. */
export const MAIN_SCALAR_COLD_PROFILE='main-trim-ambience-cold-v1';
export const MAIN_SCALAR_IDS=Object.freeze(['trim','ambience']);
export const MAIN_SCALAR_NODE_IDS=Object.freeze(['trim','ambience','output']);
export function mainScalarColdRecipe(rate,{ambienceVolume=.8}={}){
 if(!Number.isInteger(rate)||rate<8000||rate>192000||typeof ambienceVolume!=='number'||!Number.isFinite(ambienceVolume)||ambienceVolume<0||ambienceVolume>1)throw Error('Main scalar rate/ambience volume differs');
 const gain=(ambienceVolume/.8)**2;
 return Object.freeze(Object.fromEntries(MAIN_SCALAR_IDS.map(name=>[name,Object.freeze({name,channels:2,filtered:false,initial:Object.freeze([0,name==='trim'?1:gain,1]),initialAssignments:Object.freeze([false,name==='ambience',false]),originFrame:0})])));
}
export function validateMainScalarConfiguration(c){
 if(!c||!MAIN_SCALAR_NODE_IDS.includes(c.name)||c.channels!==2||c.filtered!==false||c.originFrame!==0||!Array.isArray(c.initial)||c.initial.length!==3||c.initial[0]!==0||c.initial[2]!==1||typeof c.initial[1]!=='number'||!Number.isFinite(c.initial[1])||c.initial[1]<0||c.initial[1]>1.5625||c.name!=='ambience'&&c.initial[1]!==1||!Array.isArray(c.initialAssignments)||c.initialAssignments.length!==3||c.initialAssignments[0]!==false||c.initialAssignments[1]!== (c.name==='ambience')||c.initialAssignments[2]!==false)throw Error('Exact Main scalar constructor configuration required');
 return c;
}
