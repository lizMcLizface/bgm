import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Fader,Lever} from '../ui/controls';
import useFloating from '../ui/useFloating';
import {defineParams} from '../params';
import {tuning,NAMES,PRESETS} from '../tuning';
import {PickButtons} from './DiyControls';
import {LAB} from './lab';
import {RackEffect} from '../effects/rackParts';

// Floating test windows for what is being tried out before it is merged: tape, shimmer, freeze, the master filter and the site's
// tuning. They sit outside the panel's own layout, and each is dragged by its title.
const TUNE=defineParams([
 ...Array.from({length:12},(_,i)=>[`deg${i}`,i,NAMES[i],-50,50,0,'ct','lin']),
 ['octave',12,'Octave',1.5,2.5,2,'decimal','lin'],['a4',13,'A4',400,480,440,'Hz','lin'],['shift',14,'Shift',-100,100,0,'ct','lin'],
]);

function Window({id,title,home,onClose,children,wide}){
 const float=useFloating('synths:diy:lab:'+id,home);
 return createPortal(<section ref={float.ref} className={'group lab-window'+(wide?' wide':'')} style={float.style} onPointerDownCapture={float.raise}>
  <h3 {...float.handle}>{title}<button type="button" className="lab-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></h3>
  <div className="group-controls">{children}</div>
 </section>,document.body);
}

// the three effects as the effects rack will show them: its own panel, a window around it that is dragged by the panel's header
const EFFECTS=[
 {id:'tape',name:'Tape',colour:'#d8b98c',toggle:'tapeOn',keys:[['tapeWow','Wow'],['tapeWowRate','Wow rate'],['tapeFlutter','Flutter'],['tapeDrive','Saturation'],['tapeTone','Tone']],
  note:'Slow pitch drift (wow), fast shimmer (flutter), soft saturation and a darker top end.'},
 {id:'shimmer',name:'Shimmer',colour:'#a9c8ec',toggle:'shimmerOn',keys:[['shimmerMix','Mix'],['shimmerDecay','Decay'],['shimmerInterval','Interval'],['shimmerClimb','Climb'],['shimmerTone','Tone']],
  note:'A pitch-shifted reverb tail that climbs as it fades.'},
 {id:'freeze',name:'Freeze',colour:'#9fd6e0',toggle:'freezeOn',keys:[['freezeMix','Mix'],['freezeLength','Length'],['freezeFade','Fade'],['freezeHold','Hold']],
  note:'Holds a slice of the sound as a sustained pad.'},
];
function EffectWindow({block,home,values,onChange}){
 const float=useFloating('synths:diy:lab:'+block.id,home);
 return createPortal(<div ref={float.ref} className="lab-window lab-rack" style={float.style} onPointerDownCapture={float.raise}>
  <RackEffect block={{...block,on:values[block.toggle]===1}} values={values} specs={LAB.BY_KEY} movable={false} headerProps={float.handle}
   onChange={changes=>Object.entries(changes).forEach(([key,value])=>onChange(key,value))}/>
 </div>,document.body);
}

export default function LabPanels({values,onChange,onClose}){
 const [t,setT]=useState(tuning.get());
 useEffect(()=>tuning.subscribe(setT),[]);
 // laid out side by side under the header; drag them wherever suits
 const at={tape:{x:24,y:90},shimmer:{x:600,y:90},freeze:{x:1180,y:340},master:{x:1180,y:90},tuning:{x:24,y:370}};
 // a lab control in its natural form: a lever for two ways, buttons for a short list, a fader otherwise
 const control=(key,tone,label)=>{
  const spec=LAB.BY_KEY[key],text=label??spec.label;
  if(spec.options?.length===2)return <Lever key={key} spec={spec} value={values[key]} onChange={onChange} tone={tone} label={text}/>;
  if(spec.options)return <PickButtons key={key} label={text} options={spec.options} value={values[key]} onChange={i=>onChange(key,i)} columns={spec.options.length>4?2:1} tone={tone}/>;
  return <Fader key={key} spec={spec} value={values[key]} onChange={onChange} tone={tone} label={text}/>;
 };
 const named=tuning.named();
 const deg=i=>(t.tonic+i)%12;
 return <>
  {EFFECTS.map(block=><EffectWindow key={block.id} block={block} home={at[block.id]} values={values} onChange={onChange}/>)}
  <Window id="tuning" title="Tuning" home={at.tuning} onClose={onClose} wide>
   <div className="lab-tuning pf-frame">
    <div className="lab-row">
     <PickButtons label="Scale" options={Object.keys(PRESETS).map(n=>n.replace('Equal temperament','12-TET').replace('Just intonation','Just').replace('Quarter-comma meantone','Meantone'))} titles={Object.keys(PRESETS)}
      value={named?Object.keys(PRESETS).indexOf(named):-1} onChange={i=>tuning.preset(Object.keys(PRESETS)[i])} columns={1} tone="teal"/>
     <PickButtons label="Tonic" options={NAMES} value={t.tonic} onChange={i=>tuning.set({tonic:i})} columns={3} tone="teal"/>
     <div className="lab-row lab-faders">
      {['octave','a4','shift'].map(k=><Fader key={k} spec={TUNE.BY_KEY[k]} value={t[k]} onChange={(_,v)=>tuning.set({[k]:v})} tone="cream"/>)}
     </div>
    </div>
    <div className="lab-row lab-faders">
     {Array.from({length:12},(_,i)=><Fader key={i} spec={TUNE.BY_KEY['deg'+i]} value={t.cents[i]} onChange={(_,v)=>tuning.set({cents:t.cents.map((c,j)=>j===i?v:c)})} tone="cream" label={NAMES[deg(i)]}/>)}
    </div>
    <p className="hint">Cents per scale degree from the tonic, for every key.</p>
   </div>
  </Window>
 </>;
}
