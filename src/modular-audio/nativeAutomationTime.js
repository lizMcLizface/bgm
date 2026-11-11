// Preparation-only import policy for native setValueAtTime step timelines.
// Keep native seconds intact. A portable integer-frame clock is a separate
// contract; conversion happens before enqueue, never by shifting rendered PCM.
export const NATIVE_STEP_TIME_PROFILE='native-step-ceil-v1';
export function nativeTimeToFrame(timeSeconds,sampleRate){
 if(typeof timeSeconds!=='number'||!Number.isFinite(timeSeconds)||timeSeconds<0||!Number.isInteger(sampleRate)||sampleRate<1)throw Error('Invalid native automation time/rate');
 const frame=Math.ceil(timeSeconds*sampleRate);if(!Number.isSafeInteger(frame)||frame<0)throw Error('Native automation frame bounds');return frame;
}
export function compileNativeStepTimeline(raw,sampleRate){
 nativeTimeToFrame(0,sampleRate);if(!Array.isArray(raw)||raw.length>65536)throw Error('Native step timeline bounds');
 const events=raw.map((event,sequence)=>{
   if(!event||typeof event!=='object'||!Number.isInteger(event.index)||event.index<0||event.index>0xffffffff||typeof event.value!=='number'||!Number.isFinite(event.value)||event.requestedFrame!==undefined&&(!Number.isSafeInteger(event.requestedFrame)||event.requestedFrame<0))throw Error('Invalid native step event');
   return {sequence,index:event.index,value:event.value,timeSeconds:event.timeSeconds,...(event.requestedFrame===undefined?{}:{requestedFrame:event.requestedFrame}),frame:nativeTimeToFrame(event.timeSeconds,sampleRate)};
 });
 events.sort((a,b)=>a.timeSeconds-b.timeSeconds||a.sequence-b.sequence);
 return {profile:NATIVE_STEP_TIME_PROFILE,sampleRate,frameRule:'ceil(original timeSeconds * sampleRate)',events};
}
