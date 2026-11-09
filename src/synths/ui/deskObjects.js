import {load,save} from '../storage';

export const OBJECT_LAYOUT_VERSION=1;
const finite=(x,limit=1e6)=>Number.isFinite(x)&&Math.abs(x)<=limit;
const text=(x,max=160)=>typeof x==='string'&&x.length>0&&x.length<=max;
const kinds=['surface','instrument','effects','keyboard','scope','utility'];
export function validObjectLayout(value){
 if(value?.version!==OBJECT_LAYOUT_VERSION||!Array.isArray(value.objects)||value.objects.length>512)return false;
 const ids=new Set(),bindings=new Set();
 return value.objects.every(o=>{
  if(!o||!text(o.id,96)||!/^[a-zA-Z0-9:_-]+$/.test(o.id)||ids.has(o.id)||!text(o.binding)||bindings.has(o.binding)||!kinds.includes(o.kind)||!text(o.label)||typeof o.visible!=='boolean'||!Number.isInteger(o.z)||o.z<0||o.z>1e9)return false;
  ids.add(o.id);bindings.add(o.binding);
  return o.size&&finite(o.size.w,1e5)&&o.size.w>=0&&finite(o.size.h,1e5)&&o.size.h>=0&&(o.pose===null||o.pose&&finite(o.pose.x)&&finite(o.pose.y)&&finite(o.pose.angle,180));
 });
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Deterministic shelf packing in desk units, independent of zoom and z order. */
export function spreadObjectPoses(objects,{width=3000,gap=48,aspect}={}){
 if(objects.length&&Number.isFinite(aspect)&&aspect>0){
  const widest=Math.max(...objects.map(o=>o.size.w)),total=objects.reduce((n,o)=>n+o.size.w+gap,0)-gap;
  let best,score=Infinity;
  // Compare shelf widths against the viewport, so a large catalog fits both
  // wide and tall windows without changing the stable order of its objects.
  for(let i=0;i<=64;i++){
   const poses=spreadObjectPoses(objects,{width:widest+(total-widest)*i/64,gap});
   let w=0,h=0;
   for(const o of objects){const p=poses.get(o.id);w=Math.max(w,p.x+o.size.w);h=Math.max(h,p.y+o.size.h);}
   const fit=Math.max(w/aspect,h);
   if(fit<score){score=fit;best=poses;}
  }
  return best;
 }
 const result=new Map();let x=0,y=0,row=0;
 for(const object of objects){
  const w=Math.max(1,object.size.w),h=Math.max(1,object.size.h);
  if(x&&x+w>width){x=0;y+=row+gap;row=0;}
  result.set(object.id,{x,y,angle:0});x+=w+gap;row=Math.max(row,h);
 }
 return result;
}

/** Presentation bindings adapt old UI roles to opaque, persistent object IDs. */
export function createDeskObjects({storageKey,definitions=[],read=load,write=save,newId=()=>`obj-${crypto.randomUUID()}`}={}){
 const stored=read(storageKey,null),elements=new Map();
 let document=validObjectLayout(stored)?structuredClone(stored):{version:OBJECT_LAYOUT_VERSION,objects:[]},timer=null;
 const aliases=new Map(definitions.flatMap(d=>(d.keys??[d.binding]).map(key=>[key,d.binding])));
 const find=binding=>document.objects.find(o=>o.binding===(aliases.get(binding)??binding));
 const ensureDefinitions=()=>{
  for(const d of definitions){
   if(find(d.binding))continue;
   const old=d.offset?null:(d.keys??[d.binding]).map(key=>read(key,null)).find(p=>p&&finite(p.x)&&finite(p.y));
   const angle=(d.keys??[d.binding]).map(key=>read(key+':angle',null)).find(a=>finite(a,180))??0;
   document.objects.push({id:newId(),binding:d.binding,kind:d.kind,label:d.label,pose:old?{x:old.x,y:old.y,angle}:null,size:{w:0,h:0},visible:d.visible??true,z:60+document.objects.length});
  }
 };
 ensureDefinitions();
 const flush=()=>{clearTimeout(timer);timer=null;write(storageKey,document);};
 const changed=()=>{clearTimeout(timer);timer=setTimeout(flush,250);};
 const update=(binding,patch)=>{
  const o=find(binding);if(!o)return;
  const next={...o,...patch};if(equal(o,next))return;
  document={...document,objects:document.objects.map(item=>item===o?next:item)};changed();
 };
 const measure=binding=>{
  const adapter=elements.get(aliases.get(binding)??binding),data=adapter?.measure();
  if(data)update(binding,{size:{w:data.w,h:data.h},visible:data.visible});
 };
 const apply=binding=>{const o=find(binding);if(o)elements.get(o.binding)?.apply(o);};
 return {
  get:find,
  list:()=>document.objects.slice(),
  snapshot(){for(const binding of elements.keys())measure(binding);return structuredClone(document);},
  update,
  raise(binding){const z=Math.max(60,...document.objects.map(o=>o.z))+1;update(binding,{z});return z;},
  focus(binding){const z=Math.max(60,...document.objects.map(o=>o.z))+1;update(binding,{z});apply(binding);},
  attach(binding,adapter){
   const o=find(binding);if(!o)return ()=>{};
   elements.set(o.binding,adapter);measure(binding);
   return ()=>{if(elements.get(o.binding)===adapter)elements.delete(o.binding);};
  },
  measure,
  spread(options){
   for(const binding of elements.keys())measure(binding);
   const active=document.objects.filter(o=>o.visible&&elements.has(o.binding)&&o.size.w>0&&o.size.h>0),poses=spreadObjectPoses(active,options);
   document={...document,objects:document.objects.map(o=>poses.has(o.id)?{...o,pose:poses.get(o.id)}:o)};
   for(const o of active)apply(o.binding);changed();return active.length;
  },
  restore(value){
   if(!validObjectLayout(value))throw new Error('Invalid desk object layout');
   document=structuredClone(value);ensureDefinitions();
   for(const binding of elements.keys())apply(binding);changed();
  },
  clearPoses({apply:publish=false}={}){document={...document,objects:document.objects.map(o=>({...o,pose:null}))};if(publish)for(const binding of elements.keys())apply(binding);changed();},
  flush,
  dispose(){clearTimeout(timer);elements.clear();},
 };
}
