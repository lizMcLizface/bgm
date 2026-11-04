import React,{useEffect,useRef,useState} from 'react';
import {LETTERS} from '../seq/bank';

// Song mode: a row of blocks, each a pattern played for a number of repeats, played in order (looping or ending).
// It replaces the chain while it is on, and only the sequencer core plays it. The block being played is lit and fills
// as its repeats go by (read from the playhead, so no re-render per step).
const HUES=[8,38,52,150,185,215,265,320];
const MAX_BLOCKS=16;

export default function SongStrip({seq,core}){
 const {bank}=seq,song=bank.song??[],on=!!bank.songOn;
 const [sel,setSel]=useState(0);
 const root=useRef(null);
 const at=Math.min(sel,song.length-1);
 const edit=(i,patch)=>seq.setSong(song.map((b,j)=>j===i?{...b,...patch}:b));
 const move=(i,d)=>{const j=i+d;if(j<0||j>=song.length)return;const next=[...song];[next[i],next[j]]=[next[j],next[i]];seq.setSong(next);setSel(j);};
 const remove=i=>{seq.setSong(song.filter((_,j)=>j!==i));setSel(Math.max(0,i-1));};
 const add=()=>{if(song.length>=MAX_BLOCKS)return;seq.setSong([...song,{p:bank.current,n:1}]);setSel(song.length);};
 useEffect(()=>{
  let raf,last='';
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const head=seq.head.current,el=root.current;if(!head||!el)return;
   const key=head.dataset.songIndex+'/'+head.dataset.songRep+'/'+head.dataset.running;
   if(key===last)return;last=key;
   const running=head.dataset.running==='1'&&head.dataset.songIndex!==undefined,idx=Number(head.dataset.songIndex),rep=Number(head.dataset.songRep);
   el.querySelectorAll('.song-block').forEach((b,i)=>{
    const playing=running&&i===idx;b.classList.toggle('playing',playing);
    b.style.setProperty('--done',playing?(rep+1)/Number(b.dataset.n):0);
   });
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 return <div className={'song-strip'+(on?' on':'')} ref={root} role="group" aria-label="Song">
  <div className="song-bar">
   <label className="inline toggle song-toggle" title="Play the blocks below in order, each for its repeats"><input type="checkbox" checked={on} disabled={!core} onChange={e=>seq.setSongOn(e.target.checked)}/> Song</label>
   <label className="inline toggle"><input type="checkbox" checked={bank.songLoop!==false} onChange={e=>seq.setSongLoop(e.target.checked)}/> Loop</label>
   {song.length>0&&at>=0&&<span className="song-edit">
    <select aria-label="Pattern of the selected block" value={song[at].p} onChange={e=>edit(at,{p:Number(e.target.value)})}>{[...LETTERS].map((l,i)=><option key={l} value={i}>{l}</option>)}</select>
    <button type="button" aria-label="Fewer repeats" disabled={song[at].n<=1} onClick={()=>edit(at,{n:song[at].n-1})}>−</button>
    <output>×{song[at].n}</output>
    <button type="button" aria-label="More repeats" disabled={song[at].n>=8} onClick={()=>edit(at,{n:song[at].n+1})}>＋</button>
    <button type="button" aria-label="Move block earlier" onClick={()=>move(at,-1)} disabled={at===0}>◀</button>
    <button type="button" aria-label="Move block later" onClick={()=>move(at,1)} disabled={at===song.length-1}>▶</button>
    <button type="button" aria-label="Remove block" onClick={()=>remove(at)}>✕</button>
   </span>}
   {!core&&<small className="se-note">Song needs the core clock.</small>}
  </div>
  <span className="song-blocks">
   {song.length===0&&<em>empty · tap ＋ to add the current pattern</em>}
   {song.map((b,i)=><button type="button" key={i} data-n={b.n} className={'song-block'+(i===at?' sel':'')} style={{'--hue':HUES[b.p]}} aria-pressed={i===at} aria-label={`Block ${i+1}: pattern ${LETTERS[b.p]}, ${b.n} times`} onClick={()=>setSel(i)}>
    <b>{LETTERS[b.p]}</b><small>×{b.n}</small>
   </button>)}
   {song.length<MAX_BLOCKS&&<button type="button" className="song-add" onClick={add} aria-label="Add the current pattern to the song">＋</button>}
  </span>
  </div>;
}
