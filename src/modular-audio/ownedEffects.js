// Prepared owned effects contract v1. I/O views are made only outside render.
import {EFFECTS,effectTriples} from '../synth-lab/effectsConfig.js';
const validFrame=n=>Number.isInteger(n)&&n>=0&&n<=2048;
export function validateOwnedEffectsSpec(raw){
 const c=JSON.parse(JSON.stringify(raw));
 if(c?.version!==1||!Array.isArray(c.parameters)||c.parameters.length!==EFFECTS.length)throw Error('Invalid owned effects configuration');
 const ids=new Set();for(const pair of c.parameters){if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||ids.has(pair[0]))throw Error('Invalid owned effects parameter identity');const d=EFFECTS[pair[0]],v=pair[1];if(!d||typeof v!=='number'||!Number.isFinite(v)||v<d[2]||v>d[3])throw Error('Invalid owned effects parameter value');ids.add(pair[0]);}
 return c;
}
export const ownedEffectsSpec=settings=>({version:1,parameters:effectTriples(settings)});
export const saveOwnedEffectsSpec=spec=>JSON.stringify(validateOwnedEffectsSpec(spec),null,2)+'\n';
export const loadOwnedEffectsSpec=text=>validateOwnedEffectsSpec(JSON.parse(text));
export class OwnedEffects{
 constructor(engine,spec,rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000||engine.fx_owned_api()!==1)throw Error('Owned effects ABI/rate');
  this.e=engine;this.spec=validateOwnedEffectsSpec(spec);this.rate=rate;this.handle=engine.fx_owned_new(rate);if(!this.handle)throw Error('Owned effects preparation failed');
  try{for(const pair of this.spec.parameters)if(!engine.fx_owned_param(this.handle,...pair))throw Error('Owned effects parameter rejected');this.refresh();}catch(e){this.dispose();throw e;}
 }
 alive(){if(!this.handle)throw Error('Disposed effects');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=Array.from({length:6},(_,ch)=>new Float32Array(this.memory,this.e.fx_owned_input(this.handle,ch),2048));this.output=Array.from({length:2},(_,ch)=>new Float32Array(this.memory,this.e.fx_owned_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames){this.alive();if(!validFrame(frames))throw Error('Owned effects block bounds');if(this.memory!==this.e.memory.buffer)throw Error('Owned effects memory grew; refresh outside render');if(!this.e.fx_owned_render(this.handle,frames))throw Error('Owned effects render rejected');}
 patch(parameters){this.alive();if(!Array.isArray(parameters))throw Error('Invalid owned effects edit');const merged=new Map(this.spec.parameters),ids=new Set();for(const pair of parameters){if(!Array.isArray(pair)||pair.length!==2||ids.has(pair[0]))throw Error('Invalid owned effects edit');ids.add(pair[0]);merged.set(pair[0],pair[1]);}const next=validateOwnedEffectsSpec({version:1,parameters:[...merged]});for(const pair of next.parameters)if(!this.e.fx_owned_param(this.handle,...pair))throw Error('Owned effects edit rejected');this.spec=next;}
 clear(){this.alive();this.e.fx_owned_clear(this.handle);}
 reset(){this.alive();this.e.fx_owned_reset(this.handle);}
 stats(){this.alive();return {peak:this.e.fx_owned_stat(this.handle,0),frame:this.e.fx_owned_stat(this.handle,2),sleeping:!!this.e.fx_owned_stat(this.handle,1),internal:this.e.fx_owned_stat(this.handle,3),reverbActive:!!this.e.fx_owned_stat(this.handle,4),reverbFrames:this.e.fx_owned_stat(this.handle,5)};}
 dispose(){if(this.handle){this.e.fx_owned_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
