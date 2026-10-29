import React from 'react';
import {AUDITION_PHRASES} from '../../app/auditionPhrases';
import PROGRESSIONS from '../../app/progressions';
import {SCALE_FAMILIES,TONIC_NAMES} from '../../app/theory';

// The strip at the foot of a /synths page: the five audition phrases as buttons (keys 1-5),
// the key, scale and progression they play over (or the main page's, as last shown), the
// sound steppers and a legend of the keys, so none of it hides behind a keybind.
const progressionLabel=i=>PROGRESSIONS[i].join(' ');

export default function PhraseDock({audition,onAudition,context,playing,onPlay,onStop,sounds,keysHint}){
 const set=changes=>onAudition({...audition,...changes});
 return <section className="dock" aria-label="Audition and keys">
  <div className="dock-row">
   <span className="dock-label">Hear it</span>
   <span className="dock-phrases" role="group" aria-label="Audition phrases">
    {AUDITION_PHRASES.map((p,i)=><button key={p.id} type="button" className={playing===p.id?'on':''} aria-pressed={playing===p.id} title={`${p.title} (key ${i+1})`} onClick={()=>onPlay(p.id)}><b aria-hidden="true">{i+1}</b>{p.label}</button>)}
    <button type="button" className="dock-stop" disabled={!playing} onClick={onStop} title="Stop the phrase (Esc)">■</button>
   </span>
   <span className="dock-sounds" role="group" aria-label="Sounds">
    <button type="button" onClick={()=>sounds.step(-1)} title="Previous sound (←)">◂ Sound</button>
    <button type="button" onClick={()=>sounds.step(1)} title="Next sound (→)">Sound ▸</button>
    <button type="button" onClick={()=>sounds.step(-1,true)} title="Previous category (↑)">▴ Kind</button>
    <button type="button" onClick={()=>sounds.step(1,true)} title="Next category (↓)">Kind ▾</button>
    {sounds.canMake&&<button type="button" onClick={sounds.make} title="A new generated sound (N)">✦ New</button>}
   </span>
  </div>
  <div className="dock-row">
   <span className="dock-label">Over</span>
   <label>Chords<select value={audition.follow?'main':'own'} onChange={e=>set({follow:e.target.value==='main'})} aria-label="Where the key and chords come from">
    <option value="main">Main page’s</option><option value="own">My own</option></select></label>
   {!audition.follow&&<>
    <label>Key<select value={audition.tonic} onChange={e=>set({tonic:Number(e.target.value)})}>{TONIC_NAMES.map((n,pc)=><option key={pc} value={pc}>{n}</option>)}</select></label>
    <label>Scale<select value={audition.mode} onChange={e=>set({mode:e.target.value})}>{SCALE_FAMILIES.map(f=><optgroup key={f.family} label={f.family}>{f.modes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label>
    <label>Progression<select value={audition.progression} onChange={e=>set({progression:Number(e.target.value)})}>{PROGRESSIONS.map((_,i)=><option key={i} value={i}>{progressionLabel(i)}</option>)}</select></label>
   </>}
   <span className="dock-context" title="The key, scale and chords the phrases play over">
    <strong>{context.key}</strong>
    <span className="dock-chords">{context.chords.map((c,i)=><span key={i}><b>{c.name}</b><small>{c.numeral}</small></span>)}</span>
   </span>
  </div>
  <p className="dock-keys">{keysHint}</p>
 </section>;
}
