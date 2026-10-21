import React,{createContext,useContext,useState} from 'react';
import {Choice,Fader} from './controls';
import EnvShapeEditor from './EnvShapeEditor';
import {SHAPE_KEYS} from './envShape';
import {SPACE_KEYS} from '../effects/params';

export const EnsemblePanelContext=createContext(null);
export function useEnsemblePanel(){return useContext(EnsemblePanelContext);}
// The page's libraries (factory banks on this machine, imported files) as shelves above the
// panel; a patch chosen there becomes this line's sound through the host's choose().
function Libraries({libraries,values,host}){
 const [open,setOpen]=useState(null),library=libraries.find(l=>l.id===open);
 return <div className="embedded-libraries"><div role="radiogroup" aria-label="Sound library"><span>Libraries</span>{libraries.map(l=><button type="button" key={l.id} role="radio" aria-checked={open===l.id} onClick={()=>setOpen(open===l.id?null:l.id)}>{l.label}</button>)}</div>
  {library&&<div className="embedded-library">{library.render({choose:host.choose,values,current:host.current})}</div>}</div>;
}
export default function EmbeddedShell({synth,className='',panelClassName='',children,expand,nav,libraries=[]}){
 const host=useEnsemblePanel(),{values,onChange}=host,[shapeOpen,setShapeOpen]=useState(null),BY_KEY=synth.params.BY_KEY;
 const replaceValues=next=>onChange(synth.params.sanitize(next));
 const change=(key,value)=>{const next={...values};for(const k of expand?.(key)??[key])next[k]=value;replaceValues(next);};
 const control=(entry,tone,prefix='')=>{
  const [key,label]=Array.isArray(entry)?[prefix+entry[0],entry[1]]:[prefix+entry],spec=BY_KEY[key];
  return spec.options?<Choice key={key} spec={spec} value={values[key]} options={spec.options} onChange={change} tone={tone} label={label??spec.label}/>:<Fader key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={label??spec.label}/>;
 };
 const group=({title,tone,keys,shape},prefix='')=>{
  if(keys.every(k=>SPACE_KEYS.includes(prefix+(Array.isArray(k)?k[0]:k))))return null;
  const shaped=shape&&BY_KEY[SHAPE_KEYS[shape.env].mode],id=title+'|'+prefix,open=shaped&&shapeOpen?.id===id;
  const stage=key=>typeof key==='function'?key(values,prefix):values[prefix+key];
  return <section className="group" key={title} style={{'--n':keys.length}}><h3>{title}{shaped&&<button className="shape-open" onClick={e=>setShapeOpen(open?null:{id,anchor:e.currentTarget})}>Shape</button>}</h3><div className="group-controls">{keys.map(k=>control(k,tone,prefix))}</div>{open&&<EnvShapeEditor env={shape.env} title={title} values={values} BY_KEY={BY_KEY} change={change} anchor={shapeOpen.anchor} onClose={()=>setShapeOpen(null)} times={{A:stage(shape.a),D:stage(shape.d),R:stage(shape.r),sustain:stage(shape.s)}}/>}</section>;
 };
 return <div className={'instrument embedded-instrument '+className}>{nav}{host.choose&&libraries.length>0&&<Libraries libraries={libraries} values={values} host={host}/>}<div className={'panel '+panelClassName}>{children({values,control,group,change,replaceValues,patch:{current:{values}}})}</div></div>;
}
