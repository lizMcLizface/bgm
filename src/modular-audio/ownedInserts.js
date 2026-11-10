// Prepared owned inserts contract v1. I/O views are made only outside render.
import {INSERTS,insertsPacket} from '../synth-lab/insertsConfig.js';
const validFrame=n=>Number.isInteger(n)&&n>=0&&n<=2048;
export function validateOwnedInsertsSpec(raw){
 const c=JSON.parse(JSON.stringify(raw));
 if(c?.version!==1||!Array.isArray(c.parameters)||c.parameters.length!==INSERTS.length)throw Error('Invalid owned inserts configuration');
 const ids=new Set();for(const pair of c.parameters){if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||ids.has(pair[0]))throw Error('Invalid owned inserts parameter identity');const d=INSERTS[pair[0]],v=pair[1];if(!d||typeof v!=='number'||!Number.isFinite(v)||v<d[2]||v>d[3])throw Error('Invalid owned inserts parameter value');ids.add(pair[0]);}
 return c;
}
export const ownedInsertsSpec=settings=>({version:1,parameters:insertsPacket(settings)});
export const saveOwnedInsertsSpec=spec=>JSON.stringify(validateOwnedInsertsSpec(spec),null,2)+'\n';
export const loadOwnedInsertsSpec=text=>validateOwnedInsertsSpec(JSON.parse(text));
export class OwnedInserts{
 constructor(engine,spec,rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000||engine.inserts_owned_api()!==1)throw Error('Owned inserts ABI/rate');
  this.e=engine;this.spec=validateOwnedInsertsSpec(spec);this.rate=rate;this.handle=engine.inserts_owned_new(rate);if(!this.handle)throw Error('Owned inserts preparation failed');
  try{for(const pair of this.spec.parameters)if(!engine.inserts_owned_param(this.handle,...pair))throw Error('Owned inserts parameter rejected');engine.inserts_owned_settle(this.handle);this.refresh();}catch(e){this.dispose();throw e;}
 }
 alive(){if(!this.handle)throw Error('Disposed inserts');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=Array.from({length:2},(_,ch)=>new Float32Array(this.memory,this.e.inserts_owned_input(this.handle,ch),2048));this.output=Array.from({length:2},(_,ch)=>new Float32Array(this.memory,this.e.inserts_owned_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames){this.alive();if(!validFrame(frames))throw Error('Owned inserts block bounds');if(this.memory!==this.e.memory.buffer)throw Error('Owned inserts memory grew; refresh outside render');if(!this.e.inserts_owned_render(this.handle,frames))throw Error('Owned inserts render rejected');}
 patch(parameters){this.alive();if(!Array.isArray(parameters))throw Error('Invalid owned inserts edit');const merged=new Map(this.spec.parameters),ids=new Set();for(const pair of parameters){if(!Array.isArray(pair)||pair.length!==2||ids.has(pair[0]))throw Error('Invalid owned inserts edit');ids.add(pair[0]);merged.set(pair[0],pair[1]);}const next=validateOwnedInsertsSpec({version:1,parameters:[...merged]});for(const pair of next.parameters)if(!this.e.inserts_owned_param(this.handle,...pair))throw Error('Owned inserts edit rejected');this.spec=next;}
 clear(){this.alive();this.e.inserts_owned_clear(this.handle);}
 reset(){this.alive();this.e.inserts_owned_reset(this.handle);}
 stats(){this.alive();return {peak:this.e.inserts_owned_stat(this.handle,0),frame:this.e.inserts_owned_stat(this.handle,1)};}
 dispose(){if(this.handle){this.e.inserts_owned_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
