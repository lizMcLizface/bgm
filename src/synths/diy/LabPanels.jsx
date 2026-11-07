import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDesk} from '../ui/Desk';
import {Fader} from '../ui/controls';
import useFloating from '../ui/useFloating';
import {defineParams} from '../params';
import {tuning,NAMES,PRESETS} from '../tuning';
import {PickButtons} from './DiyControls';

// The site's tuning, as a floating window: it sits outside the panel's own layout and is dragged by its title.
const TUNE=defineParams([
 ...Array.from({length:12},(_,i)=>[`deg${i}`,i,NAMES[i],-50,50,0,'ct','lin']),
 ['octave',12,'Octave',1.5,2.5,2,'decimal','lin'],['a4',13,'A4',400,480,440,'Hz','lin'],['shift',14,'Shift',-100,100,0,'ct','lin'],
]);

export function Window({id,title,home,onClose,children,wide,anchor}){
 const float=useFloating('synths:diy:lab:'+id,home,{anchor}),desk=useDesk();
 // on the desk, so it moves and scales with the rest
 return createPortal(<section ref={float.ref} className={'group lab-window'+(wide?' wide':'')} style={float.style} onPointerDownCapture={float.raise}>
  <h3 {...float.handle}>{title}<button type="button" className="lab-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></h3>
  <div className="group-controls">{children}</div>
 </section>,desk.el??document.body);
}

export default function LabPanels({values,onChange,onClose,id='tuning',home,anchor}){
 const [t,setT]=useState(tuning.get()),[live,setLive]=useState(tuning.liveCents());
 useEffect(()=>tuning.subscribe(setT),[]);
 // what a chord is doing to the sounding notes, so the faders show it as it changes (auto play included: it plays through the same keys)
 useEffect(()=>tuning.subscribeLive(setLive),[]);
 // laid out side by side under the header; drag them wherever suits
 // where it starts: below the instrument, at its left
 const at={tuning:s=>({x:0,y:Math.round(s.h*.8)})};
 const named=tuning.named();
 const deg=i=>(t.tonic+i)%12;
 return <>
  <Window id={id} title="Tuning" home={home??at.tuning} anchor={anchor} onClose={onClose} wide>
   <div className="lab-tuning pf-frame">
    <div className="lab-row">
     <PickButtons label="Scale" options={Object.keys(PRESETS).map(n=>n.replace('Equal temperament','12-TET').replace('Just intonation','Just').replace('Quarter-comma meantone','Meantone'))} titles={Object.keys(PRESETS)}
      value={named?Object.keys(PRESETS).indexOf(named):-1} onChange={i=>tuning.preset(Object.keys(PRESETS)[i])} columns={1} tone="teal"/>
     <PickButtons label="Tonic" options={NAMES} value={t.tonic} onChange={i=>tuning.set({tonic:i})} columns={3} tone="teal"/>
     <button type="button" className="lab-hold lab-auto" aria-pressed={t.auto===1} title="Tune the keys held together as one just chord above its root, and follow it as the chord changes" onClick={()=>tuning.set({auto:t.auto?0:1})}><b>Chord</b><span>auto-tune</span><span>{t.auto?'On':'Off'}</span></button>
     <div className="lab-row lab-faders">
      {['octave','a4','shift'].map(k=><Fader key={k} spec={TUNE.BY_KEY[k]} value={t[k]} onChange={(_,v)=>tuning.set({[k]:v})} tone="cream"/>)}
     </div>
    </div>
    <div className="lab-row lab-faders">
     {Array.from({length:12},(_,i)=><Fader key={i} spec={TUNE.BY_KEY['deg'+i]} value={t.cents[i]} onChange={(_,v)=>tuning.set({cents:t.cents.map((c,j)=>j===i?v:c)})} tone="cream" label={NAMES[deg(i)]} live={live?.get(deg(i))??null}/>)}
    </div>
   </div>
  </Window>
 </>;
}
