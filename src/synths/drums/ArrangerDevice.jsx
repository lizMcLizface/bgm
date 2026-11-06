import React,{useEffect,useState} from 'react';
import SeqScreen from '../seq/SeqScreen';
import SongStrip,{MAX_BLOCKS} from './SongStrip';
import {patternName,MAX_PATTERNS} from '../seq/bank';

// The arranger: the song and its loop, apart from the sequencer, which owns the patterns. A display and four encoders like the
// sequencer's: Song (scroll through the blocks, how many are shown, where the loop begins and ends) and Block (the selected
// block's pattern, how often it repeats, where it sits in the song). The sequencer steps through the same blocks.
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));

/** Where the song is playing, as { index, rep } or null: re-rendered only when it changes, not per step. */
function useSongPosition(head){
 const [pos,setPos]=useState(null);
 useEffect(()=>{
  let raf,last='';
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const el=head.current;if(!el)return;
   const key=el.dataset.songIndex+'/'+el.dataset.songRep+'/'+el.dataset.running;
   if(key===last)return;last=key;
   setPos(el.dataset.running==='1'&&el.dataset.songIndex!==undefined?{index:Number(el.dataset.songIndex),rep:Number(el.dataset.songRep)}:null);
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[head]);
 return pos;
}

export default function ArrangerDevice({seq,core,block,onBlock,file,drag,accent,loader,transport,jump}){
 const {bank}=seq,song=bank.song??[],len=song.length;
 const [page,setPage]=useState('song'),[zoom,setZoom]=useState(8),[start,setStart]=useState(0);
 const pos=useSongPosition(seq.head);
 const sel=clamp(block,0,Math.max(0,len-1)),cur=song[sel];
 const count=Math.min(zoom,Math.max(1,len)),maxStart=Math.max(0,len-count),from=clamp(start,0,maxStart);
 // follow the block being played when the window would hide it
 useEffect(()=>{if(pos&&(pos.index<from||pos.index>=from+count))setStart(clamp(pos.index-Math.floor(count/2),0,maxStart));},[pos?.index]);// eslint-disable-line react-hooks/exhaustive-deps
 const on=len>0,idx=n=>(len>1?n/(len-1):0);
 const edit=patch=>{if(cur)seq.setSong(song.map((b,j)=>j===sel?{...b,...patch}:b));};
 const move=to=>{const j=clamp(to,0,len-1);if(!cur||j===sel)return;const next=[...song];next.splice(sel,1);next.splice(j,0,cur);seq.setSong(next);onBlock(j);};
 const loopIn=bank.loopIn??0,loopOut=bank.loopOut??Math.max(0,len-1);
 const setLoop=(a,b)=>seq.setLoop(a<=0&&b>=len-1?[null,null]:[a,b]);
 const pages=[
  {id:'song',label:'Song',encoders:[
   {label:'Scroll',display:on?`${from+1}–${from+count}`:'—',position:maxStart?from/maxStart:0,disabled:!maxStart,step:maxStart?1/maxStart:.1,onPosition:p=>setStart(Math.round(p*maxStart)),onReset:()=>setStart(0)},
   {label:'Zoom',display:`${zoom} blocks`,position:(zoom-2)/(MAX_BLOCKS-2),step:1/(MAX_BLOCKS-2),onPosition:p=>setZoom(Math.round(2+p*(MAX_BLOCKS-2))),onReset:()=>setZoom(8)},
   {label:'Loop in',display:on?String(loopIn+1):'—',position:idx(loopIn),disabled:len<2,step:1/Math.max(1,len-1),onPosition:p=>{const a=Math.round(p*(len-1));setLoop(a,Math.max(a,loopOut));},onReset:()=>setLoop(0,loopOut)},
   {label:'Loop out',display:on?String(loopOut+1):'—',position:idx(loopOut),disabled:len<2,step:1/Math.max(1,len-1),onPosition:p=>{const b=Math.round(p*(len-1));setLoop(Math.min(loopIn,b),b);},onReset:()=>setLoop(loopIn,len-1)}]},
  {id:'block',label:'Block',encoders:[
   {label:'Pattern',display:cur?patternName(cur.p):'—',position:cur?cur.p/(MAX_PATTERNS-1):0,disabled:!cur,step:1/(MAX_PATTERNS-1),onPosition:p=>edit({p:Math.round(p*(MAX_PATTERNS-1))}),onReset:()=>edit({p:bank.current})},
   {label:'Repeats',display:cur?'×'+cur.n:'—',position:cur?(cur.n-1)/7:0,disabled:!cur,step:1/7,onPosition:p=>edit({n:Math.round(1+p*7)}),onReset:()=>edit({n:1})},
   {label:'Move',display:cur?`${sel+1} of ${len}`:'—',position:idx(sel),disabled:len<2,step:1/Math.max(1,len-1),onPosition:p=>move(Math.round(p*(len-1))),onReset:()=>move(0)}]},
 ];
 const passes=song.reduce((a,b)=>a+b.n,0);
 const lines=[
  `SONG · ${len} BLOCK${len===1?'':'S'} · ${passes} PASS${passes===1?'':'ES'}`,
  cur?`BLOCK ${sel+1} · ${patternName(cur.p)} ×${cur.n}`:'NO BLOCKS YET',
  pos&&song[pos.index]?`PLAYING ${pos.index+1} · ${patternName(song[pos.index].p)} · REP ${pos.rep+1}/${song[pos.index].n}`:(bank.loopIn!=null||bank.loopOut!=null?`LOOP ${loopIn+1}–${loopOut+1}`:bank.songOn?'SONG ON · WHOLE SONG':'SONG OFF'),
 ];
 return <section className="device device-arranger" aria-label="Arranger" ref={drag.ref} style={drag.style}>
  <div className="grip device-grip" {...drag.handle} role="presentation"><i/></div>
  <header className="device-head"><h2>Arranger</h2><span>{core?'song · loop':'song needs the core clock'}</span>{file}</header>
  {loader&&<div className="device-ribbon">{loader}</div>}
  <div className="arr-body">
   <SeqScreen accent={accent} page={page} onPage={setPage} pages={pages} lines={lines}/>
   <div className="arr-right">
    <div className="arr-toggles">
     <label className="inline toggle song-toggle" title="Play the blocks in order, each for its repeats, instead of the one pattern"><input type="checkbox" checked={!!bank.songOn} disabled={!core||!len} onChange={e=>seq.setSongOn(e.target.checked)}/> Song</label>
     <label className="inline toggle" title="Start again at the loop in when the song reaches the loop out"><input type="checkbox" checked={bank.songLoop!==false} onChange={e=>seq.setSongLoop(e.target.checked)}/> Loop</label>
     <button type="button" disabled={!cur} onClick={()=>{seq.setSong(song.filter((_,j)=>j!==sel));onBlock(Math.max(0,sel-1));}} title="Remove the selected block">Remove block</button>
     <button type="button" disabled={bank.loopIn==null&&bank.loopOut==null} onClick={()=>seq.setLoop([null,null])} title="Loop the whole song">Clear loop</button>
    </div>
    <SongStrip seq={seq} block={sel} onBlock={b=>{onBlock(b);if(song[b])seq.select(song[b].p);}} start={from} count={count}/>
    {transport&&<div className="arr-transport" role="group" aria-label="Arranger transport">
     <button type="button" className={'tp play'+(transport.playing?' on':'')} aria-pressed={transport.playing} onClick={transport.play} title="Play"><b>▶</b><small>Play</small></button>
     <button type="button" className={'tp'+(transport.paused?' on':'')} aria-pressed={transport.paused} onClick={transport.pause} disabled={!transport.playing&&!transport.paused} title="Pause here; play goes on from this place"><b>⏸</b><small>Pause</small></button>
     <button type="button" className="tp" onClick={transport.stop} title="Stop and go back to the start"><b>■</b><small>Stop</small></button>
     <button type="button" className={'tp'+(bank.holdBlock?' on':'')} aria-pressed={!!bank.holdBlock} disabled={!core||!bank.songOn||!len} onClick={()=>seq.setHoldBlock(!bank.holdBlock)} title="Loop the current block of the song instead of going on to the next"><b>⟲</b><small>Loop block</small></button>
     <button type="button" className="tp" disabled={!core} onClick={()=>jump(-1)} title={bank.songOn&&len?'Previous block of the song':'Previous pattern'}><b>⏮</b><small>Prev</small></button>
     <button type="button" className="tp" disabled={!core} onClick={()=>transport.stepBy(-1)} title="Back one step (plays it while stopped or paused)"><b>◂</b><small>Step back</small></button>
     <button type="button" className="tp" disabled={!core} onClick={()=>transport.stepBy(1)} title="Forward one step (plays it while stopped or paused)"><b>▸</b><small>Step on</small></button>
     <button type="button" className="tp" disabled={!core} onClick={()=>jump(1)} title={bank.songOn&&len?'Next block of the song':'Next pattern'}><b>⏭</b><small>Next</small></button>
    </div>}
   </div>
  </div>
 </section>;
}
