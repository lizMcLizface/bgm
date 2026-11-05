import React,{useRef} from 'react';
import {Slider,tapTempo} from '../drums/DrumMachine';
import {ACCENT_COLOUR} from '../drums/kits';

// The bass machine device, laid out like the drum machines (drums/DrumMachine.jsx): a master strip with the tempo display,
// then the voice strip (an accent fader and the one bass voice, with its light and pad), then a panel with the voice's own controls.
export const VOICE_COLOUR='#e0a526';

export function BassMachineTop({synth,values,change}){
 const taps=useRef([]);
 const by=synth.params.BY_KEY;
 const slider=(key,label,className)=><label className={'dm-field '+(className??'')} key={key}><span>{label}</span><Slider spec={by[key]} value={values[key]} onChange={change} label={label}/></label>;
 return <div className="dm-master">
  <div className="dm-lcd" role="group" aria-label="Tempo">
   <output className="dm-lcd-value" aria-label="Tempo in beats per minute">{Number(values.tempo).toFixed(1)}</output><small>BPM</small>
   <button type="button" className="dm-tap" title="Tap the tempo" onPointerDown={()=>{const bpm=tapTempo(taps.current,performance.now());if(bpm)change('tempo',Math.min(220,Math.max(40,bpm)));}}>Tap</button>
  </div>
  <label className="dm-field dm-tempo"><span>Tempo</span><Slider spec={by.tempo} value={values.tempo} onChange={change} label="Tempo"/></label>
  {slider('swing','Swing')}{slider('volume','Master')}
  <span className="dm-kick" role="radiogroup" aria-label="Wave">
   <small>Wave</small>{by.wave.options.map((name,i)=><button type="button" role="radio" key={name} aria-checked={values.wave===i} className={values.wave===i?'on':''} onClick={()=>change('wave',i)}>{name}</button>)}
  </span>
  <div className="dm-room">{slider('reverbMix','Room')}{slider('reverbDecay','Length')}{slider('reverbTone','Colour')}</div>
 </div>;
}

/** The accent fader and the bass voice: its fader is the output level, the name button plays a note and its light follows the sequence. */
export function BassMachineVoice({synth,values,change,onPad}){
 const by=synth.params.BY_KEY;
 return <div className="dm-voices">
  <div className="dm-voice dm-accent" style={{'--voice':ACCENT_COLOUR}} title="Accent: how hard accented steps hit the filter and the level">
   <i className="dm-led" aria-hidden="true"/>
   <Slider className="dm-fader" spec={by.accent} value={values.accent} onChange={change} label="Accent amount"/>
   <span className="dm-name accent">AC</span>
   <span className="dm-ms"/>
  </div>
  <div className="dm-voice on" data-track="0" style={{'--voice':VOICE_COLOUR}}>
   <i className="dm-led" aria-hidden="true"/>
   <Slider className="dm-fader" spec={by.volume} value={values.volume} onChange={change} label="Bass level"/>
   <button type="button" className="dm-name" title="Bass: play a note" aria-pressed="true" onPointerDown={onPad}>BS</button>
   <span className="dm-ms"/>
  </div>
 </div>;
}

const CONTROLS=[['tune','Tune'],['cutoff','Cutoff'],['resonance','Resonance'],['envMod','Env mod'],['decay','Decay'],['slide','Slide'],['drive','Drive']];
export function BassVoicePanel({synth,values,change}){
 const by=synth.params.BY_KEY;
 return <div className="dm-detail" style={{'--voice':VOICE_COLOUR}} role="group" aria-label="Bass controls">
  <h3><strong>BS</strong> Bass voice</h3>
  {CONTROLS.map(([key,label])=><label className="dm-field" key={key}><span>{label}</span><Slider spec={by[key]} value={values[key]} onChange={change} label={label}/></label>)}
 </div>;
}
