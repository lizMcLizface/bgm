import React,{useEffect,useRef,useState} from 'react';
import Encoder from '../seq/Encoder';
import {SECTIONS,KEYS,FAMILIES,MODES,PROGRESSIONS,METERS,BARS_PER_CHORD,EVOLUTION_KINDS,WANDER_KINDS,WANDER_VOICES,RULE_CATEGORIES,RULE_OPTIONS,INITIAL_VALUES,optionsOf,knobText,knobPosition,knobValue,seqValues,seqPatch} from './generatorBoxModel';
import {BPM_LIMITS} from '../../app/conductor';
import './generatorBox.css';

// The generator box (docs/GENERATOR_BOX_PLAN.md). Scale, Progression and Tempo show and set the sequencers' song (`seq`): a turn is applied to the
// generator's settings a moment after the knob stops (`onSeq(patch)`, which plans the song again) and the display follows the song. Evolution,
// Wander and Rules are still the box's own proof-of-concept state.
const DEFAULT_SEQ={tonic:0,mode:'Major-1',progression:0,barsPerChord:1,bpm:72,meter:'4/4',generated:false,chords:null};

/** A knob that also presses: a click that is not the end of a drag. */
function PressKnob({knob,values,pressed,onTurn,onPress}){
 const down=React.useRef(null);
 const text=knobText(knob,values,pressed);
 return <div className={'gb-knob'+(pressed[knob.id]?' lit':'')}
  onPointerDownCapture={e=>{down.current=e.clientY;}}
  onClickCapture={e=>{if(Math.abs(e.clientY-down.current)>3){return;}if(knob.press||knob.kind==='toggle')onPress(knob.id);}}>
  <div className="gb-fn" aria-live="polite"><small>{knob.label}</small><b>{text}</b></div>
  <Encoder label={knob.label} display={text} position={knobPosition(knob,values)} step={knob.kind==='choice'?1/Math.max(1,(optionsOf(knob,values)?.length??2)-1):.02}
   onPosition={p=>onTurn(knob,p)} onReset={()=>onTurn(knob,knob.kind==='choice'?0:.5)}/>
  {knob.press&&<i className="gb-press" title="Press the knob">press</i>}
 </div>;
}

function Chips({items,at,lit=null}){
 return <div className="gb-chips">{items.map((x,i)=><span key={x} className={(i===at?'on ':'')+(lit&&lit[i]?'lit':'')}>{x}</span>)}</div>;
}

function Display({section,values,pressed,seq}){
 const v=values;
 if(section.id==='scale'){
  const fam=FAMILIES[v.family],modes=MODES[fam];
  return <div className="gb-cols"><div><h4>Key</h4><Chips items={KEYS} at={v.key}/></div><div><h4>Scale</h4><Chips items={FAMILIES} at={v.family}/></div><div><h4>Mode</h4><Chips items={modes} at={v.mode}/></div></div>;
 }
 if(section.id==='progression'){
  const p=PROGRESSIONS[v.progression],bars=BARS_PER_CHORD[v.chordLength],chords=seq?.chords;
  // the song's own chords (with their names in its key) when there is a song, else the bank's numerals
  const cells=chords?.length?chords:p.chords.map(c=>({name:c,numeral:null,bars}));
  return <div><h4>{p.name}{pressed.generated?' · generated':''}</h4><div className="gb-chords" style={{'--bars':bars}}>{cells.map((c,i)=><div key={i}><b>{c.name}</b><small>{c.numeral?c.numeral+' · ':''}{c.bars} bar{c.bars>1?'s':''}</small></div>)}</div></div>;
 }
 if(section.id==='tempo'){
  const bpm=Math.round(BPM_LIMITS[0]+(BPM_LIMITS[1]-BPM_LIMITS[0])*v.bpm);
  return <div className="gb-tempo"><b>{bpm}</b><small>BPM</small><span>{METERS[v.meter]}</span><span>{BARS_PER_CHORD[v.tempoBars]} bar{BARS_PER_CHORD[v.tempoBars]>1?'s':''} per chord</span></div>;
 }
 if(section.id==='evolution'){
  return <div><h4>{pressed.evoOn?'Evolving':'Off · the song stays where it is'}</h4><Chips items={EVOLUTION_KINDS} at={v.evoKind} lit={pressed.evoKinds}/></div>;
 }
 if(section.id==='wander'){
  return <div className="gb-cols"><div><h4>{pressed.wanOn?'Wandering':'Off'}</h4><Chips items={WANDER_KINDS} at={v.wanKind}/></div><div><h4>Voices that wander</h4><Chips items={WANDER_VOICES} at={v.wanVoice} lit={WANDER_VOICES.map(n=>!!pressed['wv'+n])}/></div></div>;
 }
 if(section.id==='rules'){
  const cat=RULE_CATEGORIES[v.ruleCat];
  return <div className="gb-cols"><div><h4>Voice</h4><Chips items={RULE_CATEGORIES} at={v.ruleCat}/></div><div><h4>{cat} rules</h4><Chips items={RULE_OPTIONS[cat]} at={v.ruleOpt}/></div></div>;
 }
 return <div className="gb-embed"><div>The front page's control panel lives here:<br/>the quick panel (feel pad, intensity, mood) and the full control sheets, in the display.</div></div>;
}

export default function GeneratorBox({info,song,seq,onSeq}){
 const [section,setSection]=useState('scale');
 const [local,setLocal]=useState(INITIAL_VALUES);
 const [draft,setDraft]=useState({}),draftRef=useRef({}),timer=useRef(null),seqRef=useRef(onSeq);seqRef.current=onSeq;
 const [pressedLocal,setPressed]=useState({});
 // the knobs that belong to the song take its values, with a turn in progress laid over them
 const song_=seq??DEFAULT_SEQ;
 const values={...local,...seqValues(song_),...draft};
 const pressed={...pressedLocal,generated:!!song_.generated};
 const sec=SECTIONS.find(s=>s.id===section);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const commit=()=>{
  const turned=draftRef.current,all={...seqValues(song_),...turned};let patch={};
  for(const id of Object.keys(turned))Object.assign(patch,seqPatch(id,all));
  draftRef.current={};setDraft({});
  if(Object.keys(patch).length)seqRef.current?.(patch);
 };
 const turn=(knob,p)=>{
  const next=knobValue(knob,values,p);
  if(seq&&seqPatch(knob.id,{...values,[knob.id]:next})){
   draftRef.current={...draftRef.current,[knob.id]:next};setDraft(draftRef.current);
   clearTimeout(timer.current);timer.current=setTimeout(commit,350);
  }else setLocal(v=>({...v,[knob.id]:next}));
 };
 const press=id=>{
  if(id==='generated'){if(seq)seqRef.current?.({progressionMode:song_.generated?'bank':'generated'});return;}
  setPressed(p=>{
   const next={...p,[id]:!p[id]};
   if(id==='wanVoice'){const n=WANDER_VOICES[values.wanVoice];next['wv'+n]=!p['wv'+n];next.wanVoice=false;}
   if(id==='evoKind'){const n=values.evoKind;const kinds=[...(p.evoKinds??[])];kinds[n]=!kinds[n];next.evoKinds=kinds;next.evoKind=false;}
   return next;
  });
 };
 const on=sec.onOff?pressed[sec.id==='evolution'?'evoOn':'wanOn']:null;
 const bpm=Math.round(BPM_LIMITS[0]+(BPM_LIMITS[1]-BPM_LIMITS[0])*values.bpm);
 const common=`${KEYS[values.key]} ${MODES[FAMILIES[values.family]][values.mode]} · ${PROGRESSIONS[values.progression].name} · ${bpm} BPM · ${METERS[values.meter]}`;
 return <section className="gbox" aria-label="Generator box">
  <header className="gb-head"><h2>Generator</h2>
  {song&&<div className="gb-songbar" role="group" aria-label="Song">
   <label className="gb-lcd"><small>Progressions</small>
    <select aria-label="Progressions" value={song.count} disabled={song.disabled} onChange={e=>song.onCount(+e.target.value)}>{song.choices.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" className="gb-key" disabled={song.disabled} onClick={song.onNew} title="The generator plans another song for this scene's settings and the sequencers take it"><small>Generate</small><b>New song</b></button>
   <button type="button" className="gb-key" disabled={song.disabled} onClick={song.onScene} title="The scene's own song"><small>Back to</small><b>Scene's song</b></button>
  </div>}
  <span className="gb-preset"><span className="gb-preset-screen" role="status"><small>Preset</small><b>{info?.preset??'Rainy Window'}</b></span><Encoder label="Preset" display="" position={.3} onPosition={()=>{}} onReset={()=>{}}/></span></header>
  <div className="gb-body">
   <nav className="gb-sections" aria-label="Generator sections">
    {SECTIONS.map(s=><button type="button" key={s.id} className={s.id===section?'on':''} aria-pressed={s.id===section} onClick={()=>setSection(s.id)}>{s.label}{s.onOff&&<i className={pressed[s.id==='evolution'?'evoOn':'wanOn']?'dot on':'dot'}/>}</button>)}
   </nav>
   <div className="gb-screen">
    <div className="gb-info" role="status"><span>{common}</span><span>{info?.status??'STOPPED'}</span></div>
    <div className="gb-title"><b>{sec.label}</b><small>{sec.blurb}{on===false?' · off':''}</small></div>
    <div className={'gb-main'+(on===false?' idle':'')}><Display section={sec} values={values} pressed={pressed} seq={seq}/></div>
   </div>
  </div>
  <footer className="gb-knobs" aria-label="Knobs">
   {sec.knobs.map((k,i)=>k?<PressKnob key={sec.id+k.id} knob={k} values={values} pressed={pressed} onTurn={turn} onPress={press}/>:<div key={i} className="gb-knob empty"><div className="gb-fn"><small>—</small></div></div>)}
  </footer>
 </section>;
}
