const align=n=>Math.ceil(n/128)*128;
export function liveRoomCompleteSourcePlan(rate,now,frames,latencyFrames){
 if(!Number.isInteger(rate)||rate<8000||rate>192000||!Number.isFinite(now)||now<0||!Number.isSafeInteger(frames)||frames<128||frames%128||!Number.isSafeInteger(latencyFrames)||latencyFrames<128||latencyFrames%128)throw Error('Invalid live Room review source geometry');
 const sourceSeconds=Math.ceil((now+.5)*4)/4,sourceFrame=sourceSeconds*rate;
 if(!Number.isSafeInteger(sourceFrame)||sourceFrame/rate!==sourceSeconds)throw Error('Native review source start is not an exact binary/integer sample');
 const epoch=align(sourceFrame+rate*.25),prefix=epoch-sourceFrame;
 return Object.freeze({sourceSeconds,sourceFrame,epoch,prefix,sourceBufferFrames:prefix+frames+latencyFrames,sourceEndFrame:epoch+frames+latencyFrames,scope:'Source-owned exact binary future start; all prefix samples are explicitly zero, no fitted input/output alignment'});
}
export function liveRoomCompleteSourceInput(rate,channels,frames){
 if(![1,2].includes(channels)||!Number.isSafeInteger(frames)||frames<128+Math.ceil(rate*.15))throw Error('Live Room source program bounds');
 const start=141,end=128+Math.ceil(rate*.15);
 return Array.from({length:channels},(_,ch)=>Float32Array.from({length:frames},(_,i)=>i<start||i>=end?0:Math.fround(.06*Math.sin(i*.031+ch*.4)+.02*Math.cos(i*.071))));
}
