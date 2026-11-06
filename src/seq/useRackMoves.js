import {useEffect,useRef} from 'react';
import {moveAt,moveProgress,movedRack} from './moves';

/**
 * Plays a pattern's effect moves (src/seq/moves.js) on the device's rack while the sequencer runs, 20 times a second: the rack's own Web Audio
 * glides between the patches. It follows the playhead's step count (the core clock keeps it in head.dataset.count), so a move starts with the
 * pattern. `rack()` are the rack's own values (what the panel shows); when the moves stop or are removed they are sent back.
 * `entry()` is the playing pattern's { loops, list }, `length()` its length in steps.
 */
export default function useRackMoves({live,head,rack,entry,length,tempo,running}){
 const ref=useRef({});ref.current={live,head,rack,entry,length,tempo};
 useEffect(()=>{
  const state={count:null,at:0,active:false};
  const restore=()=>{const {live:l,rack:r}=ref.current,eng=l();if(state.active&&eng?.setRack)eng.setRack(r());state.active=false;};
  const tick=()=>{
   const {live:l,head:h,rack:r,entry:e,length:n}=ref.current,eng=l(),moves=e();
   if(!eng?.setRack||!moves?.list.length){restore();return;}
   const raw=h.current?.dataset.count;
   if(raw===undefined)return;
   const count=Number(raw),now=eng.context.currentTime;
   if(count!==state.count){state.count=count;state.at=now;}
   const stepSec=60/Math.max(30,ref.current.tempo()||120)/4;
   eng.setRack(movedRack(r(),moveAt(moves.list,moveProgress(count,(now-state.at)/stepSec,n(),moves.loops))));
   state.active=true;
  };
  if(!running){restore();return undefined;}
  const id=setInterval(tick,50);
  return ()=>{clearInterval(id);restore();};
 },[running]);// eslint-disable-line react-hooks/exhaustive-deps
}
