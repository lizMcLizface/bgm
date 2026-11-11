import DEFAULTS from './presetDefaults.js';
// Preserve actual wrapper call order. Initial steps are embedded only for an
// offline render, whose first quantum can precede MessagePort delivery.
export const LIMITER_INITIAL_FIELDS = Object.freeze([
 ['masterLimiterThreshold',0],['masterLimiterRatio',2],['masterLimiterKnee',1],
 ['masterLimiterAttack',3],['masterLimiterRelease',4],
]);
export function instrumentCompressorPolicy(context,preset,factory){
 if(factory!==null&&typeof factory!=='function')throw Error('Invalid ordinary compressor factory');
 const owned=!!factory,offline=owned&&typeof context.startRendering==='function';
 const values={...DEFAULTS,...preset},common=owned?{factory,hostAwake:offline}:{};
 return {owned,offline,
  synthMix:{...common,...(offline?{initialPull:true,initialControls:[[0,-6],[1,0],[2,20]]}:{})},
  limiter:{...common,...(offline?{initialPull:true,initialControls:LIMITER_INITIAL_FIELDS.map(([key,index])=>[index,values[key]])}:{})}};
}
