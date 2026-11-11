import{validateMeasuredStringPreparationSpec,saveMeasuredStringPreparationSpec,loadMeasuredStringPreparationSpec}from'./ownedStringPreparation.js';
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const uint=v=>Number.isInteger(v)&&v>=1&&v<=0xffffffff;
const keys=(p,allowed)=>p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>allowed.includes(k));
export function stringVoiceSpec(preparation,events=[],{owner=1}={}){validateMeasuredStringPreparationSpec(preparation);if(!uint(owner)||!Array.isArray(events)||events.length>4000)throw Error('Invalid measured-string voice plan bounds');return validateStringVoiceSpec({version:1,kind:'measured-string.realtime-dry',owner,preparation:loadMeasuredStringPreparationSpec(saveMeasuredStringPreparationSpec(preparation)),events:events.map(e=>({...e,owner:e.owner??owner}))});}
export function validateStringVoiceSpec(p){
 if(!keys(p,['version','kind','owner','preparation','events'])||p.version!==1||p.kind!=='measured-string.realtime-dry'||!uint(p.owner)||!Array.isArray(p.events)||p.events.length>4000)throw Error('Invalid measured-string voice configuration');
 validateMeasuredStringPreparationSpec(p.preparation);const prep=p.preparation;if(prep.table.mode!=='sustain')throw Error('Measured-string dry source requires an actual bowed table; decay playback is separate');
 const banks=new Set(prep.notes.map(n=>n.id)),low=prep.tuning.parts==='smooth'?24:36;
 if(prep.notes.some(n=>n.midi<low||n.midi>84||!Number.isInteger(n.velocity)))throw Error('Measured-string dry bank outside native realtime pitch/strength range');
 let notes=0;for(const e of p.events){if(!keys(e,e.kind==='on'?['frame','owner','kind','id','bank','lfo']:e.kind==='off'?['frame','owner','kind','id']:['frame','owner','kind'])||!Number.isSafeInteger(e.frame)||e.frame<0||e.frame>Number.MAX_SAFE_INTEGER-128||e.frame%128!==0||e.owner!==p.owner||!['on','off','panic'].includes(e.kind))throw Error('Measured-string events require one owner and actual128-frame message boundaries');if(e.kind==='on'){if(!uint(e.id)||!banks.has(e.bank)||!range(e.lfo,0,2*Math.PI)||e.lfo>=2*Math.PI||++notes>2000)throw Error('Measured-string on event requires its actual captured LFO phase and bank');}else if(e.kind==='off'&&!uint(e.id))throw Error('Invalid measured-string off ID');}return p;
}
export const saveStringVoiceSpec=p=>JSON.stringify(validateStringVoiceSpec(p))+'\n';
export function loadStringVoiceSpec(text){if(typeof text!=='string'||text.length>20*1024*1024)throw Error('Measured-string voice JSON bounds exceeded');return validateStringVoiceSpec(JSON.parse(text));}
