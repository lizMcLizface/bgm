import React,{useCallback,useState} from 'react';
import {Fader,Choice,Toggle,Lever,Dial} from './controls';
import EnvShapeEditor from './EnvShapeEditor';
import {SHAPE_KEYS} from './envShape';
import {SPACE_KEYS} from '../effects/params';

// The builders every synth page's panel is drawn with: control(entry,tone) a fader, knob, switch or choice of a parameter, and group({title,tone,keys,shape}) a box of them
// (with the envelope curve editor when it has a shape). `values` are the parameter values shown, `change(key,value)` what a move of one does. The standalone shell
// (SynthShell), the ensemble's embedded one and the voices of /synths/all (BoundShell) all build their panels with these.
export function usePanelKit({BY_KEY,values,change,toggles=false}){
 const [shapeOpen,setShapeOpen]=useState(null);
 const closeShape=useCallback(()=>setShapeOpen(null),[]);
 // Keys are parameter keys, or [key, label] where the table's label is ambiguous.
 const control=(entry,tone,prefix='',under=null)=>{
  const [key,label]=Array.isArray(entry)?[prefix+entry[0],entry[1]]:[prefix+entry];
  const spec=BY_KEY[key],short=label??spec.label;
  if(Array.isArray(entry)&&entry[2]==='knob'&&!spec.options)return <Dial key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={short}/>;
  if(toggles&&Array.isArray(entry)&&entry[2]==='switch'&&spec.options?.length===2)return <Lever key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={short}>{under}</Lever>;
  if(isToggle(entry,prefix))return <Toggle key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={short}/>;
  return spec.options
   ?<Choice key={key} spec={spec} value={values[key]} options={spec.options} onChange={change} tone={tone} label={short}/>
   :<Fader key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={short}/>;
 };
 // toggles: two-way choices are push buttons, and neighbours stack in one column
 const isSwitch=(entry,prefix)=>toggles&&Array.isArray(entry)&&entry[2]==='switch'&&BY_KEY[prefix+entry[0]]?.options?.length===2;
 const isToggle=(entry,prefix)=>toggles&&!isSwitch(entry,prefix)&&BY_KEY[prefix+(Array.isArray(entry)?entry[0]:entry)]?.options?.length===2;
 // a toggle switch starts a column; the push buttons after it (and any run of them) stack beneath
 const layout=(keys,tone,prefix)=>{
  const out=[];
  for(const k of keys){
   const sw=isSwitch(k,prefix);
   if(!sw&&!isToggle(k,prefix)){out.push(control(k,tone,prefix));continue;}
   const last=out[out.length-1];
   if(!sw&&last?.stack)last.items.push(k);else out.push({stack:true,items:[k]});
  }
  return out.map((o,i)=>!o.stack?o:isSwitch(o.items[0],prefix)
   ?control(o.items[0],tone,prefix,o.items.length>1?o.items.slice(1).map(k=>control(k,tone,prefix)):null)
   :<div className="toggle-stack" key={'t'+i}>{o.items.map(k=>control(k,tone,prefix))}</div>);
 };
 // shape: {env:'amp'|'filter', a, d, s, r} adds the envelope curve editor; stage
 // entries are keys (prefixed like the group's) or functions of (values, prefix).
 const group=({title,tone,keys,shape,keep},prefix='')=>{
  // keep: show the group even where the effects rack owns its keys (the V 80's chorus)
  if(!keep&&keys.every(k=>SPACE_KEYS.includes(prefix+(Array.isArray(k)?k[0]:k))))return null;
  const shaped=shape&&BY_KEY[SHAPE_KEYS[shape.env].mode],id=title+'|'+prefix,open=shaped&&shapeOpen?.id===id;
  const stage=key=>typeof key==='function'?key(values,prefix):values[prefix+key];
  return <section className="group" key={title} style={{'--n':keys.length}}>
   <h3>{title}{shaped&&<button type="button" className="shape-open" aria-expanded={!!open} title="Envelope curves" onClick={e=>{const anchor=e.currentTarget;setShapeOpen(o=>o?.id===id?null:{id,anchor});}}>Shape</button>}</h3>
   <div className="group-controls">{layout(keys,tone,prefix)}</div>
   {open&&<EnvShapeEditor env={shape.env} title={title} values={values} BY_KEY={BY_KEY} change={change} anchor={shapeOpen.anchor} onClose={closeShape}
    times={{A:stage(shape.a),D:stage(shape.d),R:stage(shape.r),sustain:stage(shape.s)}}/>}
  </section>;
 };
 return {control,group};
}
