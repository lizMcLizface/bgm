import Motion from '../src/nodes/motion.js';
import {OwnedMotion,ownedMotionSpec,MOTION_PARAMETERS,loadOwnedMotionSpec,saveOwnedMotionSpec} from '../src/modular-audio/ownedMotion.js';
import {compileNativeStepTimeline,nativeTimeToFrame,NATIVE_STEP_TIME_PROFILE} from '../src/modular-audio/nativeAutomationTime.js';
// Fixed before native comparison. No post-hoc alignment, gain normalization,
// changed tolerances, shifted control events or dropped startup samples.
export const MOTION_REFERENCE_BOUNDS=Object.freeze({maxAbsoluteError:1e-4,relativeRmsError:1e-4});
const base=`${import.meta.env.BASE_URL}modular-audio/`,methods=['setTremoloDepth','setTremoloRate','setAutoPanDepth','setAutoPanRate'];
export const MOTION_REFERENCE_CASES=[
 {id:'flat',settings:{}},
 {id:'full-tremolo-fast',settings:{tremoloDepth:1,tremoloRate:20}},
 {id:'full-pan-fast',settings:{autoPanDepth:1,autoPanRate:20}},
 {id:'combined',settings:{tremoloDepth:.73123456789,tremoloRate:4.123456789,autoPanDepth:.62345678912,autoPanRate:.9123456789}},
 {id:'slow-extremes',settings:{tremoloDepth:1,tremoloRate:.01,autoPanDepth:1,autoPanRate:.01}},
 {id:'sample-automation',settings:{tremoloDepth:.6,tremoloRate:4,autoPanDepth:.4,autoPanRate:.2},events:[[13,0,.5123456789],[41,1,11.123456789],[512,2,.9123456789],[513,3,7.123456789],[4001,0,1],[8191,2,0],[10003,1,.01]]},
];
export const motionReferenceSignal=(frame,ch)=>Math.fround(.15*Math.sin(frame*(.013+ch*.006))+.035*Math.cos(frame*.047+ch));
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
const pcmHash=async pcm=>{const bytes=new Uint8Array(pcm.reduce((n,x)=>n+x.byteLength,0));let offset=0;for(const x of pcm){bytes.set(new Uint8Array(x.buffer,x.byteOffset,x.byteLength),offset);offset+=x.byteLength;}return hash(bytes);};
export const captureMotionNativeTimeline=(row,rate)=>compileNativeStepTimeline((row.events??[]).map(([requestedFrame,index,value])=>({requestedFrame,index,value,timeSeconds:requestedFrame/rate})),rate);
export async function nativeMotionReference(row,rate,channels,frames,timeline=captureMotionNativeTimeline(row,rate)){
 const context=new OfflineAudioContext(2,frames,rate);let eventTime=0;
 // Use the actual class/setters with a controllable scheduling clock. Node
 // creation, connections and native DSP remain the original implementation.
 const clock={get currentTime(){return eventTime;}};for(const name of ['createGain','createChannelSplitter','createChannelMerger','createWaveShaper','createOscillator'])clock[name]=context[name].bind(context);
 const native=new Motion(clock),spec=ownedMotionSpec(row.settings),input=context.createBuffer(channels,frames,rate),source=context.createBufferSource();source.buffer=input;
 for(let ch=0;ch<channels;ch++)for(let i=0;i<frames;i++)input.getChannelData(ch)[i]=motionReferenceSignal(i,ch);
 for(const [index,value]of spec.parameters)native[methods[index]](value);
 for(const {timeSeconds,index,value}of timeline.events){eventTime=timeSeconds;native[methods[index]](value);}
 source.connect(native.getNode());native.connect(context.destination);source.start(0);const rendered=await context.startRendering();return [rendered.getChannelData(0).slice(),rendered.getChannelData(1).slice()];
}
export function portableMotionReference(row,rate,channels,frames,module,timeline=captureMotionNativeTimeline(row,rate)){
 const spec=loadOwnedMotionSpec(saveOwnedMotionSpec(ownedMotionSpec(row.settings))),d=new OwnedMotion(new WebAssembly.Instance(module,{}).exports,spec,rate),out=[new Float32Array(frames),new Float32Array(frames)],events=timeline.events;let event=0;
 try{for(let frame=0,k=0;frame<frames;k++){
   while(event<events.length&&events[event].frame===frame){const {index,value}=events[event++];d.patch([[index,value]]);}
   const n=Math.min([1,37,509,113,203,127][k%6],frames-frame,(events[event]?.frame??frames)-frame);if(n<1)throw Error('Motion event order');
   for(let ch=0;ch<channels;ch++)for(let i=0;i<n;i++)d.input[ch][i]=motionReferenceSignal(frame+i,ch);d.render(n,channels);out[0].set(d.left.subarray(0,n),frame);out[1].set(d.right.subarray(0,n),frame);frame+=n;
 }return out;}finally{d.dispose();}
}
export function compareMotionPcm(actual,reference){
 let maxAbsoluteError=0,errorEnergy=0,referenceEnergy=0,nonFinite=0,peak=0,firstDifference=null,maxDifference=null;const maxByChannel=[0,0];
 for(let ch=0;ch<2;ch++)for(let i=0;i<actual[ch].length;i++){const a=actual[ch][i],b=reference[ch][i],error=Math.abs(a-b);if(!Number.isFinite(a)||!Number.isFinite(b))nonFinite++;if(error&&!firstDifference)firstDifference={frame:i,channel:ch,actual:a,reference:b};if(error>maxAbsoluteError)maxDifference={frame:i,channel:ch,actual:a,reference:b,error};maxAbsoluteError=Math.max(maxAbsoluteError,error);maxByChannel[ch]=Math.max(maxByChannel[ch],error);errorEnergy+=(a-b)*(a-b);referenceEnergy+=b*b;peak=Math.max(peak,Math.abs(a));}
 const rmsError=Math.sqrt(errorEnergy/(actual[0].length*2)),relativeRmsError=Math.sqrt(errorEnergy/Math.max(referenceEnergy,1e-30));return {pass:nonFinite===0&&maxAbsoluteError<=MOTION_REFERENCE_BOUNDS.maxAbsoluteError&&relativeRmsError<=MOTION_REFERENCE_BOUNDS.relativeRmsError,maxAbsoluteError,maxByChannel,rmsError,relativeRmsError,referenceEnergy,nonFinite,peak,firstDifference,maxDifference};
}
export async function nativeMotionEventTiming(rate,events=MOTION_REFERENCE_CASES.find(row=>row.id==='sample-automation').events){
 const context=new OfflineAudioContext(events.length,Math.max(...events.map(e=>e[0]))+8,rate),input=context.createBuffer(1,context.length,rate),source=context.createBufferSource(),merge=context.createChannelMerger(events.length);input.getChannelData(0).fill(1);source.buffer=input;
 for(const [channel,[frame]]of events.entries()){const gain=context.createGain();gain.gain.setValueAtTime(0,0);gain.gain.setValueAtTime(1,frame/rate);source.connect(gain);gain.connect(merge,0,channel);}merge.connect(context.destination);source.start(0);const out=await context.startRendering();
 return {rate,scope:'Independent native GainNode step markers, unchanged eventTime=requestedFrame/sampleRate; no Motion DSP, alignment or schedule adjustment',events:events.map(([requestedFrame],channel)=>{const firstNativeNonzeroFrame=out.getChannelData(channel).findIndex(value=>value!==0),importedFrame=nativeTimeToFrame(requestedFrame/rate,rate);return {requestedFrame,eventTime:requestedFrame/rate,timeTimesRate:requestedFrame/rate*rate,importedFrame,firstNativeNonzeroFrame,matchesNativeImport:firstNativeNonzeroFrame===importedFrame,window:Array.from(out.getChannelData(channel).subarray(Math.max(0,requestedFrame-1),requestedFrame+3))};})};
}
export async function runMotionReference({onProgress=()=>{},assetBase=base}={}){
 const manifest=await fetch(assetBase+'motion-fx-build.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Motion build manifest unavailable');return r.json();}),bytes=await fetch(assetBase+`motion-fx.wasm?v=${manifest.version}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Motion Wasm unavailable');return r.arrayBuffer();});if(await hash(bytes)!==manifest.wasm)throw Error('Motion asset fingerprint mismatch');const module=await WebAssembly.compile(bytes),trials=[];
 for(const rate of [44100,48000,96000])for(const channels of [1,2])for(const row of MOTION_REFERENCE_CASES){
   onProgress(`${rate} Hz · ${channels===1?'mono':'stereo'} · ${row.id}`);const frames=Math.ceil(rate*.75),timeline=captureMotionNativeTimeline(row,rate),native=await nativeMotionReference(row,rate,channels,frames,timeline),portable=portableMotionReference(row,rate,channels,frames,module,timeline),comparison=compareMotionPcm(portable,native),eventWindows=row.events?.map(([frame])=>({requestedFrame:frame,samples:Array.from({length:5},(_,i)=>frame-2+i).filter(i=>i>=0&&i<frames).map(i=>({frame:i,native:native.map(ch=>ch[i]),portable:portable.map(ch=>ch[i])}))}));trials.push({id:row.id,rate,channels,frames,settings:row.settings,events:row.events??[],capturedTimeline:timeline,...comparison,...(eventWindows?{eventWindows}:{}),nativePcmSha256:await pcmHash(native),portablePcmSha256:await pcmHash(portable)});
 }
 const nativeEventTiming=[];for(const rate of [44100,48000,96000])nativeEventTiming.push(await nativeMotionEventTiming(rate));
 return {kind:'motion.native-web-audio-reference',version:2,engineVersion:manifest.version,wasmSha256:manifest.wasm,nativeSourceSha256:manifest.referenceSourceSha256,createdAtUtc:new Date().toISOString(),browserUserAgent:navigator.userAgent,scope:'Actual src/nodes/motion.js Web Audio graph and setters in OfflineAudioContext versus portable Rust. Original native seconds are unchanged; explicit native-step import compiles ceil(seconds*rate) before integer-frame enqueue. No PCM alignment shift or normalization; explicit mono upmix/stereo mapping. No physical listening/deadline claim.',clocks:{ownedMotion:'exact integer-frame control application; unchanged',nativeCapture:NATIVE_STEP_TIME_PROFILE,nativeSeconds:'preserved exactly; requested and effective frames are both reported',evidence:'Independent native GainNode markers must agree with the import rule'},bounds:MOTION_REFERENCE_BOUNDS,pass:trials.every(t=>t.pass)&&nativeEventTiming.every(r=>r.events.every(e=>e.matchesNativeImport)),comparisons:trials.length,maxAbsoluteError:Math.max(...trials.map(t=>t.maxAbsoluteError)),maxRelativeRmsError:Math.max(...trials.map(t=>t.relativeRmsError)),nativeEventTiming,trials};
}
