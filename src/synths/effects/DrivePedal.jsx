import React from 'react';
import Encoder from '../seq/Encoder';
import useFloating from '../ui/useFloating';
import {toPosition,fromPosition} from '../params';
import {effectPositionKey} from './effectBoxes';
import {DRIVE_PEDALS} from './driveModel';

export default function DrivePedal({instance,connected,model,onEdit,onClose,peak=0,rackEnabled=true,floatingKey,label,instanceId}){
 const {id,kind,params,enabled}=instance,spec=DRIVE_PEDALS[kind],floating=useFloating(floatingKey??effectPositionKey(id),{x:2000,y:1400},{spawnOnly:true,rotatable:true}),index=model.tiles.findIndex(t=>t.id===id),before=model.tiles[index-1]?.name??'DI-Poly',after=model.tiles[index+1]?.name??'Output',engaged=connected&&enabled,name=label??spec.name;
 const toggle=()=>{if(!connected)model.addToChain(id);onEdit(id,{enabled:!engaged});};
 return <section className={'effect-box physical-effect effect-pedal drive-pedal'+(engaged?'':' is-bypassed')} data-effect-id={id} data-effect-instance={instanceId} aria-label={`${name} effect box`} ref={floating.ref} style={{...floating.style,'--effect-colour':spec.colour}} onPointerDownCapture={floating.raise}>
  <header className="effects-box-grip effect-box-grip" {...floating.handle}><strong>{name}</strong><span className="effect-header-state" role="status" aria-label={`${name} ${engaged?'on':'off'}`}><i className={engaged&&rackEnabled?'lit':''}/></span><div className="effect-box-route" title={connected?`${before} → ${after}`:'Not in chain'}>{connected?<><span><b>{before}</b></span><em>→</em><span><b>{after}</b></span></>:<span>Not in chain</span>}</div><button type="button" className="effect-box-close" aria-label={`Close ${name} editor`} onClick={onClose}>×</button></header>
  <div className="effect-control-body"><div className="pedal-main-knobs" style={{'--primary-count':kind==='boost'?1:2}}>{spec.params.PARAMS.map((p,i)=>{const display=p.key==='tone'?`${Math.round(params[p.key]*100)}%`:`${params[p.key].toFixed(1)} dB`,primary=p.key!=='level';return <div className={'effect-knob pedal-knob '+(primary?'is-main-knob':'is-secondary-knob')} key={p.key} style={{'--knob-colour':spec.colour}}><Encoder label={p.label} ariaLabel={`${name} · ${p.label}`} tooltip={`${p.label}: ${display}`} display={display} position={toPosition(p,params[p.key])} step={.01} onPosition={x=>onEdit(id,{params:{...params,[p.key]:Number(fromPosition(p,x).toFixed(4))}})} onReset={()=>onEdit(id,{params:{...params,[p.key]:p.default}})}/></div>;})}</div>
   <div className="drive-headroom" role="meter" aria-label={`${name} output peak`} aria-valuemin={-60} aria-valuemax={24} aria-valuenow={Math.max(-60,20*Math.log10(Math.max(1e-3,peak)))} title="Measured at this pedal output, before later effects"><i className={peak>=1?'is-hot':''} style={{width:Math.min(100,Math.max(0,(20*Math.log10(Math.max(1e-3,peak))+60)/.84))+'%'}}/><span>{peak>0?`${(20*Math.log10(peak)).toFixed(1)} dBFS`:'Output'}</span></div>
  </div><div className="effect-foot-area"><button type="button" className="effect-foot" aria-label={connected?`${name} on/off`:`Add ${name} to rack`} aria-pressed={engaged} onClick={toggle}><i className={'effect-foot-led'+(engaged&&rackEnabled?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">{connected?'On / Off':'Engage'}</span></button></div>
 </section>;
}
