import React,{useRef} from 'react';
import {zplaneSections,zplaneResponse} from './zplaneMath';
import {ZPLANE_SHAPE_NAMES} from './zplaneShapes';
import {RACK_PARAMS} from './params';

// The z-plane filter's whole panel below the header: a display of what it is doing and a row of knobs that set it.
//  - the response on a log frequency axis (shape A and shape B dashed, the morphed result solid, a marker for each section)
//  - the poles (x) and zeros (o) in the upper half of the z-plane, drawn zoomed: the rim is the unit circle, the angle follows the
//    same log frequency axis as the response (low at the right, where DC is) and the distance from the rim is magnified, because
//    real poles sit within a hair of it and would otherwise all pile up in one spot
//  - knobs for the two shapes (they step through the list, and the display names them) and for morph, shift and resonance
const W=300,H=136,LO=40,HI=12000,DB=24,POINTS=96,LAST=ZPLANE_SHAPE_NAMES.length-1;
const FREQS=Array.from({length:POINTS},(_,i)=>LO*(HI/LO)**(i/(POINTS-1)));
const X=hz=>Math.log(Math.max(LO,Math.min(HI,hz))/LO)/Math.log(HI/LO)*W,Y=db=>H/2-Math.max(-DB,Math.min(DB,db))/DB*(H/2-6);
const path=db=>db.map((d,i)=>(i?'L':'M')+X(FREQS[i]).toFixed(1)+' '+Y(d).toFixed(1)).join('');
const TICKS=[100,1000,10000];
const MAGNIFY=7;
const clamp=x=>Math.min(1,Math.max(0,x));

/** A small rotary: drag up or down, wheel, arrow keys, double-click for the default. `position` runs 0..1. */
function ZKnob({label,display,position,onPosition,onReset,step=.02,span=140,bare=false}){
 const drag=useRef(null);
 return <div className="zp-knob">
  <div className="zp-dial" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(position.toFixed(3))} aria-valuetext={display} title={label+': drag, wheel or arrow keys · double-click resets'}
   onPointerDown={e=>{if(e.button>0)return;e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={id:e.pointerId,y:e.clientY,p:position};}}
   onPointerMove={e=>{const d=drag.current;if(d&&d.id===e.pointerId)onPosition(clamp(d.p+(d.y-e.clientY)/(e.shiftKey?span*3:span)));}}
   onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   onDoubleClick={onReset}
   onWheel={e=>onPosition(clamp(position+(e.deltaY<0?1:-1)*step))}
   onKeyDown={e=>{const d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();onPosition(clamp(position+d*step));}}}>
   <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" className="skirt"/><g transform={`rotate(${-135+270*clamp(position)} 24 24)`}><circle cx="24" cy="24" r="15" className="cap"/><line x1="24" y1="6.5" x2="24" y2="16" className="pointer"/></g></svg>
  </div>
  {!bare&&<output>{display}</output>}
  {!bare&&<span>{label}</span>}
 </div>;
}

/** A shape picker: a knob that steps through the shapes beside a black display that names the one chosen (a click on the display steps on). */
function ShapePick({label,index,onIndex,onReset}){
 return <div className="zp-pick">
  <ZKnob bare label={label} display={ZPLANE_SHAPE_NAMES[index]} position={index/LAST} step={1/LAST} span={LAST*10} onPosition={p=>onIndex(Math.round(p*LAST))} onReset={onReset}/>
  <button type="button" className="zp-lcd" aria-label={label+': '+ZPLANE_SHAPE_NAMES[index]+', click for the next shape'} onClick={()=>onIndex((index+1)%(LAST+1))}><small>{label}</small><b>{ZPLANE_SHAPE_NAMES[index]}</b><i/></button>
 </div>;
}

export default function ZPlaneScope({values,onChange,faders}){
 const v=k=>values['zplane.'+k],a=Math.round(v('a')),b=Math.round(v('b')),morph=v('morph'),shift=v('shift'),q=v('q');
 const set=(key,value)=>{const spec=RACK_PARAMS.BY_KEY['zplane.'+key];onChange({['zplane.'+key]:Math.max(spec.min,Math.min(spec.max,value))});};
 const reset=key=>set(key,RACK_PARAMS.BY_KEY['zplane.'+key].default);
 const sections=zplaneSections(a,b,morph,shift,q);
 const curve=zplaneResponse(sections,FREQS),ghostA=zplaneResponse(zplaneSections(a,a,0,shift,q),FREQS),ghostB=zplaneResponse(zplaneSections(b,b,0,shift,q),FREQS);
 const R=48,CX=62,CY=H-16,at=(r,f)=>{const t=Math.PI*X(f)/W,d=Math.max(.04,1-(1-r)*MAGNIFY);return [CX+d*R*Math.cos(t),CY-d*R*Math.sin(t)];};
 const active=sections.filter(s=>Math.abs(s.boost)>=1);
 return <div className="rack-scope">
  <div className="zp-main">
  <div className="rack-scope-display" role="img" aria-label={`Z-plane filter: ${ZPLANE_SHAPE_NAMES[a]} to ${ZPLANE_SHAPE_NAMES[b]}, ${Math.round(morph*100)}% morphed`}>
   <svg className="rack-scope-response" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {[-12,0,12].map(d=><line key={d} x1="0" x2={W} y1={Y(d)} y2={Y(d)} className={d?'grid':'grid zero'}/>)}
    {TICKS.map(t=><g key={t}><line x1={X(t)} x2={X(t)} y1="0" y2={H} className="grid"/></g>)}
    <path d={path(ghostA)} className="ghost"/><path d={path(ghostB)} className="ghost b"/>
    <path d={path(curve)+`L${W} ${H}L0 ${H}Z`} className="fill"/><path d={path(curve)} className="line"/>
    {active.map((s,i)=><line key={i} x1={X(s.freq)} x2={X(s.freq)} y1={Y(0)} y2={Y(s.boost>0?DB:-DB)} className="mark"/>)}
   </svg>
   <span className="rack-scope-ticks" aria-hidden="true">{TICKS.map(t=><i key={t} style={{left:X(t)/W*100+'%'}}>{t>=1000?t/1000+'k':t}</i>)}</span>
   <span className="rack-scope-name a">A · {ZPLANE_SHAPE_NAMES[a]}</span><span className="rack-scope-name b">B · {ZPLANE_SHAPE_NAMES[b]}</span>
  </div>
  <svg className="rack-scope-plane" viewBox={`0 0 ${CX*2} ${H}`} role="img" aria-label="Poles and zeros on the z-plane, zoomed near the unit circle">
   <path d={`M${CX-R} ${CY}A${R} ${R} 0 0 1 ${CX+R} ${CY}`} className="circle"/><path d={`M${CX-R-6} ${CY}H${CX+R+6}`} className="grid"/>
   {active.map((s,i)=>{
    const [px,py]=at(s.pole,s.freq),[zx,zy]=at(s.zero,s.freq);
    return <g key={i}><path d={`M${px-2.5} ${py-2.5}l5 5m0-5l-5 5`} className="pole"/><circle cx={zx} cy={zy} r="2.6" className="zero"/></g>;
   })}
   <text x={CX+R-12} y={CY+11}>DC</text><text x={CX-R-4} y={CY+11}>12k</text>
  </svg>
  <div className="zp-picks">
   <ShapePick label="Shape A" index={a} onIndex={i=>set('a',i)} onReset={()=>reset('a')}/>
   <ShapePick label="Shape B" index={b} onIndex={i=>set('b',i)} onReset={()=>reset('b')}/>
  </div>
  </div>
  <div className="rack-controls zp-faders">{faders}</div>
 </div>;
}
