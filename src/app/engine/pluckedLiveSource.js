import {createPhysicalBufferLiveSource} from './physicalBufferLiveSource.js';
import {createPluckedLivePreparation} from './pluckedLivePreparation.js';
import {pluckedStringBufferSpec} from '../../modular-audio/ownedPluckedString.js';
export const isOwnedPluckedPreset=preset=>preset?.stringModel==='plucked';
/** The original KS material; the common player owns only PCM/slot behavior. */
export function createPluckedLiveSource(instrument,dependencies={}){
 return createPhysicalBufferLiveSource(instrument,{material:'plucked',hook:'ownedPluckedSource',prepare:createPluckedLivePreparation,getOptions:plan=>{if(!plan.string||plan.piano)throw Error('Plucked source requires its actual KS note plan');return plan.string;},resourceIdentity:(rate,frequency,options)=>{const spec=pluckedStringBufferSpec(rate,frequency,options);return{note:{freq:spec.frequency,settings:spec},key:JSON.stringify([rate,spec.frequency,frequency,spec])};},preparationMessage:(sampleRate,freq,settings)=>({sampleRate,freq,settings}),...dependencies});
}
