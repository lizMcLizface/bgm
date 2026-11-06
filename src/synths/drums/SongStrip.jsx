import React,{useEffect,useRef} from 'react';
import {patternName,letterOf} from '../seq/bank';

// The song as a row of blocks, each a pattern played for a number of repeats, in order. The strip shows a window of the song
// (`start`, `count`: the arranger's Scroll and Zoom encoders) and marks the loop region. The block being played is lit
// and fills as its repeats go by (read from the playhead, so there is no re-render per step). Selecting a block is the
// arranger's `block`; the pattern and repeats are edited with its encoders.
const HUES=[8,38,52,150,185,215,265,320];
export const MAX_BLOCKS=16;

export default function SongStrip({seq,block,onBlock,start=0,count=8}){
 const {bank}=seq,song=bank.song??[];
 const root=useRef(null);
 const add=()=>{if(song.length>=MAX_BLOCKS)return;seq.setSong([...song,{p:bank.current,n:1}]);onBlock(song.length);};
 useEffect(()=>{
  let raf,last='';
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const head=seq.head.current,el=root.current;if(!head||!el)return;
   const key=head.dataset.songIndex+'/'+head.dataset.songRep+'/'+head.dataset.running;
   if(key===last)return;last=key;
   const running=head.dataset.running==='1'&&head.dataset.songIndex!==undefined,idx=Number(head.dataset.songIndex),rep=Number(head.dataset.songRep);
   el.querySelectorAll('.song-block').forEach(b=>{
    const playing=running&&Number(b.dataset.i)===idx;b.classList.toggle('playing',playing);
    b.style.setProperty('--done',playing?(rep+1)/Number(b.dataset.n):0);
   });
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const first=bank.loopIn??0,last=bank.loopOut??song.length-1,region=bank.loopIn!=null||bank.loopOut!=null;
 const shown=song.map((b,i)=>({b,i})).slice(start,start+count);
 return <div className={'song-strip'+(bank.songOn?' on':'')} ref={root} role="group" aria-label="Song">
  <span className="song-blocks">
   {song.length===0&&<em>empty · tap ＋ to add the pattern being edited</em>}
   {start>0&&<span className="song-more" aria-hidden="true">◂</span>}
   {shown.map(({b,i})=><button type="button" key={i} data-i={i} data-n={b.n} className={'song-block'+(i===block?' sel':'')+(region&&i>=first&&i<=last?' looped':'')+(region&&i===first?' loop-in':'')+(region&&i===last?' loop-out':'')} style={{'--hue':HUES[letterOf(b.p)]}} aria-pressed={i===block} aria-label={`Block ${i+1}: pattern ${patternName(b.p)}, ${b.n} times`} onClick={()=>onBlock(i)}>
    <small className="song-no">{i+1}</small><b>{patternName(b.p)}</b><small>×{b.n}</small>
   </button>)}
   {start+count<song.length&&<span className="song-more" aria-hidden="true">▸</span>}
   {song.length<MAX_BLOCKS&&<button type="button" className="song-add" onClick={add} aria-label="Add the pattern being edited to the song">＋</button>}
  </span>
 </div>;
}
