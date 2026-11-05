import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {formatValue,toPosition,fromPosition} from '../params';
import {RACK_PARAMS,cleanRack,RACK_PRESETS} from './params';
import RackGraphic from './RackGraphic';
import './rack.css';
import {UNITS,TAIL_UNITS,DEFAULT_CHAIN,orderFromCode,codeFromOrder,moveUnit,cleanOrder,chainUnits,maskFromUnits,addUnit} from './order';

// a tile of the chain display is TILE px square; at least MIN_GAP px between two
const TILE=80,MIN_GAP=28;
export const BLOCKS=[
 {id:'saturation',name:'Saturation',colour:'#e2a369',keys:[['inserts.saturation','Mix'],['inserts.drive','Drive']]},
 {id:'eq',name:'Equalizer',colour:'#afcb7a',keys:[['inserts.lowGain','Low gain'],['inserts.lowFreq','Low freq'],['inserts.midGain','Mid gain'],['inserts.midFreq','Mid freq'],['inserts.midQ','Mid Q'],['inserts.highGain','High gain'],['inserts.highFreq','High freq']]},
 {id:'phaser',name:'Phaser',colour:'#b0a0e6',keys:[['inserts.phaser','Mix'],['inserts.phaserRate','Rate'],['inserts.phaserDepth','Sweep'],['inserts.phaserFreq','Centre'],['inserts.phaserFeedback','Feedback'],['inserts.phaserSpread','Spread'],['inserts.phaserStages','Stages']]},
 {id:'flanger',name:'Flanger',colour:'#8bbce5',keys:[['inserts.flanger','Mix'],['inserts.flangerRate','Rate'],['inserts.flangerDepth','Depth'],['inserts.flangerDelay','Delay'],['inserts.flangerFeedback','Feedback'],['inserts.flangerSpread','Spread']]},
 {id:'chorus',name:'Chorus',colour:'#7fc7b6',keys:[['inserts.chorus','Mix'],['inserts.chorusRate','Rate'],['inserts.chorusDepth','Depth'],['inserts.chorusSpread','Spread'],['inserts.chorusFeedback','Feedback']]},
 {id:'compressor',name:'Compressor',colour:'#f0bd79',keys:[['compressor.threshold','Threshold'],['compressor.ratio','Ratio'],['compressor.knee','Knee'],['compressor.attack','Attack'],['compressor.release','Release'],['compressor.makeup','Output trim'],['compressor.mix','Mix']]},
 {id:'delay',name:'Delay',colour:'#dca7cf',keys:[['effects.delay','Send'],['master.sync','Sync'],['effects.delayMs','Time'],['effects.feedback','Feedback'],['effects.feedbackLow','Low cut'],['effects.duck','Duck'],['effects.tone','Tone'],['effects.pingPong','Mode'],['effects.delayToReverb','To reverb']]},
 {id:'reverb',name:'Reverb',colour:'#9cbbb8',keys:[['effects.reverb','Send'],['effects.reverbReturn','Return'],['effects.dry','Dry level'],['effects.reverbType','Type'],['effects.decay','Decay'],['effects.size','Size'],['effects.damping','Damping'],['effects.predelay','Pre-delay'],['effects.width','Width'],['effects.modulation','Motion'],['effects.reflections','Early refl.'],['effects.quality','Network']]},
 {id:'filter',name:'Filter',colour:'#e7c07a',keys:[['filter.type','Type'],['filter.low','Low cut'],['filter.high','High cut'],['filter.slope','Slope'],['filter.cutoff','Cutoff'],['filter.q','Q'],['filter.gain','Gain']]},
 {id:'tremolo',name:'Tremolo',colour:'#e59a9a',keys:[['tremolo.mix','Mix'],['tremolo.rate','Rate'],['tremolo.depth','Depth'],['tremolo.spread','Spread']]},
 {id:'crusher',name:'Crusher',colour:'#a9b6c8',keys:[['crusher.bits','Bits'],['crusher.divide','Divide'],['crusher.mix','Mix']]},
 {id:'ring',name:'Ring mod',colour:'#d6a0e0',keys:[['ring.freq','Frequency'],['ring.mix','Mix']]},
 {id:'pitch',name:'Pitch',colour:'#8fd0e0',keys:[['pitch.semi','Shift'],['pitch.fine','Fine'],['pitch.mix','Mix']]},
 {id:'width',name:'Width',colour:'#9fe0b0',keys:[['width.amount','Width']]},
 {id:'limiter',name:'Limiter',colour:'#e0d27f',keys:[['limiter.ceiling','Ceiling']]},
 {id:'tape',name:'Tape',colour:'#d8b98c',keys:[['tape.wow','Wow'],['tape.wowRate','Wow rate'],['tape.flutter','Flutter'],['tape.drive','Saturation'],['tape.tone','Tone']]},
 {id:'shimmer',name:'Shimmer',colour:'#a9c8ec',keys:[['shimmer.mix','Mix'],['shimmer.decay','Decay'],['shimmer.interval','Interval'],['shimmer.climb','Climb'],['shimmer.tone','Tone']]},
 {id:'freeze',name:'Freeze',colour:'#9fd6e0',keys:[['freeze.mix','Mix'],['freeze.length','Length'],['freeze.fade','Fade'],['freeze.hold','Hold']]},
 {id:'input',name:'Input',colour:'#c6b4a3',keys:[['master.input','Level']]},
 {id:'master',name:'Output',colour:'#d1c6a6',keys:[['master.output','Level'],['inserts.gain','Insert trim']]},
];
// the always-in-reach controls, top right: level into the rack, level out of it, and the dry signal against the effects
// the one level left under the chain: how much of the sound goes through it (the input and output levels are the Input and Output boxes)
export const GLOBAL=[['master.mix','Wet/dry']];
const CHOICES={'shimmer.interval':['Fifth','Octave','12th','2 oct'],'freeze.hold':['Off','On'],'effects.reverbType':['Classic','Room','Hall','Plate'],'filter.slope':['12 dB','24 dB'],'filter.type':['Cuts','Low-pass','High-pass','Band-pass','Notch','Low shelf','High shelf'],'master.sync':['Free','1/4','1/8','1/8 dotted','1/16','1/8 triplet','1/2'],'effects.pingPong':['Stereo','Ping-pong'],'effects.quality':['8 lines','16 lines'],'inserts.bypass':['Active','Bypassed'],'effects.bypass':['Active','Bypassed']};
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
export const unitOf=id=>id==='delay'||id==='reverb'?'space':id==='master'||id==='instrument'||id==='input'?null:id;
const UNIT_NAMES={space:'Delay + Reverb',saturation:'Saturation',eq:'Equalizer',phaser:'Phaser',flanger:'Flanger',chorus:'Chorus',compressor:'Compressor',filter:'Filter',tremolo:'Tremolo',crusher:'Bit crusher',ring:'Ring modulator',pitch:'Pitch shifter',width:'Stereo width',limiter:'Limiter',tape:'Tape',shimmer:'Shimmer',freeze:'Freeze'};
const UNIT_NOTES={filter:'cuts, low-pass, high-pass, band-pass, notch, shelves',tremolo:'volume wobble, auto-pan',crusher:'lo-fi bits and sample rate',ring:'metallic, bell-like tones',pitch:'octave up or down, harmonies',width:'mono to extra wide',limiter:'stops peaks clipping',tape:'wow, flutter and warmth',shimmer:'a rising, pitch-shifted tail',freeze:'holds a moment as a pad',saturation:'drive and warmth',eq:'three-band tone',phaser:'swirling sweep',flanger:'jet sweep',chorus:'thicken and widen',compressor:'level and glue',space:'echo and room'};
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
 * The units in the chain that are doing something with these rack values, as against ones that are in the chain but leave the sound as it is (a
 * phaser at 0% mix, an equaliser with flat gains, a compressor that is off). A unit switched off is not doing anything either.
 * What a unit does to the sound is what it is asked for: the dry level and the sends for the space unit, the mix for the modulation
 * effects, the gains for the equaliser, and so on. The filter, limiter and width unit have no neutral setting, so they count as
 * active while they are on.
 */
export function activeUnits(values){
 const v=k=>values[k]??cleanRack()[k],on=u=>u==='compressor'?v('compressor.enabled')===1:v('switch.'+u)!==0;
 const active={
  saturation:()=>v('inserts.saturation')>0,
  eq:()=>v('inserts.lowGain')!==0||v('inserts.midGain')!==0||v('inserts.highGain')!==0,
  phaser:()=>v('inserts.phaser')>0,flanger:()=>v('inserts.flanger')>0,chorus:()=>v('inserts.chorus')>0,
  compressor:()=>v('compressor.mix')>0,
  space:()=>(v('switch.delay')!==0&&v('effects.delay')>0)||(v('switch.reverb')!==0&&v('effects.reverb')>0)||v('effects.dry')!==1,
  filter:()=>true,tremolo:()=>v('tremolo.mix')>0&&v('tremolo.depth')>0,
  crusher:()=>v('crusher.mix')>0&&(v('crusher.bits')<16||v('crusher.divide')>1),
  ring:()=>v('ring.mix')>0,pitch:()=>v('pitch.mix')>0&&(v('pitch.semi')!==0||v('pitch.fine')!==0),
  width:()=>v('width.amount')!==1,limiter:()=>true,
  tape:()=>v('tape.wow')>0||v('tape.flutter')>0||v('tape.drive')>0,shimmer:()=>v('shimmer.mix')>0,freeze:()=>v('freeze.mix')>0,
 };
 // only units in the chain can be active: a unit that is not in it is not running, whatever its settings
 return chainUnits(values['master.chain']??DEFAULT_CHAIN).filter(u=>on(u)&&active[u]());
}
/** The chain mask with only the units that are doing something. */
export const leanChain=values=>maskFromUnits(activeUnits(values));

/**
 * The rack as the panels show it: the tiles in signal order (the instrument first when the synth has instrument space, then
 * the effects in the stored order, then the output), which ones are on, and how to move one.
 */
// The instrument's own space (the voice's chorus, and a reverb on the synths that have one): its mix controls are the ones that make it audible
const isMix=spec=>/(chorusMix|reverbMix|global\.chorus)$/.test(spec.key);
export function useRackModel({values,onChange,instrumentSpecs=[],tempo=0}){
 const order=orderFromCode(values['master.order']??0),chain=chainUnits(values['master.chain']??DEFAULT_CHAIN);
 const blocks=BLOCKS.map(block=>{const toggle=block.id==='compressor'?'compressor.enabled':block.id==='master'||block.id==='input'?null:'switch.'+block.id;return {...block,toggle,on:toggle?values[toggle]===1:true};});
 const byId=Object.fromEntries(blocks.map(b=>[b.id,b]));
 // it is a chorus when chorus is all it has, and it leaves the chain, like any effect, while its mix is at nothing
 const mixSpecs=instrumentSpecs.filter(isMix),chorusOnly=mixSpecs.length>0&&mixSpecs.every(m=>/chorus/i.test(m.key));
 const instrumentName=chorusOnly?(chain.includes('chorus')?'Voice chorus':'Chorus'):'Instrument';
 const instrumentOn=instrumentSpecs.length>0&&(!mixSpecs.length||mixSpecs.some(m=>values[m.key]>0));
 const reverbFirst=values['master.reverbFirst']>=.5;
 const tiles=[byId.input,...(instrumentOn?[{id:'instrument',name:instrumentName,colour:'#c6b4a3',toggle:null,on:true,graphic:chorusOnly?'chorus':'instrument'}]:[]),...order.filter(u=>chain.includes(u)).flatMap(u=>u==='space'?(reverbFirst?['reverb','delay']:['delay','reverb']):[u]).map(id=>byId[id]),byId.master];
 const setOrder=next=>onChange({'master.order':codeFromOrder(cleanOrder(next))});
 // moves are among the units in the chain; the ones out of it keep their places at the end
 const visible=order.filter(u=>chain.includes(u)&&!TAIL_UNITS.includes(u));
 const moveBy=(id,d)=>{const u=unitOf(id);if(!u||TAIL_UNITS.includes(u))return;const to=visible[visible.indexOf(u)+d];if(to)setOrder(moveUnit(order,u,order.indexOf(to)));};
 const moveTo=(id,targetId)=>{
  // the two halves of the space unit trade places
  if(id!==targetId&&unitOf(id)==='space'&&unitOf(targetId)==='space'){onChange({'master.reverbFirst':reverbFirst?0:1});return;}
  const u=unitOf(id),t=unitOf(targetId);if(u&&t&&u!==t&&!TAIL_UNITS.includes(u)&&!TAIL_UNITS.includes(t))setOrder(moveUnit(order,u,order.indexOf(t)));};
 const canMove=(id,d)=>{const u=unitOf(id);if(!u||TAIL_UNITS.includes(u))return false;const i=visible.indexOf(u);return d<0?i>0:i<visible.length-1;};
 // adding puts a unit beside the one it usually follows, removing takes it out of the chain (its settings stay)
 const available=[...(instrumentSpecs.length&&!instrumentOn?[{unit:'instrument',name:instrumentName,note:chorusOnly?"the voice's own chorus":"the voice's own space",tile:'instrument'}]:[]),...UNITS.filter(u=>!chain.includes(u)).map(u=>({unit:u,name:UNIT_NAMES[u],note:UNIT_NOTES[u],tile:u==='space'?'delay':u}))];
// putting the voice's chorus back is turning its mix up
 const addToChain=u=>{if(u==='instrument'){const m=mixSpecs[0];if(m)onChange({[m.key]:m.default>0?m.default:.4});return 'instrument';}onChange({'master.chain':maskFromUnits([...chain,u]),'master.order':codeFromOrder(addUnit(order,u))});return u==='space'?'delay':u;};
 const removeFromChain=id=>{if(id==='instrument'){const m=mixSpecs[0];if(m)onChange({[m.key]:0});return;}const u=unitOf(id);if(u)onChange({'master.chain':maskFromUnits(chain.filter(c=>c!==u))});};
 // clean up: take out every unit that is in the chain but doing nothing (their settings are kept)
 const idle=chain.filter(u=>!activeUnits(values).includes(u));
 const cleanUp=()=>{if(idle.length)onChange({'master.chain':maskFromUnits(chain.filter(c=>!idle.includes(c)))});};
 return {order,chain,blocks,tiles,tempo,instrumentName,moveBy,moveTo,canMove,available,addToChain,removeFromChain,idle,cleanUp};
}

/**
 * The signal chain as a loop: the top row runs left to right, the bottom row right to left, so the last tile of the top row
 * sits over the first of the bottom row. A tap selects a tile (after `tapDelay` ms, so that a second tap can be told apart), a
 * double tap switches it on or off, and a tile can be dragged onto another to move it (Delay and Reverb move together).
 */
export function RackChain({tiles,selected,onSelect,onToggle,onMoveTo,movable=true,tapDelay=0}){
 const wrap=useRef(null),last=useRef({id:'',at:0,timer:0}),press=useRef(null),suppress=useRef(false),[fit,setFit]=useState(6),[drag,setDrag]=useState(null);
 useEffect(()=>()=>clearTimeout(last.current.timer),[]);
 // how many tiles a row holds at this width; one, two or three rows are used as the chain needs
 useLayoutEffect(()=>{
  const el=wrap.current;if(!el)return;
  const measure=()=>setFit(Math.max(3,Math.floor((el.clientWidth-20+MIN_GAP)/(TILE+MIN_GAP))));
  measure();const ro=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;ro?.observe(el);
  return ()=>ro?.disconnect();
 },[]);
 const rows=Math.max(1,Math.min(3,Math.ceil(tiles.length/fit))),per=Math.ceil(tiles.length/rows);
 const lines=Array.from({length:rows},(_,r)=>tiles.slice(r*per,(r+1)*per)).filter(l=>l.length);
 const tap=t=>{
  const now=Date.now(),l=last.current,again=l.id===t.id&&now-l.at<350;
  clearTimeout(l.timer);
  if(again){last.current={id:'',at:0,timer:0};if(t.toggle)onToggle(t);else onSelect(t.id);return;}
  last.current={id:t.id,at:now,timer:tapDelay?setTimeout(()=>onSelect(t.id),tapDelay):0};
  if(!tapDelay)onSelect(t.id);
 };
 // Only the effects can be picked up: the input, the voice's chorus and the output are fixed at the start and the end of the chain, and
 // tape, shimmer and freeze keep their place after the others. A picked-up tile follows the pointer; the movable tile nearest to it takes the drop.
 const canMove=t=>movable&&!!unitOf(t.id)&&!TAIL_UNITS.includes(unitOf(t.id));
 const nearest=(x,y,except)=>{
  let best=null,near=TILE*1.1;
  for(const el of wrap.current?.querySelectorAll('[data-movable="1"]')??[]){
    if(el.dataset.tile===except)continue;
    const r=el.getBoundingClientRect(),d=Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2));
    if(d<near){near=d;best=el.dataset.tile;}
  }
  return best;
 };
 const down=(e,t)=>{
  if(!canMove(t)||e.button>0)return;
  const r=e.currentTarget.getBoundingClientRect();
  press.current={t,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height,active:false,id:e.pointerId};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const move=e=>{
  const p=press.current;if(!p||p.id!==e.pointerId)return;
  if(!p.active){if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)return;p.active=true;}
  setDrag({t:p.t,x:e.clientX-p.dx,y:e.clientY-p.dy,w:p.w,h:p.h,over:nearest(e.clientX,e.clientY,p.t.id)});
 };
 const finish=(e,cancelled)=>{
  const p=press.current;if(!p||p.id!==e.pointerId)return;
  press.current=null;
  if(p.active){
   const target=cancelled?null:nearest(e.clientX,e.clientY,p.t.id);
   setDrag(null);if(target)onMoveTo(p.t.id,target);
   suppress.current=true;setTimeout(()=>{suppress.current=false;},0);
  }
 };
 // A display of fixed height: one row sits on the centre line, two sit above and below it, three fill it. The signal runs along the
 // first row, back along the second and along again on a third; the first tile is at the near end of its row, the output at the far end of its.
 // Each connector runs from the edge of one tile to the edge of the next, and a turn from the foot of one row to the head of the next.
 return <div className={'rack-display'+(drag?' is-dragging':'')} data-rows={lines.length} ref={wrap}>
  {lines.map((line,r)=>{
   const back=r%2===1,turns=r<lines.length-1;
   return <div className={'rack-line'+(back?' is-back':'')} key={r}>
    {line.map((t,i)=>{
     const pair=t.id==='delay'||t.id==='reverb',end=i===line.length-1,mine=canMove(t);
     // the two halves of the space unit side by side are drawn as one group, in a box of their own
     const second=pair&&i>0&&(line[i-1].id==='delay'||line[i-1].id==='reverb'),first=pair&&!end&&(line[i+1].id==='delay'||line[i+1].id==='reverb');
     const cell=<div className={'rack-cell'+(back?' is-back':'')+(drag?.over===t.id?' is-drop':'')+(drag?.t.id===t.id?' is-lifted':'')} data-tile={t.id} data-movable={mine?'1':'0'}>
       <button type="button" className={'rack-tile'+(t.id===selected?' is-selected':'')+(t.on?'':' is-bypassed')+(pair&&!first&&!second?' is-pair':'')+(mine?' is-movable':'')} style={{'--rack-colour':t.colour}} aria-pressed={t.id===selected} aria-label={'Edit '+t.name}
        title={(t.toggle?(t.on?'On':'Off')+' · tap to edit, double-tap to '+(t.on?'bypass':'turn on'):'Tap to edit')+(mine?' · drag to reorder':'')}
        onPointerDown={e=>down(e,t)} onPointerMove={move} onPointerUp={e=>finish(e,false)} onPointerCancel={e=>finish(e,true)} onClick={()=>{if(!suppress.current)tap(t);}}>
        <RackGraphic kind={t.graphic??t.id} on={t.on}/><b>{t.name}</b>
       </button>
       {end&&turns&&<i className="rack-turn" aria-hidden="true"/>}
      </div>;
     if(second)return null; // drawn with the first of the two
     if(first){
      const u=line[i+1];
      const other=<div className={'rack-cell'+(back?' is-back':'')+(drag?.over===u.id?' is-drop':'')+(drag?.t.id===u.id?' is-lifted':'')} data-tile={u.id} data-movable={canMove(u)?'1':'0'}>
       <button type="button" className={'rack-tile'+(u.id===selected?' is-selected':'')+(u.on?'':' is-bypassed')+(canMove(u)?' is-movable':'')} style={{'--rack-colour':u.colour}} aria-pressed={u.id===selected} aria-label={'Edit '+u.name}
        title={(u.toggle?(u.on?'On':'Off')+' · tap to edit, double-tap to '+(u.on?'bypass':'turn on'):'Tap to edit')+(canMove(u)?' · drag to swap':'')}
        onPointerDown={e=>down(e,u)} onPointerMove={move} onPointerUp={e=>finish(e,false)} onPointerCancel={e=>finish(e,true)} onClick={()=>{if(!suppress.current)tap(u);}}>
        <RackGraphic kind={u.graphic??u.id} on={u.on}/><b>{u.name}</b>
       </button>
       {i+1===line.length-1&&turns&&<i className="rack-turn" aria-hidden="true"/>}
      </div>;
      const last=i+1===line.length-1;
      return <React.Fragment key={t.id}>
       <div className="rack-group" data-label={t.name+' + '+u.name}>{cell}<i className="rack-arrow is-short" aria-hidden="true"/>{other}</div>
       {!last&&<i className="rack-arrow" aria-hidden="true"/>}
      </React.Fragment>;
     }
     return <React.Fragment key={t.id}>
      {cell}
      {!end&&<i className="rack-arrow" aria-hidden="true"/>}
     </React.Fragment>;
    })}
   </div>;
  })}
  {drag&&createPortal(<div className="rack-ghost" aria-hidden="true" style={{left:drag.x,top:drag.y,width:drag.w,height:drag.h,'--rack-colour':drag.t.colour}}><RackGraphic kind={drag.t.graphic??drag.t.id} on={drag.t.on}/><b>{drag.t.name}</b></div>,document.body)}
 </div>;
}

/** The wet / dry slider: how much of the sound goes through the chain (0% is the sound as it came in, 100% all of it through the effects). */
export function RackLevels({values,onChange}){
 return <div className="rack-globals" role="group" aria-label="Rack level controls">
  {GLOBAL.map(([key,label])=><RackControl key={key} spec={RACK_PARAMS.BY_KEY[key]} value={values[key]} label={label} block="Rack" onChange={onChange}/>)}
 </div>;
}

/** One effect's controls (faders in a row), with its on/off switch and, when it can move, earlier and later buttons. */
// specs: the parameter table the keys belong to (the rack's own unless a caller brings its own); headerProps: spread on the header, so a window can be dragged by it
export function RackEffect({block,values,onChange,hidden,reduction=0,instrumentSpecs=[],model,movable=true,specs=RACK_PARAMS.BY_KEY,headerProps,renderChoice}){
 const instrument=block.id==='instrument';
 // the first Mix / Send goes up beside the header, the dropdowns go in a row under the sliders
 // the filter shows the controls of its type: the cut pair, a cutoff and Q, or a cutoff and gain for the shelves
 const filterShows=block.id==='filter'?(t=>t===0?['low','high','slope']:t<=4?['cutoff','q']:['cutoff','gain'])(Math.round(values['filter.type']??0)):null;
 const keys=instrument?[]:block.keys.filter(([key])=>(key!=='master.sync'||model?.tempo>0)&&(!filterShows||key==='filter.type'||filterShows.includes(key.slice(7))));
 const instrumentMix=instrument?instrumentSpecs.find(isMix):null;
 const mix=keys.find(([,label])=>label==='Mix'||label==='Send'||label==='Level');
 const choiceOf=k=>CHOICES[k[0]]??specs[k[0]]?.options,sliders=keys.filter(k=>k!==mix&&!choiceOf(k)),choices=keys.filter(k=>k!==mix&&choiceOf(k));
 // Hold is a big latching button and a short list is a column of pills, on the right of the faders
 const aside=k=>k[0]==='freeze.hold'||k[0]==='shimmer.interval';
 const special=([key,label])=>{
  const spec=specs[key],v=values[key];
  if(key==='freeze.hold')return <button type="button" key={key} className="rack-hold" aria-pressed={v===1} aria-label={block.name+' · '+label} title="Keep the frozen sound sounding until you let go of it" onClick={()=>onChange({[key]:v===1?0:1})}><b>{label}</b><span>{v===1?'On':'Off'}</span></button>;
  const options=CHOICES[key];
  return <div className="rack-pills" key={key} role="radiogroup" aria-label={block.name+' · '+label}><small>{label}</small>{options.map((o,i)=><button type="button" key={i} role="radio" aria-checked={v===i} className={v===i?'on':''} onClick={()=>onChange({[key]:i})}>{o}</button>)}</div>;
 };
 const control=([key,label])=><RackControl key={key} spec={specs[key]} value={values[key]} label={label} block={block.name} onChange={onChange} disabled={key==='effects.delayMs'&&values['master.sync']>0}/>;
 return <section className={'rack-block'+(block.on?'':' is-bypassed')+(instrument?' rack-instrument':'')} hidden={hidden} style={{'--rack-colour':block.colour}} aria-label={instrument?'Instrument space':block.name}>
  <header {...headerProps}><RackGraphic kind={block.graphic??block.id} on={block.on}/><div><h3>{block.name}</h3></div>
   {block.toggle&&<button type="button" aria-label={block.name+' enabled'} aria-pressed={block.on} onClick={()=>onChange({[block.toggle]:block.on?0:1})}><i/>{block.on?'On':'Off'}</button>}
   {model?.removeFromChain&&(unitOf(block.id)||instrument)&&<button type="button" className="rack-remove" aria-label={'Remove '+block.name+' from the chain'} title="Take it out of the chain (its settings are kept)" onClick={()=>model.removeFromChain(block.id)}>✕ Remove</button>}
   {mix&&<div className="rack-mix">{control(mix)}</div>}
   {instrumentMix&&<div className="rack-mix"><RackControl spec={instrumentMix} value={values[instrumentMix.key]} label="Mix" block={block.name} onChange={onChange}/></div>}
   {movable&&model&&unitOf(block.id)&&!TAIL_UNITS.includes(unitOf(block.id))&&<span className="rack-move" role="group" aria-label={block.name+' position'}>
    <button type="button" aria-label={'Move '+block.name+' earlier'} disabled={!model.canMove(block.id,-1)} onClick={()=>model.moveBy(block.id,-1)} title="Move earlier in the chain">◀</button>
    <button type="button" aria-label={'Move '+block.name+' later'} disabled={!model.canMove(block.id,1)} onClick={()=>model.moveBy(block.id,1)} title="Move later in the chain">▶</button>
   </span>}
  </header>
  <div className={'rack-main'+(choices.some(aside)?' has-aside':'')}>
  <div className={block.id==='compressor'?'rack-body':'rack-body is-plain'}>
  {block.id==='compressor'&&<div className="rack-reduction"><span>Gain reduction</span><meter min="0" max="24" value={Math.min(24,Math.abs(reduction))}/><output>{Math.abs(reduction).toFixed(1)} dB</output></div>}
  <div className="rack-controls">{instrument
   ?instrumentSpecs.filter(spec=>spec!==instrumentMix).map(spec=><RackControl key={spec.key} spec={spec} value={values[spec.key]} label={spec.label} block="Instrument space" onChange={onChange}/>)
   :sliders.map(control)}</div>
  </div>
  {choices.length>0&&<div className="rack-choices">{choices.map(k=>renderChoice?.(k)??(aside(k)?special(k):control(k)))}</div>}
  </div>
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

/** Takes out the units in the chain that are not doing anything. */
export function RackCleanUp({model}){
 return <button type="button" className="rack-cleanup" disabled={!model.idle.length} title={model.idle.length?'Take out '+model.idle.map(u=>UNIT_NAMES[u]).join(', ')+' (their settings are kept)':'Every effect in the chain is doing something'} onClick={model.cleanUp}>Clean up{model.idle.length?' · '+model.idle.length:''}</button>;
}

/** A preset that keeps the player's order and chain, and adds any unit the preset itself uses. */
export function presetValues(preset,values){
 const mask=maskFromUnits([...new Set([...chainUnits(values['master.chain']??DEFAULT_CHAIN),...unitsUsedBy(preset.values)])]);
 return {...preset.values,'master.order':values['master.order']??0,'master.chain':mask};
}
