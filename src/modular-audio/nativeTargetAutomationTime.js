// Continuous setTargetAtTime origins are not setValueAtTime step events.
// This first host bridge accepts integer-frame origins (including the tiny
// floating point error introduced by frame/sampleRate), not fractional phases.
export const NATIVE_TARGET_TIME_PROFILE='native-target-integer-origin-v1';
export function nativeTargetTimeToFrame(seconds,sampleRate){
 if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||!Number.isInteger(sampleRate)||sampleRate<1)throw Error('Invalid native target time/rate');
 const value=seconds*sampleRate,at=Math.round(value),roundTripBound=4*Number.EPSILON*Math.max(1,Math.abs(value));
 if(!Number.isSafeInteger(at)||at<0||Math.abs(value-at)>roundTripBound)throw Error('Fractional native target phase requires a separate automation profile');
 return at;
}
