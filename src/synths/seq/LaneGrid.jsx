import React from 'react';
import {LAYERS,PER_LAYER,layerOf,letterOf,patternId,patternName} from './bank';
import {stepKey} from './selection';
import Encoder from './Encoder';

// The sequence: four small displays over the pads, eight lanes of square pads, at the head of each lane a name button and, left of it, a
// small display of what the lane is. The grid never moves: the page decides what a tap means (it passes the handlers), and `patternMode`
// changes what the same pads mean. In steps mode a pad is a step; in pattern mode the pad rows are the layers and the first eight columns
// the letters, so a pad is a pattern (lit: being edited, grey dot: holds notes, green dot: playing, pulse: plays next), and the lane buttons
// pick a layer. A lit pad's brightness is its loudness (`level`, 0 to 1). `selection` is a set of "track:step" keys, drawn outlined. `lanes` is the eight
// lanes of lanes.js (null leaves a place empty); `pattern[lane.index]` a lane's steps (0 off, 1 hit, 2 flam); a lane carries `top` and
// `bottom` lines for its display. Steps past a lane's length are dimmed.
export default function LaneGrid({lanes,pattern,length,selected,headRef,locks={},trackLengths={},colour,level,steps=16,ruler,selection=null,onStepDown,onStepOver,onLaneDown,onLaneSelect,onPaintEnd,muting=false,silent,filling=false,scroll=null,pages=null,offset=0,patternMode=null}){
 const rowsOfSteps=lanes.map((lane,slot)=>lane?{...lane,slot}:{empty:true,slot:'e'+slot});
 const quiet=r=>typeof r.index==='number'&&!!silent?.(r.index);
 const pm=patternMode,cur=pm?.bank.current;
 const layerRows=pm?Array.from({length:LAYERS},(_,l)=>{
  const used=pm.bank.patterns.slice(l*PER_LAYER,l*PER_LAYER+PER_LAYER).filter(p=>p.some(r=>r.some(Boolean))).length;
  return {layer:l,slot:'L'+l,top:`LAYER ${l+1}`,bottom:used?`${used} OF ${PER_LAYER} USED`:'EMPTY',short:String(l+1),long:`Layer ${l+1}`};
 }):null;
 const rows=pm?layerRows:rowsOfSteps;
 const words=ruler??['1','2','3','4'];
 return <section className={'group wide seq-grid lane-grid'+(pm?' pattern':'')+(filling?' filling':'')} onPointerUp={()=>onPaintEnd?.()} onPointerLeave={()=>onPaintEnd?.()}>
  <div className="lane-scroll">{scroll&&!pm&&<>
   <Encoder label={scroll.label} display={scroll.display} position={scroll.position} step={scroll.step} disabled={scroll.disabled} onPosition={scroll.onPosition} onReset={scroll.onReset}/>
   <span className="scroll-more" aria-hidden="true">{scroll.display}{scroll.above>0?' ▲'+scroll.above:''}{scroll.below>0?' ▼'+scroll.below:''}</span>
  </>}{pages&&!pm&&<Encoder label={pages.label} display={pages.display} position={pages.position} step={pages.step} disabled={pages.disabled} onPosition={pages.onPosition} onReset={pages.onReset}/>}{pages&&!pm&&<span className="scroll-more" aria-hidden="true">{pages.display}</span>}</div>
  <div className="lane-ruler">{words.map((w,i)=>{
   const lines=Array.isArray(w)?w:[w];
   return <span key={i}><b>{lines[0]}</b><i>{lines[1]}</i><i>{lines[2]}</i></span>;
  })}</div>
  <div className="seq-info">
   {rows.map(r=>{
    const body=<><b>{r.top}</b><i>{muting&&r.index!==undefined?(quiet(r)?'MUTED':'PLAYING'):r.bottom}</i></>;
    const cls='lane-info'+(r.empty?' empty':'')+(quiet(r)?' silent':'')+(muting&&!r.empty&&r.layer===undefined?' muting':'')+(r.index===selected&&!pm?' on':''),style={'--voice':r.layer!==undefined?'var(--amber)':r.key?colour(r):undefined};
    return r.key
     ?<button type="button" key={r.slot} className={cls} style={style} title={`${r.long}: select it`} aria-pressed={r.index===selected} onPointerDown={()=>onLaneSelect?.(r.index)}>{body}</button>
     :<span key={r.slot} className={cls} style={style}>{body}</span>;
   })}
  </div>
  <div className="seq-names">
   {rows.map(r=>r.empty
    ?<span key={r.slot} className="seq-name empty" aria-hidden="true"/>
    :r.layer!==undefined
     ?<button type="button" key={r.slot} style={{'--voice':'var(--amber)'}} className={'seq-name'+(layerOf(cur)===r.layer?' on':'')} title={`${r.long}: pick it, keeping the letter`} onClick={()=>pm.onPick(patternId(r.layer,letterOf(cur)))}>{r.short}</button>
     :<button type="button" key={r.slot} style={{'--voice':colour(r)}} className={'seq-name'+(r.index===selected?' on':'')+(quiet(r)?' silent':'')} title={`${r.long}: play it`} onPointerDown={()=>onLaneDown?.(r.index)}>{r.short}</button>)}
  </div>
  <div className="seq-cells" ref={headRef} style={{'--rows':rows.length,'--off':pm?0:offset}}>
   {rows.map(r=>{
    if(r.empty)return Array.from({length:steps},(_,s)=><span key={r.slot+s} className={'cell void'+(s%4===0?' beat':'')+(s>>2&1?' alt':'')}/>);
    if(r.layer!==undefined)return Array.from({length:steps},(_,c)=>{
     if(c>=PER_LAYER)return <span key={r.slot+c} className={'cell void'+(c%4===0?' beat':'')+(c>>2&1?' alt':'')}/>;
     const id=patternId(r.layer,c),full=pm.bank.patterns[id].some(row=>row.some(Boolean)),on=cur===id,now=pm.playing&&pm.playingPattern===id,queued=pm.playing&&on&&pm.playingPattern!==id&&!pm.song;
     return <button type="button" key={r.slot+c} style={{'--voice':'var(--amber)'}} aria-pressed={on} aria-label={`Pattern ${patternName(id)}${full?'':', empty'}${now?', playing':''}`}
      title={`${patternName(id)}${pm.bank.names?.[id]?` · ${pm.bank.names[id]}`:''}${full?'':' (empty)'}${queued?' · plays next':''}`}
      className={'cell pat'+(on?' on':'')+(full?' full':'')+(now?' now':'')+(queued?' queued':'')+(pm.armed&&on?' source':'')+(c%4===0?' beat':'')+(c>>2&1?' alt':'')} onClick={()=>pm.onPick(id)}/>;
    });
    return pattern[r.index].slice(offset,offset+steps).map((v,i)=>{const s=i+offset;return <button type="button" key={r.slot+'-'+i} data-cell={r.index+'-'+s} style={{'--voice':colour(r),...(v&&level?{'--lv':level(r.index,s)}:{})}} aria-label={`${r.long} step ${s+1}`} aria-pressed={!!v}
      className={'cell'+(v?' on':'')+(v===2?' flam':'')+(locks[r.index+':'+s]?.cond==='fixed'?' fixedstep':'')+(locks[r.index+':'+s]?.cond==='fill'?' fillonly':locks[r.index+':'+s]?.cond==='not-fill'?' nofill':'')+(selection?.has(stepKey(r.index,s))?' picked':'')+(s%4===0?' beat':'')+(s>>2&1?' alt':'')+(quiet(r)?' silent':'')+(s>=(trackLengths[r.index]??length)?' out':'')}
      onPointerDown={e=>{if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);onStepDown?.(r.index,s);}} onPointerEnter={e=>{if(e.buttons)onStepOver?.(r.index,s);}}/>;});
   })}
   <div className="playhead"/>
  </div>
 </section>;
}
