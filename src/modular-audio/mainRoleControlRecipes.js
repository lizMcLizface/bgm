export const MAIN_ROLE_IDS=Object.freeze(['lead','counter','pad','bass','rhythm','perc']);
export const MAIN_ROLE_COLD_PROFILE='main-six-role-constant-cold-v1';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** Explicit new constant control recipe; no old Native timeline/getter replay. */
export function mainRoleColdRecipe(rate,roles){
 if(!Number.isInteger(rate)||rate<8000||rate>192000||!roles||Object.keys(roles).length!==6||MAIN_ROLE_IDS.some(role=>!Object.hasOwn(roles,role)))throw Error('Six explicit cold role controls required');
 return Object.freeze(Object.fromEntries(MAIN_ROLE_IDS.map(role=>{const value=roles[role];if(!value||Object.keys(value).some(key=>!['volume','cutoff'].includes(key))||!finite(value.volume)||value.volume<0||value.volume>4||value.cutoff!==undefined&&(!finite(value.cutoff)||value.cutoff<0))throw Error('Unsupported cold role recipe; only constant volume/cutoff is admitted');const filtered=role!=='perc',cutoff=Math.min(value.cutoff??20000,rate/2);return[role,Object.freeze({channels:2,filtered,initial:Object.freeze([cutoff,value.volume,1]),initialAssignments:Object.freeze([filtered,true,false])})];})));
}
const at=value=>finite(value)&&value>=0;
/** Literal original Ducker calculation. Planning never mutates releaseAt. */
export function planMainRoleDuck(releaseAt,{start,end,floor}={}){
 if(!(releaseAt===-Infinity||at(releaseAt))||!at(start)||!at(end)||end<start||!finite(floor)||floor<0)throw Error('Invalid explicit Ducker recipe');
 if(!(floor<1))return Object.freeze({releaseAt,commands:Object.freeze([])});
 const time=Math.max(0,start-.04),next=Math.max(releaseAt>time?releaseAt:0,end+.06);
 return Object.freeze({releaseAt:next,commands:Object.freeze([{lane:2,op:'cancel',seconds:time,value:0,tau:0},{lane:2,op:'target',seconds:time,value:floor,tau:.03},{lane:2,op:'target',seconds:next,value:1,tau:.12}].map(Object.freeze))});
}
export function planMainRoleDuckReset(time=0){if(!at(time))throw Error('Invalid Ducker reset time');return Object.freeze({releaseAt:-Infinity,commands:Object.freeze([{lane:2,op:'cancel',seconds:time,value:0,tau:0},{lane:2,op:'set',seconds:time,value:1,tau:0}].map(Object.freeze))});}
