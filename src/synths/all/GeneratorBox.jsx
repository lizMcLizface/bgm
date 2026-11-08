import React,{useEffect,useRef,useState} from 'react';
import Encoder from '../seq/Encoder';
import {SECTIONS,KEYS,FAMILIES,MODES,PROGRESSIONS,METERS,BARS_PER_CHORD,optionsOf,knobText,knobPosition,knobValue,seqValues,seqPatch} from './generatorBoxModel';
import {BPM_LIMITS} from '../../app/conductor';
import useGeneratorControls,{numberKnob,choiceKnob} from './GeneratorControls';
import {useGeneratorView,CONTROL_PAGES,EVOLUTION_PAGES} from './workbenchView';
import './generatorBox.css';

const DEFAULT_SEQ={tonic:0,mode:'Major-1',progression:0,barsPerChord:1,bpm:72,meter:'4/4',generated:false,chords:null};
function Chips({items,at,label,slot,rows=1}){
 const ref=useRef(null),[edges,setEdges]=useState({left:false,right:false});
 const measure=()=>{const list=ref.current;if(list)setEdges({left:list.scrollLeft>1,right:list.scrollLeft+list.clientWidth<list.scrollWidth-1});};
 useEffect(()=>{
  const list=ref.current,update=()=>measure();
  const wheel=e=>{if(e.ctrlKey||e.metaKey||list.scrollWidth<=list.clientWidth+1)return;e.preventDefault();e.stopPropagation();list.scrollLeft+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?18:e.deltaMode===2?list.clientWidth:1);measure();};
  list.addEventListener('wheel',wheel,{passive:false});list.addEventListener('scroll',update);
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(update):null;ro?.observe(list);measure();
  return ()=>{list.removeEventListener('wheel',wheel);list.removeEventListener('scroll',update);ro?.disconnect();};
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const list=ref.current,item=list?.children[at];if(item&&(item.offsetLeft<list.scrollLeft||item.offsetLeft+item.offsetWidth>list.scrollLeft+list.clientWidth))list.scrollLeft=item.offsetLeft-(list.clientWidth-item.offsetWidth)/2;measure();},[at,items]);// eslint-disable-line react-hooks/exhaustive-deps
 const scroll=direction=>{ref.current.scrollLeft+=direction*ref.current.clientWidth*.8;measure();};
 return <div className="gb-scale-row" data-knob={slot}><h4><em>{slot}</em>{label}</h4><div className={'gb-chip-strip'+(rows===2?' double':'')}><button type="button" className="gb-chip-arrow" aria-label={`Previous ${label} choices`} disabled={!edges.left} onClick={()=>scroll(-1)}>‹</button><ul className="gb-chips" style={{'--chip-columns':Math.ceil(items.length/rows),'--chip-rows':rows}} ref={ref} aria-label={label}>{items.map((name,i)=><li key={name} aria-current={i===at?'true':undefined} className={i===at?'on':''}>{name}</li>)}</ul><button type="button" className="gb-chip-arrow" aria-label={`More ${label} choices`} disabled={!edges.right} onClick={()=>scroll(1)}>›</button></div></div>;
}
function SongDisplay({section,values,seq,settings}){
 if(section==='scale')return <div className="gb-scale-rows"><Chips label="Key" slot={1} rows={2} items={KEYS} at={values.key}/><Chips label="Scale" slot={2} items={FAMILIES} at={values.family}/><Chips label="Mode" slot={3} items={MODES[FAMILIES[values.family]]} at={values.mode}/></div>;
 if(section==='progression'){
  const progression=PROGRESSIONS[values.progression],bars=BARS_PER_CHORD[values.chordLength],chords=seq.chords?.length?seq.chords:progression.chords.map(name=>({name,bars}));
  return <div className="gb-progression"><h4 data-knob="1">{progression.name}</h4><div className="gb-song-badges"><span data-knob="2">{bars} bars / chord</span><span data-knob="3">{seq.generated?'Generated':'Bank'}</span><span data-knob="4">Mood {Math.round((settings?.mood.level??0)*100)}%</span></div><div className="gb-chords">{chords.map((c,i)=><div key={i}><b>{c.name}</b><small>{c.numeral?c.numeral+' · ':''}{c.bars} bar{c.bars>1?'s':''}</small></div>)}</div></div>;
 }
 const bpm=Math.round(BPM_LIMITS[0]+(BPM_LIMITS[1]-BPM_LIMITS[0])*values.bpm);
 return <div className="gb-tempo"><div data-knob="1"><b>{bpm}</b><span>BPM</span></div><div data-knob="2"><strong>{METERS[values.meter]}</strong><span>Meter</span></div><div data-knob="3"><strong>{BARS_PER_CHORD[values.tempoBars]}</strong><span>Bars / chord</span></div><div data-knob="4"><strong>{Math.round((settings?.swing??0)*100)}%</strong><span>Swing</span></div></div>;
}

function KnobSlot({knob,index,locked,onHint}){
 const inactive=!knob||knob.disabled||locked,label=knob?.label??`Unused control ${index+1}`;
 const display=<><small><em>{index+1}</em>{knob?.label??'Unassigned'}</small><b>{knob?.display??'—'}</b></>;
 return <div className={'gb-knob'+(inactive?' inactive':'')} data-slot={index+1} data-knob={index+1} onPointerEnter={()=>onHint(knob?.help)} onPointerLeave={()=>onHint(null)} onFocusCapture={()=>onHint(knob?.help)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))onHint(null);}}>
  <Encoder label={label} display={knob?.display??'Unassigned'} position={knob?.position??.5} step={knob?.step??.02} disabled={inactive} onPosition={knob?.onPosition??(()=>{})} onReset={knob?.onReset}/>
  {knob?.onPress?<button type="button" className="gb-fn" disabled={inactive} aria-label={`Toggle ${label}`} onClick={knob.onPress}>{display}</button>:<div className="gb-fn">{display}</div>}
 </div>;
}

function RibbonKnob({knob,disabled,onHint}){
 return <div className={'gb-ribbon-knob'+(disabled?' inactive':'')} onPointerEnter={()=>onHint(knob.help)} onPointerLeave={()=>onHint(null)} onFocusCapture={()=>onHint(knob.help)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))onHint(null);}}><Encoder {...knob} disabled={disabled||knob.disabled}/><div className="gb-fn"><small>{knob.label}</small><b>{knob.display}</b></div></div>;
}
export default function GeneratorBox({info,song,seq,onSeq,presets,settings,onSettings,book,onRule}){
 const [view,updateView]=useGeneratorView(),{section}=view;
 const [hint,setHint]=useState(null),[draft,setDraft]=useState({});
 const draftRef=useRef({}),timer=useRef(null),seqRef=useRef(onSeq);seqRef.current=onSeq;
 const song_=seq??DEFAULT_SEQ,values={...seqValues(song_),...draft},sec=SECTIONS.find(s=>s.id===section);
 const panel=useGeneratorControls(section,settings,onSettings,book,onRule,view,updateView);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{if(song?.disabled){clearTimeout(timer.current);draftRef.current={};setDraft({});}},[song?.disabled]);
 const turn=(knob,p)=>{
  const next=knobValue(knob,values,p);draftRef.current={...draftRef.current,[knob.id]:next};setDraft(draftRef.current);
  clearTimeout(timer.current);timer.current=setTimeout(()=>{
   const all={...seqValues(song_),...draftRef.current};let patch={};
   for(const id of Object.keys(draftRef.current))Object.assign(patch,seqPatch(id,all));
   draftRef.current={};setDraft({});if(Object.keys(patch).length)seqRef.current?.(patch);
  },350);
 };
 const generated=on=>{if(!!song_.generated!==on)seqRef.current?.({progressionMode:on?'generated':'bank'});};
 const boundKnobs=sec.knobs.map(k=>{
  if(!k)return null;
  if(k.id==='generated')return {label:'Generate',display:song_.generated?'Generated':'Bank',position:song_.generated?1:0,step:1,onPosition:p=>generated(p>=.5),onReset:()=>generated(false),onPress:()=>generated(!song_.generated),help:'Bank progression or a newly generated chord sequence.'};
  if(k.id==='mood'&&settings)return numberKnob('Mood',settings.mood.level,v=>onSettings({mood:{...settings.mood,level:v}}),{min:-1,step:.05,home:0,help:'Suspended and sparse to lush harmony.'});
  if(k.id==='swing'&&settings)return numberKnob('Swing',settings.swing,v=>onSettings({swing:v}),{max:.6,step:.02,home:0,help:'Straight to swung offbeats in new progressions.'});
  if(!['scale','progression','tempo'].includes(section))return null;
  return {label:k.label,display:knobText(k,values,{generated:song_.generated}),position:knobPosition(k,values),step:k.kind==='choice'?1/Math.max(1,optionsOf(k,values).length-1):1/(k.max-k.min),onPosition:p=>turn(k,p),onReset:()=>turn(k,0),help:sec.blurb+'. Changes apply at the next unbooked sequence.'};
 });
 const knobs=panel?.knobs??boundKnobs,bpm=Math.round(BPM_LIMITS[0]+(BPM_LIMITS[1]-BPM_LIMITS[0])*values.bpm);
 const common=`${KEYS[values.key]} ${MODES[FAMILIES[values.family]][values.mode]} · ${bpm} BPM · ${METERS[values.meter]}`;
 const bankPages=section==='control'?CONTROL_PAGES:section==='evolution'?EVOLUTION_PAGES:null;
 const bankIndex=bankPages?.findIndex(p=>p.id===view[section==='control'?'controlPage':'evolutionPage'])??-1;
 const selectSection=id=>{const pages=id==='control'?CONTROL_PAGES:id==='evolution'?EVOLUTION_PAGES:null,key=id==='control'?'controlPage':'evolutionPage';updateView({section:id,...(section===id&&pages?{[key]:pages[(pages.findIndex(p=>p.id===view[key])+1)%pages.length].id}:{})});setHint(null);};
 const help=hint??panel?.help??`${sec.blurb}. Changes are queued for the next sequence.`;
 return <section className="gbox gb-generator" aria-label="Generator box">
  <header className="gb-head"><h2>Generator</h2>{presets&&<RibbonKnob knob={choiceKnob('Scene preset',presets.names.map(name=>({value:name,label:name})),presets.current,presets.onChoose,'Choose a scene and its original song and voices.')} disabled={presets.disabled} onHint={setHint}/>}
   {song&&<><RibbonKnob knob={choiceKnob('Generator mode',[{value:false,label:'Song'},{value:true,label:'Continuous'}],song.continuous,song.onMode,'Song captures a fixed number of progressions. Continuous keeps generating ahead.')} disabled={song.disabled} onHint={setHint}/><RibbonKnob knob={choiceKnob('Progressions',song.choices.map(n=>({value:n,label:String(n)})),song.count,song.onCount,'Number of progressions to capture in Song mode.')} disabled={song.disabled||song.continuous} onHint={setHint}/><div className="gb-song-actions"><button type="button" className="gb-key primary" disabled={song.disabled} onClick={song.onNew} onPointerEnter={()=>setHint('Generate a new song from the current settings. This replaces the captured patterns.')} onPointerLeave={()=>setHint(null)}>New song</button><button type="button" className="gb-key" disabled={song.disabled} onClick={song.onScene} onPointerEnter={()=>setHint('Restore this scene’s original song and voices.')} onPointerLeave={()=>setHint(null)}>Reset scene</button></div></>}
  </header>
  <div className="gb-body"><nav className="gb-sections" aria-label="Generator sections">{SECTIONS.map(s=>{const pages=s.id==='control'?CONTROL_PAGES:s.id==='evolution'?EVOLUTION_PAGES:null,key=s.id==='control'?'controlPage':'evolutionPage';return <button type="button" key={s.id} className={s.id===section?'on':''} aria-pressed={s.id===section} aria-label={s.label} aria-describedby={pages?'gb-page-'+s.id:undefined} title={pages?`Press again for the next page · ${pages.find(p=>p.id===view[key]).label}`:undefined} onClick={()=>selectSection(s.id)}><span>{s.label}{s.onOff&&<i className={(s.id==='evolution'?settings?.drift.mode!=='off':Object.values(settings?.wander.voices??{}).some(Boolean))?'dot on':'dot'}/>}</span>{pages&&<><i className="gb-page-lights" aria-hidden="true">{pages.map((p,i)=><i key={p.id} data-knob={i+1} className={p.id===view[key]?'lit':''}/>)}</i><span className="gb-sr-only" id={'gb-page-'+s.id}>{pages.find(p=>p.id===view[key]).label}, page {pages.findIndex(p=>p.id===view[key])+1} of {pages.length}. Press again for the next page.</span></>}</button>;})}</nav>
  <div className="gb-screen"><div className="gb-info" role="status"><span>{common}</span><span>{info?.status??'STOPPED'}</span></div><div className="gb-title"><b>{sec.label}</b><span>{panel?.title!==sec.label?panel?.title:''}</span>{bankPages&&<small className="gb-bank-index">{bankIndex+1} / {bankPages.length}</small>}{panel?.accessory}</div><div className="gb-main">{panel?.screen??(['scale','progression','tempo'].includes(section)?<SongDisplay section={section} values={values} seq={song_} settings={settings}/>:<span>Preparing controls…</span>)}</div><div className="gb-screen-bottom">{bankPages&&<div className="gb-bank-meter" aria-hidden="true">{bankPages.map((p,i)=><i key={p.id} data-knob={i+1} className={i===bankIndex?'lit':''}/>)}</div>}<div className="gb-help" role="status" aria-label="Generator help">{help}</div></div></div>
  </div><footer className="gb-knobs" aria-label="Knobs">{Array.from({length:4},(_,i)=><KnobSlot key={i} index={i} knob={knobs[i]} locked={!!song?.disabled} onHint={setHint}/>)}</footer>
 </section>;
}
