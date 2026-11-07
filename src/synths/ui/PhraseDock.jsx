import React,{useEffect,useRef,useState} from 'react';
import {AUDITION_PHRASES} from '../../app/auditionPhrases';
import PROGRESSIONS from '../../app/progressions';
import {SCALE_FAMILIES,TONIC_NAMES} from '../../app/theory';

// The pieces of the audition strip of a /synths page: the key, scale and progression the phrases play over (a bar under the
// header), the five audition phrases as buttons (keys 1-5) and the chords of the progression, which light up on the keys
// (both in the keyboard's box).
const progressionLabel=i=>PROGRESSIONS[i].join(' ');

// The play-over settings: where the key and chords come from, and, for "My own", the key, scale and progression.
function PlayOver({audition,onAudition,followLabel='Main page’s'}){
 const set=changes=>onAudition({...audition,...changes});
 return <div className="scale-pop" role="dialog" aria-label="Play over">
  <label>Chords<select value={audition.follow?'main':'own'} onChange={e=>set({follow:e.target.value==='main'})} aria-label="Where the key and chords come from">
   <option value="main">{followLabel}</option><option value="own">My own</option></select></label>
  {!audition.follow&&<>
   <label>Key<select value={audition.tonic} onChange={e=>set({tonic:Number(e.target.value)})}>{TONIC_NAMES.map((n,pc)=><option key={pc} value={pc}>{n}</option>)}</select></label>
   <label>Scale<select value={audition.mode} onChange={e=>set({mode:e.target.value})}>{SCALE_FAMILIES.map(f=><optgroup key={f.family} label={f.family}>{f.modes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label>
   <label>Progression<select value={audition.progression} onChange={e=>set({progression:Number(e.target.value)})}>{PROGRESSIONS.map((_,i)=><option key={i} value={i}>{progressionLabel(i)}</option>)}</select></label>
  </>}
 </div>;
}

export function AutoPlay({playing,onPlay,onStop,sounds}){
 return <span className="dock-phrases" role="group" aria-label="Audition phrases">
  <span className="dock-label">Auto play</span>
  {AUDITION_PHRASES.map((p,i)=><button key={p.id} type="button" className={playing===p.id?'on':''} aria-pressed={playing===p.id} title={`${p.title} (key ${i+1})`} onClick={()=>onPlay(p.id)}><b aria-hidden="true">{i+1}</b>{p.label}</button>)}
  <button type="button" className="dock-stop" disabled={!playing} onClick={onStop} title="Pause the phrase (Esc)" aria-label="Pause">❚❚</button>
  {sounds?.canMake&&<button type="button" onClick={sounds.make} title="A new generated sound (N)">✦ New</button>}
 </span>;
}

export function ChordChips({context,chordPick=0,onChordPick,audition,onAudition,followLabel}){
 const [open,setOpen]=useState(false),box=useRef(null);
 useEffect(()=>{
  if(!open)return;
  const away=e=>{if(!box.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};
  document.addEventListener('pointerdown',away);window.addEventListener('keydown',key,true);
  return ()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('keydown',key,true);};
 },[open]);
 return <span className="dock-context" ref={box}>
  <button type="button" className="scale-name" aria-expanded={open} aria-haspopup="dialog" title="Key, scale and chords the phrases play over: click to change" onClick={()=>setOpen(o=>!o)}>{context.key} <i aria-hidden="true">▾</i></button>
  {open&&<PlayOver audition={audition} onAudition={onAudition} followLabel={followLabel}/>}
  <span className="dock-chords" role="group" aria-label="Show a chord on the keys">{context.chords.map((c,i)=><button type="button" key={i} aria-pressed={chordPick===i+1} title="Show this chord on the keys" onClick={()=>onChordPick?.(i+1)}><b>{c.name}</b><small>{c.numeral}</small></button>)}</span>
 </span>;
}
