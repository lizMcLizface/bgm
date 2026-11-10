import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import useFloating from './useFloating';
import {KEY_SIZES} from './setup';

// Shared setup controls: a movable panel by default, or a ribbon dropdown when
// an anchor is supplied. The dropdown stays outside the scaled desk surface.
export default function SetupPopover(props){
 return props.anchorRef?<AnchoredSetup {...props}/>:<FloatingSetup {...props}/>;
}
function FloatingSetup({positionKey='synths:setup-pos',home=null,...props}){
 const float=useFloating(positionKey,home);
 return <SetupPanel {...props} shell={{ref:float.ref,style:float.style,onPointerDownCapture:float.raise}} grip={float.handle}/>;
}
function AnchoredSetup({anchorRef,onClose,id,...props}){
 const ref=useRef(null),[style,setStyle]=useState({visibility:'hidden'});
 useLayoutEffect(()=>{
  const place=()=>{const anchor=anchorRef.current;if(!anchor)return;const r=anchor.getBoundingClientRect(),width=Math.min(520,Math.max(0,window.innerWidth-24)),top=r.bottom+8;setStyle({position:'fixed',left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),right:'auto',top,width,maxHeight:Math.max(0,window.innerHeight-top-12),zIndex:200000});};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  const observer=new ResizeObserver(place);if(anchorRef.current)observer.observe(anchorRef.current);if(anchorRef.current?.closest('header'))observer.observe(anchorRef.current.closest('header'));
  return ()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[anchorRef]);
 useEffect(()=>{
  const away=e=>{if(!ref.current?.contains(e.target)&&!anchorRef.current?.contains(e.target))onClose();};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();anchorRef.current?.focus({preventScroll:true});}};
  document.addEventListener('pointerdown',away);window.addEventListener('keydown',escape,true);
  return ()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('keydown',escape,true);};
 },[anchorRef,onClose]);
 return createPortal(<SetupPanel {...props} onClose={onClose} shell={{id,ref,style}} anchored/>,document.body);
}
function SetupPanel({midi,setup,updateSetup,connectMidi,audio,start,onClose,children,shared=true,preferences=true,title='Setup',shell,grip={},anchored=false}){
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[onClose]);
 return <div className={'setup-pop'+(anchored?' setup-dropdown':'')} role="dialog" aria-label={title} {...shell}>
  <header className="setup-pop-head" {...grip}><h2>{title}</h2><button type="button" className="close" onClick={onClose} aria-label={title==='Setup'?'Close setup':`Close ${title.toLowerCase()}`}>×</button></header>
  <div className="setup">
    {children}
    {preferences&&<><section className="group wide"><h3>MIDI piano</h3>
     <p>{midi.status}</p>
     <div className="row">
      <button type="button" onClick={connectMidi}>Connect MIDI</button>
      <label>Input<select value={setup.midiDevice} onChange={e=>updateSetup('midiDevice',e.target.value)}><option value="all">All inputs</option>{setup.midiDevice!=='all'&&!midi.inputs.some(i=>i.id===setup.midiDevice)&&<option value={setup.midiDevice}>Saved input</option>}{midi.inputs.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <label>Channel<select value={setup.midiChannel} onChange={e=>updateSetup('midiChannel',e.target.value)}><option value="all">All</option>{Array.from({length:16},(_,i)=><option key={i} value={String(i+1)}>{i+1}</option>)}</select></label>
     </div>
     <div className="row">
      <label>Touch<select value={setup.velocity} onChange={e=>updateSetup('velocity',e.target.value)}><option value="light">Light (quiet playing speaks)</option><option value="normal">Normal</option><option value="firm">Firm (needs a strong touch)</option></select></label>
      <label>Pitch wheel<select value={setup.wheelRange} onChange={e=>updateSetup('wheelRange',Number(e.target.value))}>{[1,2,5,7,12].map(n=><option key={n} value={n}>±{n} st</option>)}</select></label>
     </div>
     <p className="hint">Sustain pedal holds notes; the soft pedal darkens and softens. Channel or polyphonic aftertouch, mod wheel (vibrato), expression (CC11) and CC74 brightness work if your keyboard sends them.</p>
    </section>
    <section className="group wide"><h3>Keyboard</h3>
     <div className="row">
      <label>Keybed<select value={setup.keysSize} onChange={e=>updateSetup('keysSize',e.target.value==='fit'?'fit':Number(e.target.value))}>{KEY_SIZES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={setup.keysControls} onChange={e=>updateSetup('keysControls',e.target.checked)}/> Wheel, ribbon and pad</label>
      <label>Ribbon range<select value={setup.ribbonRange} onChange={e=>updateSetup('ribbonRange',Number(e.target.value))}>{[1,2,5,7,12,24].map(n=><option key={n} value={n}>±{n} st</option>)}</select></label>
      {setup.keysSize==='fit'&&<label>Keys from<select value={setup.keysLow} onChange={e=>updateSetup('keysLow',Number(e.target.value))}>{[24,36,48,60,72].map(n=><option key={n} value={n}>C{n/12-1}</option>)}</select></label>}
     </div>
     <div className="row">
      <label>Computer key velocity<input type="range" min="1" max="127" step="1" value={setup.keyVelocity} onChange={e=>updateSetup('keyVelocity',Number(e.target.value))}/><output>{setup.keyVelocity}</output></label>
      <label>Random variation<input type="range" min="0" max="40" step="1" value={setup.keyVariation} onChange={e=>updateSetup('keyVariation',Number(e.target.value))}/><output>±{setup.keyVariation}</output></label>
     </div>
     <p className="hint">Computer keys have no touch, so they send the velocity above, varied a little each time. A whole keybed (49 to 88 keys) is shown in full; the controls beside it are the mod wheel, ribbon and touch pad, for the synths that use them. Shared by every synth on this device.</p>
    </section>
    <section className="group wide"><h3>Audio</h3>
     <p>{audio.state==='on'?audio.message:'Audio is off.'}</p>
     <div className="row">
      <label>Latency<select value={setup.latency} onChange={e=>updateSetup('latency',e.target.value)}><option value="interactive">Lowest (best for playing)</option><option value="balanced">Safer (if you hear crackles)</option></select></label>
      <button type="button" onClick={start}>Restart audio</button>
     </div>
     <p className="hint">{shared?"Changing latency takes effect when audio restarts. The engine runs in Rust/WebAssembly on the browser's audio thread. Settings here are shared by every synth on this device.":'Latency changes take effect when audio restarts. These settings are saved with this desk.'}</p>
    </section></>}
  </div>
 </div>;
}
