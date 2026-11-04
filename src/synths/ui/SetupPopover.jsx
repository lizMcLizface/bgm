import React,{useEffect} from 'react';
import useFloating from './useFloating';

// The setup (MIDI, touch screen, audio) as a floating panel under the header, over the page instead of in place of the
// synth's controls. The header drags it; Escape or the close button puts it away.
export default function SetupPopover({midi,setup,updateSetup,connectMidi,audio,start,onClose}){
 const float=useFloating('synths:setup-pos');
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[onClose]);
 return <div className="setup-pop" role="dialog" aria-label="Setup" ref={float.ref} style={float.style} onPointerDownCapture={float.raise}>
  <header className="setup-pop-head" {...float.handle}><h2>Setup</h2><button type="button" className="close" onClick={onClose} aria-label="Close setup">×</button></header>
  <div className="setup">
    <section className="group wide"><h3>MIDI piano</h3>
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
    <section className="group wide"><h3>Touch screen</h3>
     <div className="row">
      <label>Ribbon range<select value={setup.ribbonRange} onChange={e=>updateSetup('ribbonRange',Number(e.target.value))}>{[1,2,5,7,12,24].map(n=><option key={n} value={n}>±{n} st</option>)}</select></label>
      <label>Keys from<select value={setup.keysLow} onChange={e=>updateSetup('keysLow',Number(e.target.value))}>{[24,36,48,60,72].map(n=><option key={n} value={n}>C{n/12-1}</option>)}</select></label>
     </div>
    </section>
    <section className="group wide"><h3>Audio</h3>
     <p>{audio.state==='on'?audio.message:'Audio is off.'}</p>
     <div className="row">
      <label>Latency<select value={setup.latency} onChange={e=>updateSetup('latency',e.target.value)}><option value="interactive">Lowest (best for playing)</option><option value="balanced">Safer (if you hear crackles)</option></select></label>
      <button type="button" onClick={start}>Restart audio</button>
     </div>
     <p className="hint">Changing latency takes effect when audio restarts. The engine runs in Rust/WebAssembly on the browser's audio thread. Settings here are shared by every synth on this device.</p>
    </section>
  </div>
 </div>;
}
