import React,{useRef,useLayoutEffect} from 'react';
import {holdModulation} from '../seq/modLive';
import {toPosition,fromPosition,formatValue} from '../params';
import {voiceColour,ACCENT_COLOUR} from './kits';
import Knob from '../ui/Knob';
import {useState} from 'react';
import {soundList,nextSound} from '../ui/SoundPicker';
import SoundGrid from '../ui/SoundGrid';
import {PresetKnob} from '../diy/DiyControls';

// The sound picker in the machine's title row: a knob steps through the sounds, the display names the current one and
// opens the sound grid when tapped, and a floppy icon saves the current sound.
export function DrumPicker(props){
 const {synth,presets,mine,current,currentCategory,choose,save}=props;
 const [grid,setGrid]=useState(false);
 const list=soundList(synth,presets,mine);
 const step=dir=>{const next=nextSound(list,current,currentCategory,dir,false);if(next)choose(next);};
 const active=list.sounds.find(p=>p.name===current&&(p.cat==='mine')===(currentCategory==='mine'))??list.sounds.find(p=>p.name===current);
 const category=active?.categoryLabel??list.categories.find(c=>c.id===currentCategory)?.label??'Sounds',name=current||'Pick one…';
 return <div className="oled-picker drum-picker">
  <PresetKnob onStep={step}/>
  <button type="button" className="oled" style={{'--accent':active?.colour}} aria-haspopup="dialog" aria-expanded={grid} onClick={()=>setGrid(g=>!g)} title="Every sound in one grid">
   <span className="oled-cat">{category}</span><span className="oled-name" key={name} style={{'--n':Math.min(name.length,22)}}>{name}</span>
  </button>
  <button type="button" className="oled-save" onClick={save} aria-label="Save sound" title="Save this sound">
   <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 3h13l3 3v15H4z"/><path d="M7 3v6h9V3"/><rect x="7" y="13" width="10" height="8"/></svg>
  </button>
  {grid&&<SoundGrid {...props} onClose={()=>setGrid(false)}/>}
 </div>;
}

// The drum machine device, laid out after a hardware box (Behringer RD-8 MKII): a master strip with a tempo
// display and the shared controls, then one row per voice, every voice's main controls in view at once. SELECT
// (the name button) plays the voice and picks it; the sequencer's rows sit level with these rows.
// Every voice row has only its Level; Tune, Decay, Tone and Pan live in a panel for the selected voice.

// A horizontal slider on a parameter's own curve (native range: keyboard, touch and screen readers for free).
// Double-click restores the default.
export function Slider({spec,value,onChange,label,className=''}){
 const position=toPosition(spec,value),bipolar=spec.min<0&&spec.max>0,ref=useRef(null);
 useLayoutEffect(()=>holdModulation(ref.current,spec.key));
 return <input ref={ref} data-mod-key={spec.key} type="range" className={'dm-slider'+(bipolar?' bipolar':'')+(className?' '+className:'')} min="0" max="1" step="0.005" value={position}
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
