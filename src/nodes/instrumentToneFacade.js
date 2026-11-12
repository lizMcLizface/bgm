import{prepareInstrumentTone}from'./instrumentToneRust.js';
const TYPES=Object.freeze(['lowpass','highpass','bandpass','notch','peaking','lowshelf','highshelf']);
const refuse=(message,code='INSTRUMENT_TONE_CONTROL_REFUSED')=>Object.assign(Error(message),{code});
const finite=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value))throw refuse('Finite numeric '+label+' required');return value;};
const intrinsic=()=>{throw refuse('Use configured targets or asynchronous observed curves; synchronous Native intrinsic reads are unavailable','INSTRUMENT_TONE_INTRINSIC_READ_UNSUPPORTED');};
/** Logical original setter semantics. Stage controllers have NO AudioNode ports:
 * a combined EQ→Filter actor cannot pretend to expose an intervening graph edge.
 * This function supplies controls, never a foreign-owner/source certificate. */
export function createInstrumentToneControls(owner){
 const mode=owner?.mode;if(!['filter','eq2','eq2-filter'].includes(mode)||typeof owner.alive!=='function'||typeof owner.command!=='function'||typeof owner.setType!=='function')throw refuse('Explicit prepared Instrument tone control owner required');
 const check=owner.alive.bind(owner),command=owner.command.bind(owner),setType=owner.setType.bind(owner),state={type:'lowpass',frequency:11000,q:1,gain:0,detune:0,lowFrequency:320,lowGain:0,midFrequency:1000,midQ:.7,midGain:0,highFrequency:3200,highGain:0};
 const write=(key,lane,value,time=0)=>{check();finite(value,key);finite(time,'time constant');if(time<0)throw refuse('Nonnegative time constant required');command(time?2:0,lane,value,time);state[key]=value;};
 const bounded=(key,lane,value,lo,hi,time=0)=>{check();finite(value,key);if(value<lo||value>hi)return false;write(key,lane,value,time);};
 const config=keys=>{check();return Object.freeze(Object.fromEntries(keys.map(key=>[key,state[key]])));};
 const filter=mode==='eq2'?null:Object.freeze({
  profile:'original-filter-control-v1',TYPES,
  getType(){check();return state.type;},getConfiguredFreq(){check();return state.frequency;},getConfiguredQ(){check();return state.q;},
  configured:()=>config(['type','frequency','q','gain','detune']),getFreq:intrinsic,getQ:intrinsic,getGain:intrinsic,getDetune:intrinsic,
  setType(value){check();const kind=TYPES.indexOf(value);if(kind<0)return false;setType(kind);state.type=value;},
  setFreq(value,time=0){return bounded('frequency',0,value,0,11000,time);},setQ(value,time=0){return bounded('q',1,value,0,100,time);},
  setGain(value){check();finite(value,'gain');if(value< -40||value>40)throw refuse('Filter gain exceeds explicit supported ±40 dB subset','INSTRUMENT_TONE_PROFILE_RANGE');write('gain',2,value);},
  setDetune(value,time=0){check();finite(value,'detune');if(value< -153600||value>153600)throw refuse('Detune exceeds explicit supported ±153600-cent subset','INSTRUMENT_TONE_PROFILE_RANGE');write('detune',3,value,time);}
 });
 const eq=mode==='filter'?null:Object.freeze({
  profile:'original-eq2-control-v1',configured:()=>config(['lowFrequency','lowGain','midFrequency','midQ','midGain','highFrequency','highGain']),
  getLowGain:intrinsic,getHighGain:intrinsic,getLowFreq:intrinsic,getHighFreq:intrinsic,
  setLowGain(value,time=0){return bounded('lowGain',6,value,-12,12,time);},setHighGain(value,time=0){return bounded('highGain',14,value,-12,12,time);},setMidGain(value){return bounded('midGain',10,value,-12,12);},
  setLowFreq(value){return bounded('lowFrequency',4,value,0,1000);},setHighFreq(value){return bounded('highFrequency',12,value,1000,11000);},
  setMidFreq(value){check();finite(value,'mid frequency');write('midFrequency',8,Math.min(11000,Math.max(100,value)));},setMidQ(value){check();finite(value,'mid Q');write('midQ',9,Math.min(8,Math.max(.1,value)));}
 });
 return Object.freeze({profile:'original-instrument-tone-controls-v1',mode,filter,eq});
}
/** Readback validation is a DTO contract, not Source ownership or freshness
 * authority. Values are the last prepared curves at the reported Rust frontier. */
export function validateInstrumentToneObserved(stats,{identity,mode}){
 const expected=mode==='filter'?[0,1,2,3]:mode==='eq2'?Array.from({length:12},(_,i)=>i+4):mode==='eq2-filter'?Array.from({length:16},(_,i)=>i):null,observed=stats?.observed,actual=stats?.identity;
 if(!expected||!actual||Object.keys(actual).length!==3||Object.keys(identity).length!==3||Object.keys(identity).some(key=>actual[key]!==identity[key])||stats.error||stats.disposed||stats.kernel?.rejected!==0||stats.kernel?.mode!==({'filter':0,eq2:1,'eq2-filter':2})[mode]||!Number.isSafeInteger(stats.kernel?.frame)||stats.kernel.frame<0||stats.kernel.frame%128||observed?.frame!==stats.kernel.frame||observed?.scope!=='Last prepared/rendered Rust curves, not synchronous Native intrinsic getters'||!Array.isArray(observed.lanes)||observed.lanes.length!==expected.length)throw refuse('Actual observed Instrument tone receipt differs');
 for(let i=0;i<expected.length;i++){const row=observed.lanes[i];if(!row||Object.keys(row).length!==3||row.lane!==expected[i]||!Number.isFinite(row.value)||!Number.isFinite(row.target))throw refuse('Observed Instrument tone lane data differs');}
 return structuredClone(observed);
}
/** Actual prepared factory creates the private actor. Only the WHOLE chain has
 * input/output ports; individual controllers are explicit logical sub-stages. */
export async function prepareInstrumentToneFacades(context){
 const make=await prepareInstrumentTone(context);
 const factory=(ac,options={})=>{const actor=make(ac,options),controls=createInstrumentToneControls(actor);return Object.freeze({profile:'original-instrument-tone-facade-v1',context:ac,mode:actor.mode,channels:actor.channels,controls,ready:actor.ready,arm:()=>actor.arm(),getNode:()=>actor.getNode(),connect:destination=>actor.connect(destination),disconnect:()=>actor.disconnect(),setHostAwake:value=>actor.setHostAwake(value),dispose:()=>actor.dispose(),sourceDisposalStatus:()=>structuredClone(actor.disposalStatus()),snapshot:()=>structuredClone(actor.snapshot()),async observe(){actor.alive();const stats=await actor.requestStats();actor.alive();return validateInstrumentToneObserved(stats,{identity:actor.identity,mode:actor.mode});}});};
 Object.defineProperties(factory,{profile:{value:'original-instrument-tone-facade-factory-v1'},hostVersion:{value:make.hostVersion},kernelVersion:{value:make.kernelVersion},backend:{value:make.backend}});return Object.freeze(factory);
}
