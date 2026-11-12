/** Review-only adversarial main-thread workload. This deliberately withholds
 * microtasks while the ORIGINAL Native context advances two canonical quanta.
 * It is not a render deadline, clock correction, audio shift or production API. */
export function waitFdnTeardownQuanta(context,{now=()=>performance.now()}={}){
 const rate=context?.sampleRate,quanta=2,maxWallMs=1000;if(!Number.isSafeInteger(rate)||rate<=0||context.state!=='running'||typeof now!=='function')throw Error('Invalid Native teardown workload context');
 const frame=seconds=>{const n=Math.round(seconds*rate);if(!Number.isFinite(seconds)||seconds<0||!Number.isSafeInteger(n)||n%128||seconds!==n/rate)throw Error('Noncanonical Native teardown workload frame');return n;};
 const startSeconds=context.currentTime,startFrame=frame(startSeconds);if(startFrame>Number.MAX_SAFE_INTEGER-quanta*128)throw Error('Native teardown workload frame overflow');
 const targetFrame=startFrame+quanta*128,startWall=now();let lastFrame=startFrame,reads=0,elapsedMs=0;
 for(;;){elapsedMs=now()-startWall;if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>=maxWallMs)throw Object.assign(Error('Native teardown workload wall deadline'),{workload:{startSeconds,startFrame,targetFrame,lastFrame,reads,elapsedMs,maxWallMs}});if(context.state!=='running')throw Error('Native teardown workload context stopped');const observed=frame(context.currentTime);reads++;if(observed<lastFrame)throw Error('Native teardown workload clock moved backwards');lastFrame=observed;if(observed>=targetFrame)return{version:1,quanta,maxWallMs,startSeconds,startFrame,targetFrame,observedSeconds:observed/rate,observedFrame:observed,elapsedMs,reads,source:'Actual main-thread AudioContext.currentTime, canonical frame validated; Source7a callback evidence is recorded separately',scope:'Adversarial main-thread teardown workload; no synthetic error, control edit, event shift, clock fit or normal-performance claim'};}
}
