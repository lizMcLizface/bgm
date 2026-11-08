import React,{useEffect,useRef,useState} from 'react';
import {createTapTracker,tapPatch,TAP_TARGETS,engagePatch,pedalEngaged} from './pedalModel';

export default function EffectFootswitches({block,values,onChange,connected,model}){
 const tracker=useRef(null),timer=useRef(null),[flash,setFlash]=useState(false);
 if(!tracker.current)tracker.current=createTapTracker();
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const engaged=connected&&pedalEngaged(block,values),toggle=()=>{
  if(!connected){model.addToChain(block.id);onChange(engagePatch(block,values));}
  else onChange(engaged?{[block.toggle]:0}:engagePatch(block,values));
 };
 const tap=()=>{const interval=tracker.current(performance.now());if(interval!==null)onChange(tapPatch(block.id,interval));setFlash(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setFlash(false),150);};
 return <div className="effect-foot-area">
  <button type="button" className="effect-foot" aria-label={connected?`${block.name} on/off`:`Add ${block.name} to rack`} aria-pressed={engaged} onClick={toggle} title={connected?'Engage or bypass effect':'Add and engage effect'}><i className={'effect-foot-led'+(engaged&&values['master.enabled']?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">{connected?'On / Off':'Engage'}</span></button>
  {TAP_TARGETS[block.id]&&<button type="button" className="effect-foot" aria-label={`${block.name} tap tempo`} title="Tap at least twice to set this effect’s time or rate. Delay tap selects free time." onClick={tap}><i className={'effect-foot-led'+(flash?' tap-lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">Tap</span></button>}
  {block.id==='freeze'&&<button type="button" className="effect-foot" aria-label="Freeze · Hold" aria-pressed={values['freeze.hold']===1} onClick={()=>onChange({'freeze.hold':values['freeze.hold']?0:1})}><i className={'effect-foot-led'+(values['freeze.hold']?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">Hold</span></button>}
 </div>;
}
