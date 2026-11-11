export const RACK_DYNAMICS_PROFILE='rack-native-dynamics-e14de735-v1';
const names=['threshold','knee','ratio','attack','release'];
const ranges=[[-100,0],[0,40],[1,20],[0,1],[0,1],[0,8],[0,8]];
export function validateRackDynamicsSpec(raw){
 if(!raw||raw.version!==1||raw.profile!==RACK_DYNAMICS_PROFILE||!['compressor','limiter'].includes(raw.kind)||!Array.isArray(raw.values)||raw.values.length!==7||raw.values.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||v<ranges[i][0]||v>ranges[i][1]))throw Error('Invalid complete rack dynamics profile');
 if(raw.kind==='limiter'&&raw.values.slice(1,5).some((v,i)=>v!==[0,20,.002,.09][i]))throw Error('Limiter native constructor profile is immutable');
 return {version:1,profile:RACK_DYNAMICS_PROFILE,kind:raw.kind,values:raw.values.slice()};
}
export function rackDynamicsSpec(kind,p={}){return validateRackDynamicsSpec({version:1,profile:RACK_DYNAMICS_PROFILE,kind,values:kind==='limiter'?[p.ceiling??-1,0,20,.002,.09,p.on===false||p.on===0?1:0,p.on===false||p.on===0?0:1]:[p.threshold??-24,p.knee??12,p.ratio??4,p.attack??.005,p.release??.1,p.enabled===false||p.enabled===0?1:1-(p.mix??1),p.enabled===false||p.enabled===0?0:(p.mix??1)*10**((p.makeup??0)/20)]});}
const freeze=c=>Object.freeze({...c,values:Object.freeze(c.values)});
export const saveRackDynamicsSpec=c=>JSON.stringify(validateRackDynamicsSpec(c),null,2)+'\n';
export const loadRackDynamicsSpec=text=>validateRackDynamicsSpec(JSON.parse(text));
export class OwnedRackDynamicsLive{
 constructor(engine,spec,rate,{originFrame=0,originSeconds=originFrame/rate,nativeConstructor=false}={}){this.e=engine;this.rate=rate;this.spec=freeze(validateRackDynamicsSpec(spec));if(engine.rack_dynamics_live_api()!==1||!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Rack dynamics ABI/rate mismatch');this.handle=engine.rack_dynamics_live_new(this.spec.kind==='compressor'?1:2,rate);if(!this.handle)throw Error('Rack dynamics allocation failed');try{for(let i=0;i<7;i++)this.accept(engine.rack_dynamics_live_initial(this.handle,i,this.spec.values[i]));if(typeof nativeConstructor!=='boolean')throw Error('Invalid native constructor preparation mode');this.accept((nativeConstructor?engine.rack_dynamics_live_prepare_native:engine.rack_dynamics_live_prepare)(this.handle,originFrame,originSeconds));this.refresh();}catch(error){this.dispose();throw error;}}
 accept(ok){if(!ok)throw Error('Rack dynamics operation rejected');}
 alive(){if(!this.handle)throw Error('Disposed rack dynamics');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.rack_dynamics_live_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.rack_dynamics_live_output(this.handle,ch),2048));this.wet=[0,1].map(ch=>new Float32Array(this.memory,this.e.rack_dynamics_live_wet(this.handle,ch),2048));}
 patch(spec,seconds=this.frame/this.rate,initial=false){this.alive();const next=freeze(validateRackDynamicsSpec(spec));if(next.kind!==this.spec.kind||typeof initial!=='boolean')throw Error('Rack dynamics kind cannot change');this.accept(this.e.rack_dynamics_live_patch(this.handle,seconds,this.frame,initial?1:0,...next.values));this.spec=next;}
 get frame(){this.alive();return this.e.rack_dynamics_live_stat(this.handle,1);}
 setPulled(value){this.alive();if(typeof value!=='boolean')throw Error('Demand must be Boolean');this.accept(this.e.rack_dynamics_live_pulled(this.handle,value?1:0));}
 sync(frame){this.alive();this.accept(this.e.rack_dynamics_live_sync(this.handle,frame));}
 render(n,channels=2,{inputSilent=false}={}){this.alive();if(!Number.isInteger(n)||n<0||n>2048||![1,2].includes(channels)||typeof inputSilent!=='boolean')throw Error('Rack dynamics render bounds');if(this.memory!==this.e.memory.buffer)throw Error('Rack dynamics memory grew; refresh outside render');this.accept(this.e.rack_dynamics_live_render(this.handle,n,channels,inputSilent?1:0));}
 reset(seconds=this.frame/this.rate){this.alive();this.accept(this.e.rack_dynamics_live_reset(this.handle,seconds));}
 coefficients(){this.alive();return Array.from({length:7},(_,i)=>this.e.rack_dynamics_live_coefficient(this.handle,i));}
 stats(){this.alive();const stats=Object.fromEntries(['peak','frame','processedFrames','wetLatencyFrames','reductionDb','pulled','commands','lastNonSilentTime','paramsOnlyQuanta','processCore','kind'].map((key,i)=>[key,this.e.rack_dynamics_live_stat(this.handle,i)]));return {...stats,dryLatencyFrames:0,compositeLatency:'parallel paths retain distinct latency'};}
 dispose(){if(this.handle){this.e.rack_dynamics_live_free(this.handle);this.handle=0;this.input=this.output=this.wet=this.memory=null;}}
}
