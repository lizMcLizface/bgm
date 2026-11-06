// A track with a length, rate or direction of its own is not where the pattern's playhead is: this marks the step each such row is actually on.
// The position comes from the global clock (src/seq/clock.js); painted on the DOM (class `head` on the pad), no React render.
import {useEffect} from 'react';
import {trackWindow,directedIndex} from '../../seq/core';

/** The step a track is on at clock position `at` ({ count, step, length }): its own step index, or null when it cannot be told (random direction). */
export function trackStepAt(at,{play,own,free=false}){
 const w=trackWindow(play,own,at.length,Math.floor(at.count),Math.floor(at.step),free);
 if(w.dir==='rand')return null;
 const k=Math.floor((w.base+(at.step-Math.floor(at.step)))*w.n/w.d+1e-9);
 return directedIndex(k,w.L,w.dir);
}

/** Whether a track plays other than the pattern does (its own length, a division, a direction). */
export const playsOwnWay=(play,own)=>!!own||!!(play&&(play.div||play.dir));

/**
 * Marks, on the grid's pads (`[data-cell="track-step"]` under `root()`), the step each own-way row is on while the sequencer runs.
 * `bank()` is the bank, `clock()` the global clock, `live()` the engine (for the output latency: the mark follows what is heard).
 */
export default function useRowHeads({live,clock,root,bank,tracks,running}){
 useEffect(()=>{
  const marked=new Map();
  const clear=()=>{marked.forEach(el=>el.classList.remove('head'));marked.clear();};
  if(!running){clear();return undefined;}
  let raf;
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const eng=live(),el=root(),c=clock();
   const at=eng&&el&&c?c.at(eng.context.currentTime-(eng.latency??0)):null;
   if(!at){clear();return;}
   const b=bank();
   for(let t=0;t<tracks;t++){
    const play=b.trackPlay?.[at.pattern]?.[t],own=b.trackLengths?.[at.pattern]?.[t];
    const idx=playsOwnWay(play,own)?trackStepAt(at,{play,own,free:b.freeRun}):null;
    const cell=idx===null?null:el.querySelector(`[data-cell="${t}-${idx}"]`);
    const old=marked.get(t);
    if(old===cell)continue;
    old?.classList.remove('head');
    if(cell){cell.classList.add('head');marked.set(t,cell);}else marked.delete(t);
   }
  };
  raf=requestAnimationFrame(frame);
  return ()=>{cancelAnimationFrame(raf);clear();};
 },[running,tracks]);// eslint-disable-line react-hooks/exhaustive-deps
}
