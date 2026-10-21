// A flat panel/storage view of the existing lab patches. The source schemas
// remain authoritative; no oscillator, envelope or filter is reimplemented here.
import {defineParams} from '../params';
import {GLOBAL,LAYER,RECIPES,initialPatch,sanitizePatch} from '../../synth-lab/patch';
import {FM_GLOBAL,FM_OPERATOR,FM_RECIPES,initialFM,sanitizeFM,topology} from '../../synth-lab/fmPatch';
import {EFFECTS} from '../../synth-lab/effectsConfig';
import {INSERTS} from '../../synth-lab/insertsConfig';

function schema(fm){
 const fields=[];
 const add=(prefix,defs)=>defs.forEach(([key,label,min,max,step,value])=>fields.push({key:`${prefix}.${key}`,label,min,max,step,value}));
 add('global',fm?FM_GLOBAL:GLOBAL);
 for(let i=0;i<(fm?6:2);i++)add(`${fm?'operators':'layers'}.${i}`,fm?FM_OPERATOR:LAYER);
 add('effects',EFFECTS);add('inserts',INSERTS);
 add('performance',[['mode','Voice mode',0,2,1,0],['portamento','Portamento · s',0,3,.01,0],['glide','Glide',0,1,1,0]]);
 if(fm)for(let i=0;i<6;i++){
  fields.push({key:`carriers.${i}`,label:`Operator ${i+1} to output`,min:0,max:1,step:.01,value:i%2});
  for(let j=i+1;j<6;j++)fields.push({key:`routes.${i}.${j}`,label:`Operator ${i+1} → ${j+1}`,min:0,max:2,step:.01,value:j===i+1&&i%2===0?1:0});
 }
 const params=defineParams(fields.map((f,id)=>{
  const unit=/· Hz/.test(f.label)?'Hz':/· s$|seconds$/.test(f.label)?'s':/· ms/.test(f.label)?'ms':/· dB/.test(f.label)?'dB':/· cents/.test(f.label)?'ct':/· semitones/.test(f.label)?'st':/· octaves/.test(f.label)?'oct':f.step===1?'n':f.min<0?'bi':f.max<=1?'%':'decimal';
  const curve=f.step===1?'step':f.min>0&&f.max/f.min>=100?'log':f.min===0&&f.max>=3?'sq':'lin';
  return [f.key,id,f.label,f.min,f.max,f.value,unit,curve];
 }));
 const native=fm?sanitizeFM:sanitizePatch;
 const flatten=patch=>Object.fromEntries(fields.map(f=>{
  const value=f.key.split('.').reduce((o,k)=>o?.[k],patch);
  return [f.key,f.key==='performance.glide'?(value==='always'?1:0):value??f.value];
 }));
 const inflate=values=>{
  const patch=fm?initialFM():initialPatch();
  for(const [key,value] of Object.entries(params.sanitize(values))){
   const parts=key.split('.'),last=parts.pop(),target=parts.reduce((o,k)=>o[k],patch);
   target[last]=key==='performance.glide'?(value?'always':'overlap'):value;
  }
  return native(patch);
 };
 return {params,flatten,inflate,presets:(fm?FM_RECIPES:RECIPES).map(p=>({name:p.name,...(fm?FM_SOUNDS:POLY_SOUNDS)[p.name],values:flatten(native(p)),colour:fm?'#9b86e5':'#63c5b6'})),categories:fm?FM_CATEGORIES:POLY_CATEGORIES};
}
// Each DIY synth's own sound categories and where its recipes sit in them.
const POLY_CATEGORIES=[
 {id:'strings',label:'Silk & strings',blurb:'Bowed and ensemble layers'},
 {id:'pads',label:'Pads & motion',blurb:'Dark layers, chorus and independent movement'},
 {id:'brass',label:'Brass & leads',blurb:'Five-voice brass, pressure and sync'},
 {id:'pulse',label:'Pulses & sequences',blurb:'Woody and resonant, for patterns'},
];
const POLY_SOUNDS={
 'Five-voice brass':{category:'brass',styles:['warm']},'Slow pressure lead':{category:'brass',styles:['touch','lead']},'Sync sweep':{category:'brass',styles:['sync','sweep']},
 'Eight-voice silk':{category:'strings',styles:['soft','wide']},'Living silk':{category:'strings',styles:['evolving']},'Rosin silk':{category:'strings',styles:['bowed']},
 'Layered noir':{category:'pads',styles:['dark','layered']},'DCO chorus pad':{category:'pads',styles:['warm','chorus']},'Independent poly motion':{category:'pads',styles:['evolving']},
 'Resonant sequence':{category:'pulse',styles:['resonant','rhythmic']},'Wooden pulse':{category:'pulse',styles:['woody']},
};
const FM_CATEGORIES=[
 {id:'keys',label:'Keys & organ',blurb:'Tines and parallel drawbars'},
 {id:'glass',label:'Glass & bells',blurb:'Bright, inharmonic and bowed'},
 {id:'breath',label:'Reeds, brass & air',blurb:'Breathing, hollow and choral'},
 {id:'bass',label:'Bass',blurb:'Round four-operator low end'},
];
const FM_SOUNDS={
 'Tine constellation':{category:'keys',styles:['tine','bright']},'Parallel drawbars':{category:'keys',styles:['organ']},
 'Glass satellites':{category:'glass',styles:['glassy']},'Bowed glass pad':{category:'glass',styles:['bowed','pad']},'Fixed orbit bells':{category:'glass',styles:['bell','inharmonic']},'Living glass':{category:'glass',styles:['evolving']},
 'Breathing FM brass':{category:'breath',styles:['brass','touch']},'Four-op hollow reed':{category:'breath',styles:['reedy','hollow']},'Air choir':{category:'breath',styles:['airy','choir']},'Air reed':{category:'breath',styles:['airy','reedy']},
 'Four-op round bass':{category:'bass',styles:['round']},
};
export const POLY=schema(false),FM=schema(true);
export function applyTopology(values,count,algorithm){
 const next={...values,'global.operators':count,'global.algorithm':algorithm},t=topology(count,algorithm);
 for(let i=0;i<6;i++){
  next[`carriers.${i}`]=t.carriers[i];
  for(let j=i+1;j<6;j++)next[`routes.${i}.${j}`]=t.routes[i][j];
 }
 next['global.feedbackOp']=Math.min(next['global.feedbackOp'],count-1);
 return next;
}
