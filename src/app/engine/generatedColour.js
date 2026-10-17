/** A sparse source-colour choice; never a pitch or composition rule. */
export function generatedColourPlan(info,kind) {
 const {profile,role}=info;
 const seed=(info.ensemble??info.seed??0)>>>0;
 const key=(Math.imul(seed^0x51ed270b,0x85ebca6b)^Math.imul(['pad','bass','lead','counter'].indexOf(role)+1,0x9e3779b9))>>>0;
 const variation=(key%997)/996,short=(info.gate??1)<.35;
 if(profile==='folk'&&['lead','counter'].includes(role)&&kind==='lead')return {
  family:'Air wind',parameters:{breathAmount:(.12+variation*.08)*(short?.6:1),formantAmount:.1+variation*.06,formantVowel:variation<.7?'oo':'ee',formantShift:variation<.7?0:-3,noiseMix:0}};
 if(role==='pad'&&((profile==='cinematic'&&kind==='pad'&&key%5===0)||(profile==='ambient'&&kind==='texture'&&key%2===0)))return {
  family:'Vowel pad',parameters:{breathAmount:.025+variation*.025,formantAmount:.16+variation*.12,formantVowel:profile==='ambient'?'oo':'ah',formantShift:0,noiseMix:0}};
 return null;
}
