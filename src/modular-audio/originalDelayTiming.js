import{prepareInstrumentDelayTiming}from'../nodes/instrumentDelayTimingRust.js';
import{createInstrumentDelayControls,validateInstrumentDelayObserved}from'../nodes/instrumentDelayFacade.js';
const actualTimingFacades=new WeakMap();
export function originalDelayTimingOf(facade,{context,mode}={}){const record=actualTimingFacades.get(facade);if(!record)return null;if(record.context!==context||record.mode!==mode)throw Object.assign(Error('Original delay timing context/mode differs'),{code:'ORIGINAL_DELAY_TIMING_REFUSED'});return record.timing;}
const refuse=message=>Object.assign(Error(message),{code:'ORIGINAL_DELAY_TIMING_REFUSED'}),MAX_FRAME=1099511627648;
/** Exact private tempoEffects parameter order, expressed as explicit commands.
 * Scheduled seconds are separate from each actual publisher author timestamp. */
export function planOriginalDelayTiming(mode,value,start,rate){
 if(!['delay','ping-pong'].includes(mode)||!Number.isInteger(rate)||rate<8000||rate>192000||typeof value!=='number'||!Number.isFinite(value)||value<0||value>1||typeof start!=='number'||!Number.isFinite(start)||start<0||start>MAX_FRAME/rate)throw refuse('Bounded original delay time and explicit schedule epoch required');
 return Object.freeze((mode==='delay'?[0]:[0,1,2]).flatMap(lane=>[Object.freeze({op:3,lane,value:0,tau:0,seconds:start}),Object.freeze({op:2,lane,value,tau:.025,seconds:start})]));
}
/** This control helper confers no source/ownership capability. The context-bound
 * factory below creates and retains the actual actor; no fake AudioParam facade. */
export function createOriginalDelayTiming(owner){
 if(!['delay','ping-pong'].includes(owner?.mode)||typeof owner.alive!=='function'||typeof owner.preflightRows!=='function'||typeof owner.commands!=='function'||!owner.AC)throw refuse('Actual prepared delay control owner required');
 const plan=(value,start)=>{owner.alive();return planOriginalDelayTiming(owner.mode,value,start,owner.AC.sampleRate);};
 return Object.freeze({profile:'original-delay-future-timing-v1',preflight(value,start){const rows=plan(value,start);owner.preflightRows(rows);return rows.length;},schedule(value,start){const rows=plan(value,start);owner.commands(rows);}});
}
export async function prepareOriginalDelayTiming(context){
 const make=await prepareInstrumentDelayTiming(context),factory=(ac,options={})=>{const actor=make(ac,options),controls=createInstrumentDelayControls(actor),timing=createOriginalDelayTiming(actor);const facade=Object.freeze({profile:'original-delay-timing-facade-v1',context:ac,mode:actor.mode,channels:actor.channels,outputChannels:actor.outputChannels,controls,timing,ready:actor.ready,arm:()=>actor.arm(),getNode:()=>actor.getNode(),connect:node=>actor.connect(node),disconnect:()=>actor.disconnect(),setHostAwake:on=>actor.setHostAwake(on),dispose:()=>actor.dispose(),sourceDisposalStatus:()=>structuredClone(actor.disposalStatus()),snapshot:()=>structuredClone(actor.snapshot()),async observe(){actor.alive();const stats=await actor.requestStats();actor.alive();return validateInstrumentDelayObserved(stats,{identity:actor.identity,mode:actor.mode,channels:actor.channels});}});actualTimingFacades.set(facade,{context:ac,mode:actor.mode,timing});return facade;};
 Object.defineProperties(factory,{profile:{value:'original-delay-timing-factory-v1'},hostVersion:{value:make.hostVersion},kernelVersion:{value:make.kernelVersion},backend:{value:make.backend}});return Object.freeze(factory);
}
