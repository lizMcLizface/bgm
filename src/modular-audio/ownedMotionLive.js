/** Original five-AudioParam Motion profile. No native coefficient bridge. */
export const MOTION_LIVE_PROFILE='original-motion-independent-lanes-e14de735-v1';
export const MOTION_LIVE_FRAME_MAX=1099511627648;
export const MOTION_LIVE_LANES=Object.freeze(['tremoloBase','tremoloDepth','tremoloRate','panDepth','panRate']);
const exact=(value,names)=>value&&Object.keys(value).length===names.length&&names.every(key=>Object.hasOwn(value,key));
export const motionLiveFrame=frame=>Number.isSafeInteger(frame)&&frame>=0&&frame<=MOTION_LIVE_FRAME_MAX&&frame%128===0;
export function motionLiveLane(index,value){return Number.isInteger(index)&&typeof value==='number'&&Number.isFinite(value)&&Math.fround(value)===value&&(index===0?value>=.5&&value<=1:index===1?value>=0&&value<=.5:index===3?value>=0&&value<=1:(index===2||index===4)&&value>=Math.fround(.01)&&value<=20);}
export function validateMotionLiveSpec(raw){
 if(!exact(raw,['version','profile','rate','origin','constructorCalls'])||raw.version!==1||raw.profile!==MOTION_LIVE_PROFILE||!Number.isInteger(raw.rate)||raw.rate<8000||raw.rate>192000||!exact(raw.origin,['frame','seconds'])||!motionLiveFrame(raw.origin.frame)||raw.origin.seconds!==raw.origin.frame/raw.rate||!Array.isArray(raw.constructorCalls)||raw.constructorCalls.length!==6)throw Error('Invalid complete Motion live contract');
 let previous=raw.origin.frame;
 const constructorCalls=raw.constructorCalls.map((call,slot)=>{if(!exact(call,['slot','frame','seconds'])||call.slot!==slot||!motionLiveFrame(call.frame)||call.frame<previous||call.seconds!==call.frame/raw.rate)throw Error('Invalid ordered native Motion constructor trace');previous=call.frame;return{...call};});
 return{version:1,profile:MOTION_LIVE_PROFILE,rate:raw.rate,origin:{...raw.origin},constructorCalls};
}
export function motionLiveSpec(rate,{originFrame=0,constructorFrames=Array(6).fill(originFrame)}={}){return validateMotionLiveSpec({version:1,profile:MOTION_LIVE_PROFILE,rate,origin:{frame:originFrame,seconds:originFrame/rate},constructorCalls:constructorFrames.map((frame,slot)=>({slot,frame,seconds:frame/rate}))});}
export const saveMotionLiveSpec=spec=>JSON.stringify(validateMotionLiveSpec(spec),null,2)+'\n';
export const loadMotionLiveSpec=text=>validateMotionLiveSpec(JSON.parse(text));
const freeze=spec=>Object.freeze({...spec,origin:Object.freeze(spec.origin),constructorCalls:Object.freeze(spec.constructorCalls.map(Object.freeze))});
export class OwnedMotionLive{
 constructor(engine,raw){const spec=freeze(validateMotionLiveSpec(raw));if(engine.motion_live_api()!==1)throw Error('Motion live ABI mismatch');this.e=engine;this.spec=spec;this.handle=engine.motion_live_new(spec.rate);if(!this.handle)throw Error('Motion live allocation failed');try{for(const call of spec.constructorCalls)this.check(engine.motion_live_constructor(this.handle,call.slot,call.frame,call.seconds));this.check(engine.motion_live_prepare(this.handle,spec.origin.frame,spec.origin.seconds));this.refresh();}catch(error){this.dispose();throw error;}}
 check(ok){if(!ok)throw Error('Motion live operation rejected');}
 alive(){if(!this.handle)throw Error('Motion live instance disposed');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.motion_live_input(this.handle,ch),128));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.motion_live_output(this.handle,ch),128));}
 sync(frame){this.alive();if(!motionLiveFrame(frame))throw Error('Motion live canonical observed frame required');this.check(this.e.motion_live_sync(this.handle,frame));}
 lane(index,value,{frame=this.frame,seconds=frame/this.spec.rate}={}){this.alive();if(!motionLiveLane(index,value)||!motionLiveFrame(frame)||seconds!==frame/this.spec.rate)throw Error('Invalid original Motion lane call');this.check(this.e.motion_live_lane(this.handle,index,value,frame,seconds));}
 render(channels=2,{processing='audio'}={}){this.alive();if(![0,1,2].includes(channels)||!['unpulled','parameters-only','audio'].includes(processing))throw Error('Invalid explicit Motion live activity');if(this.memory!==this.e.memory.buffer)throw Error('Refresh Motion views after external memory growth');this.check(this.e.motion_live_render(this.handle,channels,['unpulled','parameters-only','audio'].indexOf(processing)));}
 get frame(){this.alive();return this.e.motion_live_stat(this.handle,0);}
 targets(){this.alive();return Array.from({length:5},(_,index)=>this.e.motion_live_target(this.handle,index));}
 laneValues(sample=127){this.alive();if(!Number.isInteger(sample)||sample<0||sample>=128)throw Error('Invalid Motion lane sample');return Array.from({length:5},(_,index)=>this.e.motion_live_value(this.handle,index,sample));}
 stats(){this.alive();return Object.fromEntries(['frame','peak','tremoloPhase','panPhase','calls','processedFrames','unpulledFrames','parameterOnlyFrames','commands','rejected','lateEdits','maxLateFrames','originFrame','lastAuthoredFrame'].map((key,index)=>[key,this.e.motion_live_stat(this.handle,index)]));}
 clear(){} // Original Motion exposes no DSP reset operation.
 dispose(){if(this.handle){this.e.motion_live_free(this.handle);this.handle=0;this.memory=this.input=this.output=null;}}
}
/** Exact projection of each original public setter, preserving separate reads. */
export function motionLiveSetterCalls(method,value,seconds){
 if(typeof value!=='number'||!Number.isFinite(value)||!Array.isArray(seconds)||seconds.some(t=>typeof t!=='number'||!Number.isFinite(t)||t<0))throw Error('Invalid authored Motion setter');
 const depth=Math.min(1,Math.max(0,value)),rate=Math.min(20,Math.max(.01,value));
 const values=method==='setTremoloDepth'?[[0,Math.fround(1-depth/2)],[1,Math.fround(depth/2)]]:method==='setTremoloRate'?[[2,Math.fround(rate)]]:method==='setAutoPanDepth'?[[3,Math.fround(depth)]]:method==='setAutoPanRate'?[[4,Math.fround(rate)]]:null;
 if(!values||seconds.length!==values.length)throw Error('Incomplete original Motion call timestamps');return values.map(([lane,target],i)=>({lane,target,seconds:seconds[i]}));
}
