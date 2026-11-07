import React,{forwardRef,useImperativeHandle,useState} from 'react';
import Encoder from '../seq/Encoder';
import {dbText,panText,Fader,Meter} from './deskParts';
import './generatorBox.css';
import './mixerDesk.css';

// Proof of concept of the ambience box (docs/GENERATOR_BOX_PLAN.md): a small display, knobs for the chosen source and a fader for
// every source and for the whole bed. Its output is the mixer's ambience channel. The sources are the engine's (engine/ambience.js
// AMBIENCE_LAYERS); nothing is wired yet.
const SOURCES=[['rain','Rain','#6fa8d6'],['thunder','Thunder','#9a8fd6'],['wind','Wind','#8fd6c8'],['waves','Waves','#58a0b9'],['fire','Fireplace','#e0894a'],['vinyl','Vinyl','#c9b98a']];
const NEW=()=>({level:0,distance:.3,pan:.5,width:.6});

const AmbienceBox=forwardRef(function AmbienceBox(_props,ref){
 const [run,setRun]=useState(false);
 const [sel,setSel]=useState(0);
 const [src,setSrc]=useState(()=>Object.fromEntries(SOURCES.map(([id])=>[id,{...NEW(),level:id==='rain'?.6:0}])));
 const [overall,setOverall]=useState(.8);
 useImperativeHandle(ref,()=>({snapshot:()=>({run,selected:sel,sources:src,overall}),restore:state=>{setRun(state.run);setSel(state.selected);setSrc(state.sources);setOverall(state.overall);}}),[run,sel,src,overall]);
 const set=(id,p)=>setSrc(s=>({...s,[id]:{...s[id],...p}}));
 const [id,name,colour]=SOURCES[sel],c=src[id];
 const active=SOURCES.filter(([i])=>src[i].level>0).length;
 return <section className="gbox mixdesk ambbox" aria-label="Ambience box">
  <header className="gb-head"><h2>Ambience</h2><span className="gb-hint">→ mixer channel 7</span>
   <button type="button" className={'amb-run'+(run?' on':'')} aria-pressed={run} onClick={()=>setRun(r=>!r)}>{run?'RUNNING':'START'}</button></header>
  <div className="dk-sends amb-top" style={{'--ch':colour}}>
   <div className="dk-lcd" role="status"><small>Source {sel+1} of {SOURCES.length} · {active} playing</small><b>{name}</b>
    <span>LEVEL {dbText(c.level)} dB · DIST {Math.round(c.distance*100)}%</span><span>PAN {panText(c.pan)} · WIDTH {Math.round(c.width*100)}%</span></div>
   <div className="amb-knobs">
    <Encoder label="Source" display={name} position={sel/(SOURCES.length-1)} step={1/(SOURCES.length-1)} onPosition={p=>setSel(Math.round(p*(SOURCES.length-1)))} onReset={()=>setSel(0)}/>
    <Encoder label="Distance" display={`${Math.round(c.distance*100)}%`} position={c.distance} onPosition={v=>set(id,{distance:v})} onReset={()=>set(id,{distance:.3})}/>
    <Encoder label="Pan" display={panText(c.pan)} position={c.pan} onPosition={v=>set(id,{pan:v})} onReset={()=>set(id,{pan:.5})}/>
    <Encoder label="Width" display={`${Math.round(c.width*100)}%`} position={c.width} onPosition={v=>set(id,{width:v})} onReset={()=>set(id,{width:.6})}/>
   </div>
  </div>
  <div className="amb-faders">
   {SOURCES.map(([i,n,col],k)=><div key={i} className={'amb-ch'+(k===sel?' sel':'')} style={{'--ch':col}}>
    <button type="button" className="amb-name" onClick={()=>setSel(k)} title={`${n}: edit its knobs`}>{n}</button>
    <div className="dk-fader-row short"><Meter level={run?src[i].level*overall:0} silent={false}/><Fader v={src[i].level} onChange={v=>set(i,{level:v})} label={`${n} level`} colour={col}/></div>
    <output className="dk-db">{dbText(src[i].level)}</output><i className="dk-bar"/>
   </div>)}
   <div className="amb-ch overall" style={{'--ch':'#e3a52a'}}>
    <b className="amb-name">Overall</b>
    <div className="dk-fader-row short"><Meter level={run?overall:0} silent={false}/><Fader v={overall} onChange={setOverall} label="Ambience overall level" colour="#e3a52a"/></div>
    <output className="dk-db">{dbText(overall)}</output><i className="dk-bar master"/>
   </div>
  </div>
 </section>;
});
export default AmbienceBox;
