// Explicit seeded portable contract for the actual Shimmer/Freeze worklet DSP.
// This does not select the native live backend or replace its Math.random.
export const VOICE_FX_KINDS=Object.freeze(['shimmer','freeze']);
export const VOICE_FX_RANDOM='xorshift32-v1';
export const VOICE_FX_PARAMETERS=Object.freeze({shimmer:[['mix',0,1,0],['decay',.3,30,6],['semitones',0,24,12],['climb',0,.95,.5],['tone',500,16000,7000]],freeze:[['mix',0,1,0],['hold',0,1,0],['length',.25,4,2],['fade',.02,30,1]]});
export function validateOwnedVoiceFxSpec(raw){
 const c=JSON.parse(JSON.stringify(raw)),parameters=VOICE_FX_PARAMETERS[c?.kind];
 if(c?.version!==1||!parameters||c.random!==VOICE_FX_RANDOM||!Number.isInteger(c.seed)||c.seed<1||c.seed>0xffffffff||!Array.isArray(c.parameters)||c.parameters.length!==parameters.length)throw Error('Invalid owned voice FX configuration');
 const ids=new Set();for(const p of c.parameters){if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||ids.has(p[0]))throw Error('Invalid voice FX parameter identity');const d=parameters[p[0]],v=p[1];if(!d||typeof v!=='number'||!Number.isFinite(v)||v<d[1]||v>d[2]||c.kind==='freeze'&&p[0]===1&&v!==0&&v!==1)throw Error('Invalid voice FX parameter value');ids.add(p[0]);}
 return c;
}
export function ownedVoiceFxSpec(kind,settings={},seed=109){const list=VOICE_FX_PARAMETERS[kind];if(!list)throw Error('Unknown voice FX kind');return validateOwnedVoiceFxSpec({version:1,kind,seed,random:VOICE_FX_RANDOM,parameters:list.map(([name,,,value],index)=>{let v=settings[name]??value;if(name==='hold'&&typeof v==='boolean')v=Number(v);return [index,v];})});}
export const saveOwnedVoiceFxSpec=s=>JSON.stringify(validateOwnedVoiceFxSpec(s),null,2)+'\n';
export const loadOwnedVoiceFxSpec=text=>validateOwnedVoiceFxSpec(JSON.parse(text));
export class OwnedVoiceFx {
 constructor(engine,spec,rate){
  if(!Number.isInteger(rate)||rate<8000||rate>192000||engine.voice_fx_owned_api()!==1)throw Error('Owned voice FX ABI/rate');this.e=engine;this.spec=validateOwnedVoiceFxSpec(spec);this.rate=rate;
  this.handle=engine.voice_fx_owned_new(VOICE_FX_KINDS.indexOf(this.spec.kind)+1,rate,this.spec.seed);if(!this.handle)throw Error('Owned voice FX preparation failed');
  try{for(const p of this.spec.parameters)this.accept(engine.voice_fx_owned_param(this.handle,...p));this.refresh();}catch(e){this.dispose();throw e;}
 }
 accept(value){if(!value)throw Error('Owned voice FX operation rejected');}
 alive(){if(!this.handle)throw Error('Disposed voice FX');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.voice_fx_owned_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.voice_fx_owned_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048)throw Error('Owned voice FX block bounds');if(this.memory!==this.e.memory.buffer)throw Error('Voice FX memory grew; refresh outside render');this.accept(this.e.voice_fx_owned_render(this.handle,frames));}
 patch(parameters){this.alive();if(!Array.isArray(parameters))throw Error('Invalid voice FX edit');const merged=new Map(this.spec.parameters),ids=new Set();for(const p of parameters){if(!Array.isArray(p)||p.length!==2||ids.has(p[0]))throw Error('Invalid voice FX edit');ids.add(p[0]);merged.set(p[0],p[1]);}const next=validateOwnedVoiceFxSpec({...this.spec,parameters:[...merged]});for(const p of next.parameters)this.accept(this.e.voice_fx_owned_param(this.handle,...p));this.spec=next;}
 clear(){this.alive();this.e.voice_fx_owned_clear(this.handle);}
 reset(){this.alive();this.e.voice_fx_owned_reset(this.handle);}
 stats(){this.alive();return {peak:this.e.voice_fx_owned_stat(this.handle,0),frame:this.e.voice_fx_owned_stat(this.handle,1),energyOrClouds:this.e.voice_fx_owned_stat(this.handle,2),captures:this.e.voice_fx_owned_stat(this.handle,3),randomDraws:this.e.voice_fx_owned_stat(this.handle,4),waiting:!!this.e.voice_fx_owned_stat(this.handle,5),randomState:this.e.voice_fx_owned_stat(this.handle,6)};}
 dispose(){if(this.handle){this.e.voice_fx_owned_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
