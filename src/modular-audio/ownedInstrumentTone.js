export const INSTRUMENT_TONE_MODES=Object.freeze({filter:0,eq2:1,'eq2-filter':2});
export const INSTRUMENT_TONE_STATS=Object.freeze(['frame','peak','calls','commands','rejected','renderedFrames','unpulledFrames','late','mainThreadClamps','mode','channels','filterType']);
/** Explicit numerical stage. Observations are actual Rust samples; synchronous
 * AudioParam.value getters and outside AudioParam signal connections are absent. */
export class OwnedInstrumentTone{
 constructor(e,rate,{mode='filter',channels=2,origin=0}={}){if(e.instrument_tone_api?.()!==1||!Object.hasOwn(INSTRUMENT_TONE_MODES,mode)||![1,2].includes(channels)||!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Instrument tone ABI/profile differs');this.e=e;this.rate=rate;this.mode=mode;this.channels=channels;this.handle=e.instrument_tone_new(rate,channels,INSTRUMENT_TONE_MODES[mode]);if(!this.handle)throw Error('Instrument tone allocation failed');try{this.check(e.instrument_tone_prepare(this.handle,origin),'prepare');this.memory=e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,e.instrument_tone_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,e.instrument_tone_output(this.handle,c),128));}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Instrument tone disposed');}
 check(ok,method){if(!ok)throw Error('Instrument tone rejected '+method);}
 sync(frame){this.alive();this.check(this.e.instrument_tone_sync(this.handle,frame),'Native frame');}
 command(lane,op,value,tau,author=this.stat(0),seconds=author/this.rate){this.alive();if(!Number.isInteger(lane)||lane<0||lane>=16||![0,2,3,4].includes(op))throw Error('Invalid tone lane/opcode');this.check(this.e.instrument_tone_command(this.handle,lane,op,value,tau,author,seconds),'command');}
 setType(kind,author=this.stat(0)){this.alive();if(!Number.isInteger(kind)||kind<0||kind>6)throw Error('Invalid filter type');this.check(this.e.instrument_tone_type(this.handle,kind,author),'type');}
 credit(lane,count,author=this.stat(0)){this.alive();if(!Number.isInteger(lane)||lane<0||lane>=16||!Number.isInteger(count)||count<0||count>256)throw Error('Invalid tone credit query');return!!this.e.instrument_tone_credit(this.handle,lane,count,author);}
 render(channels,pulled=true){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||typeof pulled!=='boolean'||this.e.memory.buffer!==this.memory)throw Error('Tone render layout/memory differs');this.check(this.e.instrument_tone_render(this.handle,channels,+pulled),'render');}
 curve(lane,index){this.alive();return this.e.instrument_tone_curve(this.handle,lane,index);}
 target(lane){this.alive();return this.e.instrument_tone_target(this.handle,lane);}
 stat(index){this.alive();return this.e.instrument_tone_stat(this.handle,index);}
 stats(){this.alive();return Object.fromEntries(INSTRUMENT_TONE_STATS.map((key,i)=>[key,this.stat(i)]));}
 dispose(){if(this.handle){this.e.instrument_tone_free(this.handle);this.handle=0;this.input=this.output=this.memory=null;}}
}
