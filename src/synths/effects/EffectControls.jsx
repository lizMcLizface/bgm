import React,{useState,useRef,useLayoutEffect,useEffect} from 'react';
import Encoder from '../seq/Encoder';
import {toPosition,fromPosition,formatValue} from '../params';
import {RACK_PARAMS} from './params';
import {CHOICES} from './rackParts';
import {clamp,compressionDb,linePath} from './effectFaceModel';
import {MAIN_KNOBS,HIDDEN_BLENDS,PANEL_LABELS} from './pedalModel';
import ZPlaneScope from './ZPlaneScope';

const COLOURS=['#e4b477','#ba9fe0','#79becd','#8bc8a6'];
export function effectValue(key,value){const spec=RACK_PARAMS.BY_KEY[key],choices=CHOICES[key];return choices?.[Math.round(value)]??formatValue(spec,value)+(key==='vibrato.depth'?' ct':spec.unit==='Hz'?' Hz':spec.unit==='%'?'%':spec.unit==='oct'?' oct':'');}
export function EffectKnob({param,label,index=0,name,values,onChange,disabled=false,compact=false,primary=false,printedLabel}){
 const spec=RACK_PARAMS.BY_KEY[param],value=values[param],display=effectValue(param,value),choices=CHOICES[param],stepped=spec.curve==='step'||!!choices;
 const set=p=>{let n=fromPosition(spec,p);if(stepped)n=Math.round(n);if(param==='inserts.phaserStages')n=Math.round(n/2)*2;onChange({[param]:Number(n.toFixed(6))});};
 const dial=<Encoder label={printedLabel??PANEL_LABELS[param]??label} ariaLabel={`${name} · ${label}`} tooltip={`${label}: ${display}`} display={display} position={toPosition(spec,value)} step={stepped?1/(spec.max-spec.min):param==='inserts.phaserStages'?.2:.01} disabled={disabled}
   onPosition={set} onReset={()=>onChange({[param]:spec.default})}/>
 ;
 return <div className={'effect-knob'+(compact?' pedal-knob':'')+(primary?' is-main-knob':' is-secondary-knob')+(disabled?' is-disabled':'')} style={{'--knob-colour':COLOURS[index%4]}}>
  {compact?<>{dial}</>:<><output><small>{label}</small><b>{display}</b></output>{dial}</>}
 </div>;
}
export const PEDAL_KEYS={
 vibrato:['vibrato.rate','vibrato.depth'],
 phaser:['inserts.phaserRate','inserts.phaserDepth','inserts.phaser'],
 flanger:['inserts.flangerRate','inserts.flangerDepth','inserts.flangerFeedback','inserts.flanger'],
 chorus:['inserts.chorusRate','inserts.chorusDepth','inserts.chorus'],
 ring:['ring.freq','ring.mix'],crusher:['crusher.bits','crusher.divide','crusher.mix'],
 tremolo:['tremolo.rate','tremolo.depth','tremolo.mix'],pitch:['pitch.semi','pitch.fine','pitch.mix'],
 width:['width.amount'],limiter:['limiter.ceiling'],tape:['tape.wow','tape.flutter','tape.drive'],
 shimmer:['shimmer.mix','shimmer.decay','shimmer.interval'],freeze:['freeze.mix','freeze.length','freeze.fade'],filter:[],
};
export const hasPedalFace=id=>Object.hasOwn(PEDAL_KEYS,id);
export const hasCompactFace=id=>hasPedalFace(id)||id==='compressor';
export function EqualizerFace({values,onChange}){
 const primary=MAIN_KNOBS.eq,secondary=['inserts.lowFreq','inserts.midFreq','inserts.highFreq','inserts.midQ'];
 return <div className="eq-physical-face"><div className="pedal-main-knobs" style={{'--primary-count':3}}>{primary.map((key,i)=><EffectKnob key={key} param={key} label={['Low gain','Mid gain','High gain'][i]} name="Equalizer" values={values} onChange={onChange} index={i} compact primary/>)}</div>
  <div className="pedal-secondary-knobs" style={{'--secondary-count':4}}>{secondary.map((key,i)=><EffectKnob key={key} param={key} label={['Low freq','Mid freq','High freq','Mid Q'][i]} name="Equalizer" values={values} onChange={onChange} index={i} compact/>)}</div>
 </div>;
}
function PedalFace({block,values,onChange,limiterReduction=0}){
 const id=block.id,mode=values['filter.type'],main=MAIN_KNOBS[id],extra=block.keys.filter(([key])=>!main.includes(key)&&key!=='freeze.hold'&&key!==HIDDEN_BLENDS[id]);
 const activeFilter=mode===0?['type','low','high','slope']:mode<=4?['type','cutoff','q']:['type','cutoff','gain'];
 const knob=([key,label],i,primary=false)=><EffectKnob key={key} param={key} label={label} index={i} name={block.name} values={values} onChange={onChange} disabled={id==='filter'&&!activeFilter.includes(key.split('.')[1])} compact primary={primary}/>;
 return <div className="pedal-face"><div className="pedal-main-knobs" style={{'--primary-count':main.length}}>{main.map((key,i)=>knob(block.keys.find(([p])=>p===key),i,true))}</div>
  {extra.length>0&&<div className="pedal-secondary-knobs" style={{'--secondary-count':Math.min(4,extra.length)}}>{extra.map((entry,i)=>knob(entry,i))}</div>}
  {id==='width'&&<div className="pedal-reference"><span>Mono</span><span>Stereo</span><span>Wide</span></div>}
  {id==='limiter'&&<div className="pedal-reduction"><meter aria-label="Limiter gain reduction" min="0" max="24" value={Math.min(24,Math.abs(limiterReduction))}/><span>{Math.abs(limiterReduction).toFixed(1)} dB</span></div>}
 </div>;
}
function Plot({label,children,caption}){return <figure className="effect-plot"><svg viewBox="0 0 320 112" role="img" aria-label={label}><path className="plot-grid" d="M0 28H320M0 56H320M0 84H320M80 0V112M160 0V112M240 0V112"/>{children}</svg><figcaption>{caption}</figcaption></figure>;}
function CompressorView({values,reduction,inputDb}){
 const [timing,setTiming]=useState(false),v=k=>values['compressor.'+k],threshold=v('threshold'),ratio=v('ratio'),knee=v('knee'),attack=v('attack'),release=v('release'),gr=Math.max(0,-reduction),level=clamp(inputDb??-100,-60,0),rise=attack*5,total=rise+.1+release*5;
 return <><div className="effect-view-tabs" role="radiogroup" aria-label="Compressor display">{['Transfer','Timing'].map((name,i)=><button type="button" role="radio" aria-checked={timing===!!i} key={name} onClick={()=>setTiming(!!i)}>{name}</button>)}</div>
  <Plot label={timing?'Compressor configured attack and release':'Compressor configured transfer curve'} caption={timing?`Attack ${(attack*1000).toFixed(0)} ms · Release ${(release*1000).toFixed(0)} ms / envelope`:'Input −60 → 0 dB / before makeup'}>
   {timing?<path className="plot-line" d={linePath(t=>t*total<rise?100-80*(1-Math.exp(-t*total/attack)):t*total<rise+.1?20:100-80*Math.exp(-(t*total-rise-.1)/release))}/>:<><path className="plot-zero" d="M0 110L320 2"/><path className="plot-line" d={linePath(t=>110-(compressionDb(-60+t*60,threshold,ratio,knee)+60)*1.8)}/>{level>-60&&<circle className="plot-live" cx={(level+60)/60*320} cy={clamp(110-(level-gr+60)*1.8,2,110)} r="4"/>}</>}
  </Plot><div className="effect-live-reduction"><label>Reduction<meter aria-label="Compressor gain reduction" min="0" max="24" value={Math.min(24,gr)}/></label><output>{gr.toFixed(1)} dB</output></div>
 </>;
}
function CompressorFace({block,values,onChange,reduction=0,inputDb=-100}){
 const main=MAIN_KNOBS.compressor,extra=block.keys.filter(([key])=>!main.includes(key));
 const knob=([key,label],i,primary=false)=><EffectKnob key={key} param={key} label={label} name={block.name} values={values} onChange={onChange} index={i} compact primary={primary}/>;
 return <div className="compressor-physical-face"><div className="pedal-main-knobs" style={{'--primary-count':3}}>{main.map((key,i)=>knob(block.keys.find(([p])=>p===key),i,true))}</div><div className="pedal-secondary-knobs" style={{'--secondary-count':4}}>{extra.map((entry,i)=>knob(entry,i))}</div><div className="effect-face-screen compressor-meter"><CompressorView values={values} reduction={reduction} inputDb={inputDb}/></div></div>;
}
function ParameterBank({block,keys,values,onChange}){
 const [selection,setSelection]=useState(0),[idle,setIdle]=useState(true),bank=useRef(null),timer=useRef(null),list=useRef(null),rows=useRef([]),index=Math.min(selection,keys.length-1),[param,label]=keys[index];
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const wake=()=>{setIdle(false);clearTimeout(timer.current);timer.current=setTimeout(()=>{if(list.current?.contains(document.activeElement))bank.current?.querySelector('.bank-encoders [role=slider]')?.focus({preventScroll:true});setIdle(true);},5000);};
 const select=i=>{wake();setSelection(i);};
 useLayoutEffect(()=>{const box=list.current,row=rows.current[index];if(!box||!row)return;const top=row.offsetTop;if(top<box.scrollTop)box.scrollTop=top;else if(top+row.offsetHeight>box.scrollTop+box.clientHeight)box.scrollTop=top+row.offsetHeight-box.clientHeight;},[index,idle]);
 return <div className="effect-parameter-bank" ref={bank} onPointerDownCapture={wake} onKeyDownCapture={wake} onWheelCapture={wake}><div className="bank-encoders"><Encoder label="Select" ariaLabel={`${block.name} · Parameter`} display={label} position={index/Math.max(1,keys.length-1)} step={1/Math.max(1,keys.length-1)} onPosition={p=>select(Math.round(p*(keys.length-1)))}/><EffectKnob param={param} label={label} printedLabel="Value" name={block.name} values={values} onChange={patch=>{wake();onChange(patch);}} compact/></div>
  <div className="effect-face-screen parameter-screen">{idle?<IdleTimeDisplay id={block.id} values={values}/>:<><div className="effect-screen-title"><b>{label}</b><output>{effectValue(param,values[param])}</output></div><div className="parameter-scroll" ref={list} role="radiogroup" aria-label={`${block.name} parameters`}>{keys.map(([key,name],i)=><button type="button" role="radio" ref={el=>rows.current[i]=el} aria-checked={index===i} key={key} onClick={()=>select(i)} onKeyDown={e=>{const n={ArrowRight:index+1,ArrowDown:index+1,ArrowLeft:index-1,ArrowUp:index-1,Home:0,End:keys.length-1}[e.key];if(n!==undefined){e.preventDefault();select(clamp(n,0,keys.length-1));}}}><span>{name}</span><b>{effectValue(key,values[key])}</b></button>)}</div></>}</div>
 </div>;
}
function IdleTimeDisplay({id,values}){
 if(id==='reverb')return <div className="time-idle-display" aria-label="Reverb idle display"><div className="effect-screen-title"><b>{CHOICES['effects.reverbType'][values['effects.reverbType']]}</b><output>{effectValue('effects.decay',values['effects.decay'])}</output></div><svg viewBox="0 0 320 70" role="img" aria-label="Modelled reverb decay over ten seconds"><path d={linePath(t=>8+50*(1-Math.exp(-6.9078*t*10/values['effects.decay'])))}/></svg><small>Decay guide · 0–10 s</small></div>;
 const time=values['effects.delayMs'],feedback=values['effects.feedback'];
 return <div className="time-idle-display" aria-label="Delay idle display"><div className="effect-screen-title"><b>{values['master.sync']?'Synced':'Free'}</b><output>{effectValue('effects.delayMs',time)}</output></div><svg viewBox="0 0 320 70" role="img" aria-label="Configured delay echo spacing over two seconds">{Array.from({length:8},(_,i)=>({x:(i+1)*time/2000*300,a:feedback**i})).filter(p=>p.x<=315&&p.a>.02).map((p,i)=><path key={i} d={`M${p.x} 62V${62-p.a*50}`} style={{opacity:.4+.6*p.a}}/>)}</svg><small>Echo timing guide · 0–2 s</small></div>;
}
export function TimeEffectFace({block,values,onChange}){
 const main=MAIN_KNOBS[block.id],extra=block.keys.filter(([key])=>!main.includes(key)&&(key!=='effects.delayToReverb'||values['master.routing']!==1));
 if(block.id==='reverb')extra.sort((a,b)=>['effects.reverbType','effects.size','effects.predelay','effects.width','effects.modulation','effects.reflections','effects.quality','effects.reverbReturn','effects.dry'].indexOf(a[0])-['effects.reverbType','effects.size','effects.predelay','effects.width','effects.modulation','effects.reflections','effects.quality','effects.reverbReturn','effects.dry'].indexOf(b[0]));
 return <div className="time-effect-face"><div className="pedal-main-knobs" style={{'--primary-count':main.length}}>{main.map((key,i)=><EffectKnob key={key} param={key} label={block.keys.find(([p])=>p===key)[1]} name={block.name} values={values} onChange={onChange} index={i} disabled={key==='effects.delayMs'&&values['master.sync']>0} compact primary/>)}</div><ParameterBank block={block} keys={extra} values={values} onChange={onChange}/></div>;
}
export function SaturationFace({values,onChange}){return <div className="saturation-physical-face"><div className="pedal-main-knobs" style={{'--primary-count':1}}><EffectKnob param="inserts.drive" label="Drive" name="Saturation" values={values} onChange={onChange} compact primary/></div><div className="pedal-secondary-knobs" style={{'--secondary-count':1}}><EffectKnob param="inserts.saturation" label="Mix" name="Saturation" values={values} onChange={onChange} compact/></div></div>;}
export function ZPlaneFace({values,onChange}){return <ZPlaneScope values={values} onChange={onChange} sideControls faders={['morph','shift','q','mix'].map((key,i)=><EffectKnob key={key} param={'zplane.'+key} label={['Morph','Shift','Resonance','Mix'][i]} name="Z-plane" values={values} onChange={onChange} index={i} compact/> )}/>;}
export default function CompactEffectFace(props){return hasPedalFace(props.block.id)?<PedalFace {...props}/>:<CompressorFace {...props}/>;}
