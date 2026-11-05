import React,{useEffect,useRef,useState} from 'react';
import {formatValue,toPosition,fromPosition} from '../params';
import {RACK_PARAMS,cleanRack,RACK_PRESETS} from './params';
import RackGraphic from './RackGraphic';
import './rack.css';
import {UNITS,DEFAULT_CHAIN,orderFromCode,codeFromOrder,moveUnit,cleanOrder,chainUnits,maskFromUnits,addUnit} from './order';

export const BLOCKS=[
 {id:'saturation',name:'Saturation',colour:'#e2a369',keys:[['inserts.saturation','Mix'],['inserts.drive','Drive']]},
 {id:'eq',name:'Equalizer',colour:'#afcb7a',keys:[['inserts.lowGain','Low gain'],['inserts.lowFreq','Low freq'],['inserts.midGain','Mid gain'],['inserts.midFreq','Mid freq'],['inserts.midQ','Mid Q'],['inserts.highGain','High gain'],['inserts.highFreq','High freq']]},
 {id:'phaser',name:'Phaser',colour:'#b0a0e6',keys:[['inserts.phaser','Mix'],['inserts.phaserRate','Rate'],['inserts.phaserDepth','Sweep'],['inserts.phaserFreq','Centre'],['inserts.phaserFeedback','Feedback'],['inserts.phaserSpread','Spread'],['inserts.phaserStages','Stages']]},
 {id:'flanger',name:'Flanger',colour:'#8bbce5',keys:[['inserts.flanger','Mix'],['inserts.flangerRate','Rate'],['inserts.flangerDepth','Depth'],['inserts.flangerDelay','Delay'],['inserts.flangerFeedback','Feedback'],['inserts.flangerSpread','Spread']]},
 {id:'chorus',name:'Chorus',colour:'#7fc7b6',keys:[['inserts.chorus','Mix'],['inserts.chorusRate','Rate'],['inserts.chorusDepth','Depth'],['inserts.chorusSpread','Spread'],['inserts.chorusFeedback','Feedback']]},
 {id:'compressor',name:'Compressor',colour:'#f0bd79',keys:[['compressor.threshold','Threshold'],['compressor.ratio','Ratio'],['compressor.knee','Knee'],['compressor.attack','Attack'],['compressor.release','Release'],['compressor.makeup','Output trim'],['compressor.mix','Mix']]},
 {id:'delay',name:'Delay',colour:'#dca7cf',keys:[['effects.delay','Send'],['master.sync','Sync'],['effects.delayMs','Time'],['effects.feedback','Feedback'],['effects.feedbackLow','Low cut'],['effects.duck','Duck'],['effects.tone','Tone'],['effects.pingPong','Mode'],['effects.delayToReverb','To reverb']]},
 {id:'reverb',name:'Reverb',colour:'#9cbbb8',keys:[['effects.reverb','Send'],['effects.reverbReturn','Return'],['effects.reverbType','Type'],['effects.decay','Decay'],['effects.size','Size'],['effects.damping','Damping'],['effects.predelay','Pre-delay'],['effects.width','Width'],['effects.modulation','Motion'],['effects.reflections','Early refl.'],['effects.quality','Network']]},
 {id:'filter',name:'Filter',colour:'#e7c07a',keys:[['filter.low','Low cut'],['filter.high','High cut'],['filter.slope','Slope']]},
 {id:'tremolo',name:'Tremolo',colour:'#e59a9a',keys:[['tremolo.mix','Mix'],['tremolo.rate','Rate'],['tremolo.depth','Depth'],['tremolo.spread','Spread']]},
 {id:'crusher',name:'Crusher',colour:'#a9b6c8',keys:[['crusher.bits','Bits'],['crusher.divide','Divide'],['crusher.mix','Mix']]},
 {id:'ring',name:'Ring mod',colour:'#d6a0e0',keys:[['ring.freq','Frequency'],['ring.mix','Mix']]},
 {id:'pitch',name:'Pitch',colour:'#8fd0e0',keys:[['pitch.semi','Shift'],['pitch.fine','Fine'],['pitch.mix','Mix']]},
 {id:'width',name:'Width',colour:'#9fe0b0',keys:[['width.amount','Width']]},
 {id:'limiter',name:'Limiter',colour:'#e0d27f',keys:[['limiter.ceiling','Ceiling']]},
 {id:'master',name:'Output',colour:'#d1c6a6',keys:[['inserts.gain','Insert trim']]},
];
// the always-in-reach controls, top right: level into the rack, level out of it, and the dry signal against the effects
export const GLOBAL=[['master.input','Input'],['master.output','Output'],['effects.dry','Dry']];
const CHOICES={'effects.reverbType':['Classic','Room','Hall','Plate'],'filter.slope':['12 dB','24 dB'],'master.sync':['Free','1/4','1/8','1/8 dotted','1/16','1/8 triplet','1/2'],'effects.pingPong':['Stereo','Ping-pong'],'effects.quality':['8 lines','16 lines'],'inserts.bypass':['Active','Bypassed'],'effects.bypass':['Active','Bypassed']};
export function RackControl({spec,value,label,block,onChange,disabled=false}){
 const key=spec.key,options=CHOICES[key]??spec.options,aria=`${block} · ${label}`,set=value=>onChange({[key]:Math.max(spec.min,Math.min(spec.max,value))});
 const scale=spec.unit==='%'?100:1,step=scale===100?.1:spec.curve==='step'?1:spec.unit==='Hz'&&spec.max>100?1:spec.unit==='dB'?.1:.001;
 const number=Number((value*scale).toFixed(4)),[editing,setEditing]=useState(false),[draft,setDraft]=useState(String(number));
 useEffect(()=>{if(!editing)setDraft(String(number));},[number,editing]);
 const display=scale===100?Math.round(value*100)+'%':key==='compressor.ratio'?formatValue(spec,value)+':1':formatValue(spec,value)+(spec.unit==='Hz'?'Hz':spec.unit==='oct'?' oct':'');
 return <label className="rack-control" data-rack-param={key}>
  <span>{label}</span>
  {options?<select aria-label={aria} value={value} disabled={disabled} onChange={e=>set(Number(e.target.value))}>{options.map((s,i)=><option key={i} value={i}>{s}</option>)}</select>:<>
   <input type="range" aria-label={aria} disabled={disabled} min="0" max="1" step="0.001" value={toPosition(spec,value)} style={{"--p":toPosition(spec,value)}} title="Double-click to reset" onDoubleClick={()=>{if(Number.isFinite(spec.default))set(spec.default);}} onChange={e=>set(Number(fromPosition(spec,Number(e.target.value)).toFixed(6)))}/>
   <span className="rack-value"><input aria-label={aria+' value'} disabled={disabled} type="number" min={spec.min*scale} max={spec.max*scale} step={step} value={editing?draft:number} title="Enter or leave the field to apply" onFocus={()=>{setDraft(String(number));setEditing(true);}} onChange={e=>{setEditing(true);setDraft(e.target.value);}} onBlur={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))set(e.target.valueAsNumber/scale);setEditing(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}else if(e.key==='Escape'){e.preventDefault();e.currentTarget.value=String(number);e.currentTarget.blur();}}}/><output>{display}</output></span>
  </>}
 </label>;
}

/** Delay time in milliseconds for a sync division (the 'master.sync' choices: 0 free, then 1/4, 1/8, dotted 1/8, 1/16, triplet 1/8, 1/2) at a tempo. */
export const syncedDelayMs=(division,bpm)=>{const beats=[0,1,.5,.75,.25,1/3,2][division];return beats&&bpm>0?60000/bpm*beats:0;};

/** The unit a tile moves with: Delay and Reverb are one unit ("space"); the instrument and the output do not move. */
export const unitOf=id=>id==='delay'||id==='reverb'?'space':id==='master'||id==='instrument'?null:id;
const UNIT_NAMES={space:'Delay + Reverb',saturation:'Saturation',eq:'Equalizer',phaser:'Phaser',flanger:'Flanger',chorus:'Chorus',compressor:'Compressor',filter:'Filter',tremolo:'Tremolo',crusher:'Bit crusher',ring:'Ring modulator',pitch:'Pitch shifter',width:'Stereo width',limiter:'Limiter'};
const UNIT_NOTES={filter:'low and high cut',tremolo:'volume wobble, auto-pan',crusher:'lo-fi bits and sample rate',ring:'metallic, bell-like tones',pitch:'octave up or down, harmonies',width:'mono to extra wide',limiter:'stops peaks clipping',saturation:'drive and warmth',eq:'three-band tone',phaser:'swirling sweep',flanger:'jet sweep',chorus:'thicken and widen',compressor:'level and glue',space:'echo and room'};
/** The units a set of rack values actually uses (any control away from its default), so a preset can bring them into the chain. */
export function unitsUsedBy(values){
 const clean=cleanRack(),used=[];
 for(const unit of UNITS){
  const keys=BLOCKS.filter(b=>unitOf(b.id)===unit).flatMap(b=>b.keys.map(k=>k[0])).concat(unit==='compressor'?['compressor.enabled']:[]);
  if(keys.some(k=>values[k]!==undefined&&values[k]!==clean[k]))used.push(unit);
 }
 return used;
}

/**
 * The rack as the panels show it: the tiles in signal order (the instrument first when the synth has instrument space, then
 * the effects in the stored order, then the output), which ones are on, and how to move one.
 */
export function useRackModel({values,onChange,instrumentSpecs=[],tempo=0}){
 const order=orderFromCode(values['master.order']??0),chain=chainUnits(values['master.chain']??DEFAULT_CHAIN);
 const blocks=BLOCKS.map(block=>{const toggle=block.id==='compressor'?'compressor.enabled':block.id==='master'?null:'switch.'+block.id;return {...block,toggle,on:toggle?values[toggle]===1:true};});
 const byId=Object.fromEntries(blocks.map(b=>[b.id,b]));
 const tiles=[...(instrumentSpecs.length?[{id:'instrument',name:'Instrument',colour:'#c6b4a3',toggle:null,on:true}]:[]),...order.filter(u=>chain.includes(u)).flatMap(u=>u==='space'?['delay','reverb']:[u]).map(id=>byId[id]),byId.master];
 const setOrder=next=>onChange({'master.order':codeFromOrder(cleanOrder(next))});
 // moves are among the units in the chain; the ones out of it keep their places at the end
 const visible=order.filter(u=>chain.includes(u));
 const moveBy=(id,d)=>{const u=unitOf(id);if(!u)return;const to=visible[visible.indexOf(u)+d];if(to)setOrder(moveUnit(order,u,order.indexOf(to)));};
 const moveTo=(id,targetId)=>{const u=unitOf(id),t=unitOf(targetId);if(u&&t&&u!==t)setOrder(moveUnit(order,u,order.indexOf(t)));};
 const canMove=(id,d)=>{const u=unitOf(id);if(!u)return false;const i=visible.indexOf(u);return d<0?i>0:i<visible.length-1;};
 // adding puts a unit beside the one it usually follows, removing takes it out of the chain (its settings stay)
 const available=UNITS.filter(u=>!chain.includes(u)).map(u=>({unit:u,name:UNIT_NAMES[u],note:UNIT_NOTES[u],tile:u==='space'?'delay':u}));
 const addToChain=u=>{onChange({'master.chain':maskFromUnits([...chain,u]),'master.order':codeFromOrder(addUnit(order,u))});return u==='space'?'delay':u;};
 const removeFromChain=id=>{const u=unitOf(id);if(u)onChange({'master.chain':maskFromUnits(chain.filter(c=>c!==u))});};
 return {order,chain,blocks,tiles,tempo,moveBy,moveTo,canMove,available,addToChain,removeFromChain};
}

/**
 * The signal chain as a loop: the top row runs left to right, the bottom row right to left, so the last tile of the top row
 * sits over the first of the bottom row. A tap selects a tile (after `tapDelay` ms, so that a second tap can be told apart), a
 * double tap switches it on or off, and a tile can be dragged onto another to move it (Delay and Reverb move together).
 */
export function RackChain({tiles,selected,onSelect,onToggle,onMoveTo,movable=true,tapDelay=0}){
 const half=Math.ceil(tiles.length/2),last=useRef({id:'',at:0,timer:0}),drag=useRef(null),suppress=useRef(false),[over,setOver]=useState('');
 useEffect(()=>()=>clearTimeout(last.current.timer),[]);
 const tap=t=>{
  const now=Date.now(),l=last.current,again=l.id===t.id&&now-l.at<350;
  clearTimeout(l.timer);
  if(again){last.current={id:'',at:0,timer:0};if(t.toggle)onToggle(t);else onSelect(t.id);return;}
  last.current={id:t.id,at:now,timer:tapDelay?setTimeout(()=>onSelect(t.id),tapDelay):0};
  if(!tapDelay)onSelect(t.id);
 };
 const tileAt=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-tile]')?.dataset.tile??'';
 const down=(e,t)=>{if(movable&&unitOf(t.id))drag.current={id:t.id,x:e.clientX,y:e.clientY,moved:false};};
 const move=e=>{const d=drag.current;if(!d)return;if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)d.moved=true;if(d.moved)setOver(tileAt(e));};
 const up=e=>{
  const d=drag.current;drag.current=null;setOver('');
  if(d?.moved){const target=tileAt(e);if(target&&target!==d.id)onMoveTo(d.id,target);suppress.current=true;setTimeout(()=>{suppress.current=false;},0);}
 };
 return <div className="rack-chain-grid" style={{'--cols':half}} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setOver('');}}>
  {tiles.map((t,i)=>{
   const back=i>=half,col=back?half-(i-half):i+1,isLast=i===tiles.length-1,turn=i===half-1,pair=t.id==='delay'||t.id==='reverb';
   return <div className={'rack-cell'+(back?' is-back':'')+(turn?' is-turn':'')+(isLast?' is-last':'')+(over===t.id?' is-drop':'')} key={t.id} data-tile={t.id} style={{gridRow:back?2:1,gridColumn:col}}>
    <button type="button" className={'rack-tile'+(t.id===selected?' is-selected':'')+(t.on?'':' is-bypassed')+(pair?' is-pair':'')} style={{'--rack-colour':t.colour}} aria-pressed={t.id===selected} aria-label={'Edit '+t.name}
     title={(t.toggle?(t.on?'On':'Off')+' · tap to edit, double-tap to '+(t.on?'bypass':'turn on'):'Tap to edit')+(movable&&unitOf(t.id)?' · drag to reorder':'')}
     onPointerDown={e=>down(e,t)} onClick={()=>{if(!suppress.current)tap(t);}}>
     <RackGraphic kind={t.id} on={t.on}/><b>{t.name}</b>
    </button>
    {!isLast&&<i className="rack-arrow" aria-hidden="true">{turn?'↓':back?'←':'→'}</i>}
   </div>;
  })}
 </div>;
}

/** Input, output and dry level as horizontal sliders. */
export function RackLevels({values,onChange}){
 return <div className="rack-globals" role="group" aria-label="Rack level controls">
  {GLOBAL.map(([key,label])=><RackControl key={key} spec={RACK_PARAMS.BY_KEY[key]} value={values[key]} label={label} block="Rack" onChange={onChange}/>)}
 </div>;
}

/** One effect's controls (faders in a row), with its on/off switch and, when it can move, earlier and later buttons. */
// specs: the parameter table the keys belong to (the rack's own unless a caller brings its own); headerProps: spread on the header, so a window can be dragged by it
export function RackEffect({block,values,onChange,hidden,reduction=0,instrumentSpecs=[],model,movable=true,specs=RACK_PARAMS.BY_KEY,headerProps}){
 const instrument=block.id==='instrument';
 // the first Mix / Send goes up beside the header, the dropdowns go in a row under the sliders
 const keys=instrument?[]:block.keys.filter(([key])=>key!=='master.sync'||model?.tempo>0);
 const mix=keys.find(([,label])=>label==='Mix'||label==='Send');
 const choiceOf=k=>CHOICES[k[0]]??specs[k[0]]?.options,sliders=keys.filter(k=>k!==mix&&!choiceOf(k)),choices=keys.filter(k=>k!==mix&&choiceOf(k));
 const control=([key,label])=><RackControl key={key} spec={specs[key]} value={values[key]} label={label} block={block.name} onChange={onChange} disabled={key==='effects.delayMs'&&values['master.sync']>0}/>;
 return <section className={'rack-block'+(block.on?'':' is-bypassed')+(instrument?' rack-instrument':'')} hidden={hidden} style={{'--rack-colour':block.colour}} aria-label={instrument?'Instrument space':block.name}>
  <header {...headerProps}><RackGraphic kind={block.id} on={block.on}/><div><h3>{instrument?'Instrument space':block.name}</h3></div>
   {block.toggle&&<button type="button" aria-label={block.name+' enabled'} aria-pressed={block.on} onClick={()=>onChange({[block.toggle]:block.on?0:1})}><i/>{block.on?'On':'Off'}</button>}
   {model?.removeFromChain&&unitOf(block.id)&&<button type="button" className="rack-remove" aria-label={'Remove '+block.name+' from the chain'} title="Take it out of the chain (its settings are kept)" onClick={()=>model.removeFromChain(block.id)}>✕ Remove</button>}
   {mix&&<div className="rack-mix">{control(mix)}</div>}
   {movable&&model&&unitOf(block.id)&&<span className="rack-move" role="group" aria-label={block.name+' position'}>
    <button type="button" aria-label={'Move '+block.name+' earlier'} disabled={!model.canMove(block.id,-1)} onClick={()=>model.moveBy(block.id,-1)} title="Move earlier in the chain">◀</button>
    <button type="button" aria-label={'Move '+block.name+' later'} disabled={!model.canMove(block.id,1)} onClick={()=>model.moveBy(block.id,1)} title="Move later in the chain">▶</button>
   </span>}
  </header>
  <div className={block.id==='compressor'?'rack-body':'rack-body is-plain'}>
  {block.id==='compressor'&&<div className="rack-reduction"><span>Gain reduction</span><meter min="0" max="24" value={Math.min(24,Math.abs(reduction))}/><output>{Math.abs(reduction).toFixed(1)} dB</output></div>}
  <div className="rack-controls">{instrument
   ?instrumentSpecs.map(spec=><RackControl key={spec.key} spec={spec} value={values[spec.key]} label={spec.label} block="Instrument space" onChange={onChange}/>)
   :sliders.map(control)}</div>
  </div>
  {choices.length>0&&<div className="rack-choices">{choices.map(control)}</div>}
  {block.note&&<p className="rack-note">{block.note}</p>}
  {block.id==='compressor'&&<p className="rack-note">Automatic level compensation · use Output trim to balance the return.</p>}
  {(block.id==='phaser'||block.id==='flanger'||block.id==='chorus')&&<p className="rack-note">Stereo effect: the left and right sides modulate out of step, so a mono sound comes out wide.</p>}
 </section>;
}

/** The "Add effect" menu: the units that are not in the chain. Choosing one puts it in and hands back the tile to open. */
export function RackAdd({model,onAdded}){
 if(!model.available.length)return null;
 return <label className="rack-preset rack-add"><span className="rack-add-label">Add</span>
  <select aria-label="Add effect" value="" onChange={e=>{if(e.target.value)onAdded?.(model.addToChain(e.target.value));}}>
   <option value="" disabled>Add effect…</option>
   {model.available.map(a=><option key={a.unit} value={a.unit}>{a.name} · {a.note}</option>)}
  </select></label>;
}

/** A preset that keeps the player's order and chain, and adds any unit the preset itself uses. */
export function presetValues(preset,values){
 const mask=maskFromUnits([...new Set([...chainUnits(values['master.chain']??DEFAULT_CHAIN),...unitsUsedBy(preset.values)])]);
 return {...preset.values,'master.order':values['master.order']??0,'master.chain':mask};
}
