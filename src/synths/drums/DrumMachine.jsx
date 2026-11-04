import React,{useRef} from 'react';
import {toPosition,fromPosition,formatValue} from '../params';
import {voiceColour,ACCENT_COLOUR} from './kits';
import Knob from '../ui/Knob';

// The drum machine device, laid out after a hardware box (Behringer RD-8 MKII): a master strip with a tempo
// display and the shared controls, then one row per voice, every voice's main controls in view at once. SELECT
// (the name button) plays the voice and picks it; the sequencer's rows sit level with these rows.
// Every voice row has only its Level; Tune, Decay, Tone and Pan live in a panel for the selected voice.

// A horizontal slider on a parameter's own curve (native range: keyboard, touch and screen readers for free).
// Double-click restores the default.
export function Slider({spec,value,onChange,label,className=''}){
 const position=toPosition(spec,value),bipolar=spec.min<0&&spec.max>0;
 return <input type="range" className={'dm-slider'+(bipolar?' bipolar':'')+(className?' '+className:'')} min="0" max="1" step="0.005" value={position}
  style={{'--p':position}} aria-label={label} aria-valuetext={formatValue(spec,value)} title={`${label}: ${formatValue(spec,value)}`}
  onChange={e=>onChange(spec.key,fromPosition(spec,Number(e.target.value)))} onDoubleClick={()=>onChange(spec.key,spec.default)}/>;
}

const DETAIL=['Tune','Decay','Tone','Pan'];

/** Tap tempo: the average of the last few taps; a pause of two seconds starts over. */
export const tapTempo=(taps,now)=>{
 if(taps.length&&now-taps[taps.length-1]>2000)taps.length=0;
 taps.push(now);if(taps.length>5)taps.shift();
 return taps.length<2?null:Math.round(60000/((taps[taps.length-1]-taps[0])/(taps.length-1))*10)/10;
};

export function DrumMachineTop({kit,synth,values,change}){
 const taps=useRef([]);
 const by=synth.params.BY_KEY;
 const slider=(key,label,className)=><label className={'dm-field '+(className??'')} key={key}><span>{label}</span><Slider spec={by[key]} value={values[key]} onChange={change} label={label}/></label>;
 return <div className="dm-master">
  <div className="dm-lcd" role="group" aria-label="Tempo">
   <output className="dm-lcd-value" aria-label="Tempo in beats per minute">{Number(values.tempo).toFixed(1)}</output><small>BPM</small>
   <button type="button" className="dm-tap" title="Tap the tempo" onPointerDown={()=>{const bpm=tapTempo(taps.current,performance.now());if(bpm)change('tempo',Math.min(220,Math.max(40,bpm)));}}>Tap</button>
  </div>
  <label className="dm-field dm-tempo"><span>Tempo</span><Slider spec={by.tempo} value={values.tempo} onChange={change} label="Tempo"/></label>
  {slider('swing','Swing')}{slider('flam','Flam')}{slider('master','Master')}
  <div className="dm-room">{slider('reverbMix','Room')}{slider('reverbDecay','Length')}{slider('reverbTone','Colour')}</div>
  <span className="dm-kick" role="radiogroup" aria-label="Kick body">
   <small>Kick</small>{by.kickBody.options.map((name,i)=><button type="button" role="radio" key={name} aria-checked={values.kickBody===i} className={values.kickBody===i?'on':''} onClick={()=>change('kickBody',i)}>{name}</button>)}
  </span>
 </div>;
}

// The selected voice's own controls, like the RD-8's Tune / Decay / Tone knobs that act on the voice picked with SELECT.
export function DrumVoicePanel({kit,synth,values,change,selected}){
 const by=synth.params.BY_KEY,t=Math.min(selected,kit.tracks.length-1),[key,short,long]=kit.tracks[t];
 // the original machine's knobs for this voice first (kit.knobs), Pan, then our extras folded under More
 const main=kit.knobs?(kit.knobs[key]??[]):['Tune','Decay','Tone'],extra=DETAIL.filter(c=>c!=='Pan'&&!main.includes(c));
 const field=c=>{const label=c==='Tone'?kit.tone[key]??'Tone':c;return <label className="dm-field" key={c}><span>{label}</span><Slider spec={by[key+c]} value={values[key+c]} onChange={change} label={`${long} ${label}`}/></label>;};
 return <div className="dm-detail" style={{'--voice':voiceColour(key,kit.id)}} role="group" aria-label={`${long} controls`}>
  <h3><strong>{short}</strong> {long}</h3>
  {main.map(field)}{field('Pan')}
  {extra.length>0&&<details className="dm-more"><summary>More</summary><div>{extra.map(field)}</div></details>}
 </div>;
}

export function DrumMachineVoices({kit,synth,values,change,selected,onSelect,onPad,muted,solo,silent,onMute,onSolo}){
 const by=synth.params.BY_KEY;
 return <div className="dm-voices">
  <div className="dm-voice dm-accent" style={{'--voice':ACCENT_COLOUR}} title="Accent: how much the accented steps are emphasised">
   <i className="dm-led" aria-hidden="true"/>
   {kit.id==='tr606'?<Knob spec={by.accent} value={values.accent} onChange={change} label="Accent amount"/>:<Slider className="dm-fader" spec={by.accent} value={values.accent} onChange={change} label="Accent amount"/>}
   <span className="dm-name accent">AC</span>
   <span className="dm-ms"/>
  </div>
  {kit.tracks.map(([key,short,long],t)=>(
   <div className={'dm-voice'+(selected===t?' on':'')+(silent?.(t)?' silent':'')} key={key} data-track={t} style={{'--voice':voiceColour(key,kit.id)}}>
    <i className="dm-led" aria-hidden="true"/>
    {kit.id==='tr606'?<Knob spec={by[key+'Level']} value={values[key+'Level']} onChange={change} label={`${long} Level`}/>:<Slider className="dm-fader" spec={by[key+'Level']} value={values[key+'Level']} onChange={change} label={`${long} Level`}/>}
    <button type="button" className="dm-name" title={`${long}: play and select`} aria-pressed={selected===t} onPointerDown={()=>{onSelect(t);onPad(t);}}>{short}</button>
    <span className="dm-ms">
     <button type="button" className={'dm-mute'+(muted?.has(t)?' on':'')} aria-pressed={!!muted?.has(t)} aria-label={`Mute ${long}`} title={`Mute ${long}`} onClick={()=>onMute(t)}>M</button>
     <button type="button" className={'dm-solo'+(solo?.has(t)?' on':'')} aria-pressed={!!solo?.has(t)} aria-label={`Solo ${long}`} title={`Solo ${long}`} onClick={()=>onSolo(t)}>S</button>
    </span>
   </div>
  ))}
 </div>;
}
