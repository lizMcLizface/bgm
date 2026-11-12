import{validateMainControl}from'./mainControlWords.js';
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MASTER_SCALAR_REFUSED'});
const row=(rate,name,command)=>{validateMainControl(rate,{...command,seconds:command.seconds==='now'?0:command.seconds});return Object.freeze({name,commands:Object.freeze([Object.freeze(command)])});};
export function planGeneratorAmbienceVolume(rate,volume){
 if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0||volume>1)throw refuse('Bounded ambience volume required');
 return Object.freeze({volume,rows:Object.freeze([row(rate,'ambience',{lane:1,op:'target',seconds:'now',value:(volume/.8)**2,tau:.05})])});
}
export function planGeneratorLoudnessTrim(rate,value,seconds,barSeconds){
 if(typeof barSeconds!=='number'||!Number.isFinite(barSeconds)||barSeconds<=0)throw refuse('Positive bar duration required');
 return Object.freeze({rows:Object.freeze([row(rate,'trim',{lane:1,op:'target',seconds,value,tau:barSeconds*.3})])});
}
