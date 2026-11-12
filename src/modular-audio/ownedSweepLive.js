export const SWEEP_LIVE_PROFILE='original-sweep-live-v1';
export const SWEEP_LIVE_STATS=Object.freeze(['frame','peak','origin','calls','commands','rejected','renderedFrames','unpulledFrames','late','maxLate','channels','lastAuthor']);
export const SWEEP_INITIAL=Object.freeze({lowpass:22000,highpass:10,resonance:Math.SQRT1_2});
/** Kernel wrapper only. set() represents one captured/frozen Native insertion
 * epoch; the live host must retain original author/admission clocks separately. */
export class OwnedSweepLive{
 constructor(e,rate,{origin=0,channels=2,initial=true}={}){if(e.sweep_live_api?.()!==1||!Number.isInteger(rate)||rate<8000||rate>192000||![1,2].includes(channels)||typeof initial!=='boolean')throw Error('Sweep ABI/rate/layout differs');this.e=e;this.rate=rate;this.channels=channels;this.handle=e.sweep_live_new(rate,channels);if(!this.handle)throw Error('Sweep allocation failed');try{this.check(e.sweep_live_prepare(this.handle,origin),'prepare');this.memory=e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,e.sweep_live_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,e.sweep_live_output(this.handle,c),128));if(initial)this.set(SWEEP_INITIAL,0,origin);}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Sweep disposed');}
 check(ok,operation){if(!ok)throw Error('Sweep rejected '+operation);}
 sync(frame){this.alive();this.check(this.e.sweep_live_sync(this.handle,frame),'sync');}
 capacity(count,author){this.alive();return!!this.e.sweep_live_capacity(this.handle,count,author);}
 set({lowpass=22000,highpass=10,resonance=Math.SQRT1_2}={},tc=.1,author=this.stat(0),seconds=author/this.rate){this.alive();this.check(this.e.sweep_live_set(this.handle,lowpass,highpass,resonance,tc,author,seconds),'complete-set');}
 render(channels,pulled=true){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||typeof pulled!=='boolean'||this.e.memory.buffer!==this.memory)throw Error('Sweep render contract differs');this.check(this.e.sweep_live_render(this.handle,channels,+pulled),'render');}
 curve(lane,index){this.alive();return this.e.sweep_live_curve(this.handle,lane,index);}
 target(lane){this.alive();return this.e.sweep_live_target(this.handle,lane);}
 stat(index){this.alive();return this.e.sweep_live_stat(this.handle,index);}
 stats(){this.alive();return Object.fromEntries(SWEEP_LIVE_STATS.map((k,i)=>[k,this.e.sweep_live_stat(this.handle,i)]));}
 observed(){this.alive();const values=[0,1,2,3].map(i=>this.curve(i,127));return{frame:this.stat(0),values,isOpen:values[0]>=22000*.95&&values[1]<=10*1.5,scope:'Last prepared/rendered Rust parameter values; not a synchronous Native AudioParam.value getter'};}
 dispose(){if(this.handle){this.e.sweep_live_free(this.handle);this.handle=0;this.input=this.output=this.memory=null;}}
}
