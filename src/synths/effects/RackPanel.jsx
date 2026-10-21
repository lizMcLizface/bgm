import React,{useEffect,useState} from 'react';
import {formatValue,toPosition,fromPosition} from '../params';
import {RACK_PARAMS,cleanRack,RACK_PRESETS} from './params';
import RackGraphic from './RackGraphic';
import './rack.css';

const BLOCKS=[
 {id:'saturation',name:'Saturation',colour:'#e2a369',keys:[['inserts.saturation','Mix'],['inserts.drive','Drive']]},
 {id:'eq',name:'Equalizer',colour:'#afcb7a',keys:[['inserts.lowGain','Low gain'],['inserts.lowFreq','Low frequency'],['inserts.midGain','Mid gain'],['inserts.midFreq','Mid frequency'],['inserts.midQ','Mid Q'],['inserts.highGain','High gain'],['inserts.highFreq','High frequency']]},
 {id:'phaser',name:'Phaser',colour:'#b0a0e6',keys:[['inserts.phaser','Mix'],['inserts.phaserRate','Rate'],['inserts.phaserDepth','Sweep'],['inserts.phaserFreq','Centre'],['inserts.phaserFeedback','Feedback']]},
 {id:'flanger',name:'Flanger',colour:'#8bbce5',keys:[['inserts.flanger','Mix'],['inserts.flangerRate','Rate'],['inserts.flangerDepth','Depth'],['inserts.flangerDelay','Delay'],['inserts.flangerFeedback','Feedback']]},
 {id:'chorus',name:'Chorus',colour:'#7fc7b6',keys:[['inserts.chorus','Mix'],['inserts.chorusRate','Rate'],['inserts.chorusDepth','Depth']]},
 {id:'compressor',name:'Compressor',colour:'#f0bd79',keys:[['compressor.threshold','Threshold'],['compressor.ratio','Ratio'],['compressor.knee','Knee'],['compressor.attack','Attack'],['compressor.release','Release'],['compressor.makeup','Output trim']]},
 {id:'delay',name:'Delay',colour:'#dca7cf',keys:[['effects.delay','Send'],['effects.delayMs','Time'],['effects.feedback','Feedback'],['effects.tone','Tone'],['effects.pingPong','Mode'],['effects.delayToReverb','To reverb']]},
 {id:'reverb',name:'Reverb',colour:'#9cbbb8',keys:[['effects.reverb','Send'],['effects.reverbReturn','Return'],['effects.decay','Decay'],['effects.size','Size'],['effects.damping','Damping'],['effects.predelay','Pre-delay'],['effects.width','Width'],['effects.modulation','Motion'],['effects.quality','Network']]},
 {id:'master',name:'Output',colour:'#d1c6a6',keys:[['master.input','Input'],['master.output','Output'],['inserts.gain','Insert trim'],['effects.dry','Dry level'],['inserts.bypass','Insert chain'],['effects.bypass','Room & delay']]},
];
const CHOICES={'effects.pingPong':['Stereo','Ping-pong'],'effects.quality':['8 lines','16 lines'],'inserts.bypass':['Active','Bypassed'],'effects.bypass':['Active','Bypassed']};
export function RackControl({spec,value,label,block,onChange}){
 const key=spec.key,options=CHOICES[key],aria=`${block} · ${label}`,set=value=>onChange({[key]:Math.max(spec.min,Math.min(spec.max,value))});
 const scale=spec.unit==='%'?100:1,step=scale===100?.1:spec.curve==='step'?1:spec.unit==='Hz'&&spec.max>100?1:spec.unit==='dB'?.1:.001;
 const number=Number((value*scale).toFixed(4)),[editing,setEditing]=useState(false),[draft,setDraft]=useState(String(number));
 useEffect(()=>{if(!editing)setDraft(String(number));},[number,editing]);
 const display=scale===100?Math.round(value*100)+'%':key==='compressor.ratio'?formatValue(spec,value)+':1':formatValue(spec,value)+(spec.unit==='Hz'?'Hz':spec.unit==='oct'?' oct':'');
 return <label className="rack-control" data-rack-param={key}>
  <span>{label}</span>
  {options?<select aria-label={aria} value={value} onChange={e=>set(Number(e.target.value))}>{options.map((s,i)=><option key={i} value={i}>{s}</option>)}</select>:<>
   <input type="range" aria-label={aria} min="0" max="1" step="0.001" value={toPosition(spec,value)} onChange={e=>set(Number(fromPosition(spec,Number(e.target.value)).toFixed(6)))}/>
   <span className="rack-value"><input aria-label={aria+' value'} type="number" min={spec.min*scale} max={spec.max*scale} step={step} value={editing?draft:number} title="Enter or leave the field to apply" onFocus={()=>{setDraft(String(number));setEditing(true);}} onChange={e=>{setEditing(true);setDraft(e.target.value);}} onBlur={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))set(e.target.valueAsNumber/scale);setEditing(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}else if(e.key==='Escape'){e.preventDefault();e.currentTarget.value=String(number);e.currentTarget.blur();}}}/><output>{display}</output></span>
  </>}
 </label>;
}
export default function RackPanel({values,onChange,instrumentSpecs=[],peak=0,reduction=0,tools=null,connected=true,emptyMessage}){
 return <div className="rack-content">
  <div className="rack-toolbar">
   <div><h2>Effects rack</h2></div>
   <div className="rack-toolbar-actions">
    <button type="button" aria-label="Bypass effects rack" aria-pressed={!values['master.enabled']} onClick={()=>onChange({'master.enabled':values['master.enabled']?0:1})}>{values['master.enabled']?'Rack on':'Rack bypassed'}</button>
    <button type="button" onClick={()=>onChange(cleanRack())}>Reset rack</button>{tools}
   </div>
   <div className="rack-signal" aria-label="Rack output level"><span style={{width:Math.min(100,peak*100)+'%'}}/></div>
  </div>
  <div className="rack-recipes" aria-label="Rack presets"><span>Try a rack</span>{RACK_PRESETS.map(p=><button type="button" key={p.name} onClick={()=>onChange(p.values)}>{p.name}</button>)}</div>
  {!connected&&<p className="rack-empty">{emptyMessage??'Open a synth in another tab, start its audio, then connect it here. The rack controls that synth while you play.'}</p>}
  <div className="rack-flow" aria-label="Signal path">Synth <span>→</span> Saturation & EQ <span>→</span> Modulation <span>→</span> Compressor <span>→</span> Delay & reverb <span>→</span> Output</div>
  <div className="rack-grid">
   {BLOCKS.map(block=>{
    const toggle=block.id==='compressor'?'compressor.enabled':block.id==='master'?null:'switch.'+block.id,on=toggle?values[toggle]===1:true;
    return <section className={'rack-block'+(on?'':' is-bypassed')} key={block.id} style={{'--rack-colour':block.colour}} aria-label={block.name}>
     <header><RackGraphic kind={block.id} on={on}/><div><h3>{block.name}</h3></div>{toggle&&<button type="button" aria-label={block.name+' enabled'} aria-pressed={on} onClick={()=>onChange({[toggle]:on?0:1})}><i/>{on?'On':'Off'}</button>}</header>
     {block.id==='compressor'&&<div className="rack-reduction"><span>Gain reduction</span><meter min="0" max="24" value={Math.min(24,Math.abs(reduction))}/><output>{Math.abs(reduction).toFixed(1)} dB</output></div>}
     <div className="rack-controls">{block.keys.map(([key,label])=><RackControl key={key} spec={RACK_PARAMS.BY_KEY[key]} value={values[key]} label={label} block={block.name} onChange={onChange}/>)}</div>
     {block.id==='compressor'&&<p className="rack-note">Automatic level compensation · use Output trim to balance the return.</p>}
    </section>;
   })}
   {instrumentSpecs.length>0&&<section className="rack-block rack-instrument" style={{'--rack-colour':'#c6b4a3'}} aria-label="Instrument space">
    <header><RackGraphic kind="instrument"/><div><h3>Instrument space</h3></div></header>
    <div className="rack-controls">{instrumentSpecs.map(spec=><RackControl key={spec.key} spec={spec} value={values[spec.key]} label={spec.label} block="Instrument space" onChange={onChange}/>)}</div>
   </section>}
  </div>
 </div>;
}
