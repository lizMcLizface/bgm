export const INSTRUMENT_CRUSHER_PROFILE='original-instrument-bitcrusher-v1';
export const INSTRUMENT_CRUSHER_STATS=Object.freeze(['frame','peak','origin','calls','commands','rejected','rawFrames','unpulledFrames','phaser','last','channels','generation','active','step']);
/** Explicit canonical128 kernel. Raw first-plane output and complete dry/wet
 * mix are separate contracts; no Native automatic-tail/ScriptProcessor claim. */
export class OwnedInstrumentCrusher{
 constructor(e,rate,{origin=0,channels=2}={}){if(e.instrument_crusher_api?.()!==1||!Number.isInteger(rate)||rate<8000||rate>192000||![1,2].includes(channels))throw Error('Original BitCrusher ABI/rate/layout differs');this.e=e;this.rate=rate;this.channels=channels;this.handle=e.instrument_crusher_new(rate,channels);if(!this.handle)throw Error('Original BitCrusher allocation failed');try{this.check(e.instrument_crusher_prepare(this.handle,origin),'prepare');this.memory=e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,e.instrument_crusher_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,e.instrument_crusher_output(this.handle,c),128));}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Original BitCrusher disposed');}
 check(ok,operation){if(!ok)throw Error('Original BitCrusher rejected '+operation);}
 sync(frame){this.alive();this.check(this.e.instrument_crusher_sync(this.handle,frame),'sync');}
 capacity(lane,count,author=this.stat(0)){this.alive();return!!this.e.instrument_crusher_capacity(this.handle,lane,count,author);}
 set(lane,value,author=this.stat(0),seconds=author/this.rate){this.alive();this.check(this.e.instrument_crusher_set(this.handle,lane,value,author,seconds),'control');}
 birth(bits=8,normfreq=.25){this.alive();this.check(this.e.instrument_crusher_birth(this.handle,bits,normfreq),'birth');}
 retire(){this.alive();this.check(this.e.instrument_crusher_retire(this.handle),'retire');}
 render(channels,{pulled=true,rawPulled=!!this.stat(12),mix=true}={}){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||[pulled,rawPulled,mix].some(v=>typeof v!=='boolean')||this.e.memory.buffer!==this.memory)throw Error('Original BitCrusher render contract differs');this.check(this.e.instrument_crusher_render(this.handle,channels,+pulled,+rawPulled,+mix),'render');}
 stat(i){this.alive();return this.e.instrument_crusher_stat(this.handle,i);}
 stats(){this.alive();return Object.fromEntries(INSTRUMENT_CRUSHER_STATS.map((key,i)=>[key,this.stat(i)]));}
 target(i){this.alive();return this.e.instrument_crusher_target(this.handle,i);}
 curve(lane,i){this.alive();return this.e.instrument_crusher_curve(this.handle,lane,i);}
 observed(){this.alive();return{frame:this.stat(0),values:[0,1,2,3].map(i=>this.curve(i,127)),scope:'Last actual Rust preparation values; NOT synchronous Native AudioParam.value getter'};}
 dispose(){if(this.handle){this.e.instrument_crusher_free(this.handle);this.handle=0;this.memory=this.input=this.output=null;}}
}
