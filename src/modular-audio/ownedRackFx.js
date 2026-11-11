// Owned versions of the existing three rack worklets. Values are k-rate per
// render call; hosts must preserve the original callback cadence when comparing.
import {ZPLANE_SHAPES,FLAT_ROWS} from '../synths/effects/zplaneShapes.js';
export const RACK_FX_KINDS=Object.freeze(['crusher','pitch','zplane']);
export const RACK_FX_PARAMETERS=Object.freeze({crusher:[['bits',2,16,8],['divide',1,32,1],['mix',0,1,1]],pitch:[['semitones',-24,24,-12],['cents',-50,50,0],['mix',0,1,.5]],zplane:[['a',0,63,0],['b',0,63,2],['morph',0,1,0],['shift',-1,1,0],['q',0,1,.5],['mix',0,1,1]]});
const rows=raw=>Array.isArray(raw)&&raw.length===12&&raw.every(r=>Array.isArray(r)&&r.length===3&&r.every(Number.isFinite)&&r[0]>=20&&r[0]<=12000&&r[1]>=8&&r[1]<=8000&&r[2]>=-30&&r[2]<=30);
export function validateOwnedRackFxSpec(raw){
 const c=JSON.parse(JSON.stringify(raw)),parameters=RACK_FX_PARAMETERS[c?.kind];
 if(c?.version!==1||!parameters||!Array.isArray(c.parameters)||c.parameters.length!==parameters.length)throw Error('Invalid owned rack FX configuration');
 const ids=new Set();for(const p of c.parameters){if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||ids.has(p[0]))throw Error('Invalid rack FX parameter identity');const d=parameters[p[0]],v=p[1];if(!d||typeof v!=='number'||!Number.isFinite(v)||v<d[1]||v>d[2])throw Error('Invalid rack FX parameter value');ids.add(p[0]);}
 if(c.kind==='zplane'){if(!Array.isArray(c.shapes)||c.shapes.length<1||c.shapes.length>64||c.shapes.some(s=>!rows(s))||!rows(c.custom?.a)||!rows(c.custom?.b))throw Error('Invalid rack FX shapes');}
 else if(c.shapes!==undefined||c.custom!==undefined)throw Error('Shapes require z-plane');
 return c;
}
export function ownedRackFxSpec(kind,settings={}){
 const list=RACK_FX_PARAMETERS[kind];if(!list)throw Error('Unknown rack FX kind');
 return validateOwnedRackFxSpec({version:1,kind,parameters:list.map(([name,,,value],id)=>[id,settings[name]??value]),...(kind==='zplane'?{shapes:ZPLANE_SHAPES.map(s=>s.sections),custom:{a:FLAT_ROWS,b:FLAT_ROWS}}:{})});
}
export const saveOwnedRackFxSpec=c=>JSON.stringify(validateOwnedRackFxSpec(c),null,2)+'\n';
export const loadOwnedRackFxSpec=text=>validateOwnedRackFxSpec(JSON.parse(text));
export class OwnedRackFx {
 constructor(engine,spec,rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000||engine.rack_fx_owned_api()!==1)throw Error('Owned rack FX ABI/rate');this.e=engine;this.spec=validateOwnedRackFxSpec(spec);this.rate=rate;
  this.handle=engine.rack_fx_owned_new(RACK_FX_KINDS.indexOf(this.spec.kind)+1,rate);if(!this.handle)throw Error('Owned rack FX preparation failed');
  try{for(const p of this.spec.parameters)this.accept(engine.rack_fx_owned_param(this.handle,...p));if(this.spec.kind==='zplane'){this.accept(engine.rack_fx_owned_shape_count(this.handle,this.spec.shapes.length));this.spec.shapes.forEach((shape,id)=>shape.forEach((row,section)=>this.accept(engine.rack_fx_owned_shape_row(this.handle,id,section,...row))));this.uploadCustom(this.spec.custom);}this.accept(engine.rack_fx_owned_prepare(this.handle));this.refresh();}catch(e){this.dispose();throw e;}
 }
 accept(value){if(!value)throw Error('Owned rack FX operation rejected');}
 alive(){if(!this.handle)throw Error('Disposed rack FX');}
 uploadCustom(custom){for(const [side,key]of ['a','b'].entries())custom[key].forEach((row,section)=>this.accept(this.e.rack_fx_owned_shape_row(this.handle,64+side,section,...row)));}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.rack_fx_owned_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.rack_fx_owned_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048)throw Error('Owned rack FX block bounds');if(this.memory!==this.e.memory.buffer)throw Error('Rack FX memory grew; refresh outside render');this.accept(this.e.rack_fx_owned_render(this.handle,frames));}
 patch(parameters){this.alive();if(!Array.isArray(parameters))throw Error('Invalid rack FX edit');const merged=new Map(this.spec.parameters),ids=new Set();for(const p of parameters){if(!Array.isArray(p)||p.length!==2||ids.has(p[0]))throw Error('Invalid rack FX edit');ids.add(p[0]);merged.set(p[0],p[1]);}const next=validateOwnedRackFxSpec({...this.spec,parameters:[...merged]});for(const p of next.parameters)this.accept(this.e.rack_fx_owned_param(this.handle,...p));this.spec=next;}
 setCustom(custom){this.alive();const next=validateOwnedRackFxSpec({...this.spec,custom});this.uploadCustom(next.custom);this.spec=next;}
 clear(){this.alive();this.e.rack_fx_owned_clear(this.handle);}
 reset(){this.alive();this.e.rack_fx_owned_reset(this.handle);}
 stats(){this.alive();return {peak:this.e.rack_fx_owned_stat(this.handle,0),frame:this.e.rack_fx_owned_stat(this.handle,1),usedSections:this.e.rack_fx_owned_stat(this.handle,2),windowFrames:this.e.rack_fx_owned_stat(this.handle,3)};}
 dispose(){if(this.handle){this.e.rack_fx_owned_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
