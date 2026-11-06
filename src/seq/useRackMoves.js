import {useEffect,useRef} from 'react';
import {moveAt,moveProgress,movedRack} from './moves';

/**
 * Plays a pattern's effect moves (src/seq/moves.js) on the device's rack while the sequencer runs, 20 times a second: the rack's own Web Audio
 * glides between the patches. It reads the position from the global clock (src/seq/clock.js), so a move starts with the pattern and follows tempo
 * changes and pauses. `rack()` are the rack's own values (what the panel shows); when the moves stop or are removed they are sent back.
 * `entry()` is the playing pattern's { loops, list }; `clock()` the global clock.
 */
export default function useRackMoves({live,clock,rack,entry,running}){
 const ref=useRef({});ref.current={live,clock,rack,entry};
 useEffect(()=>{
  const state={active:false};
  const restore=()=>{const {live:l,rack:r}=ref.current,eng=l();if(state.active&&eng?.setRack)eng.setRack(r());state.active=false;};
  const tick=()=>{
   const {live:l,clock:c,rack:r,entry:e}=ref.current,eng=l(),moves=e();
   if(!eng?.setRack||!moves?.list.length){restore();return;}
   const at=c()?.at(eng.context.currentTime);
   if(!at)return;
   eng.setRack(movedRack(r(),moveAt(moves.list,moveProgress(at.count,0,at.length,moves.loops))));
   state.active=true;
  };
  if(!running){restore();return undefined;}
  const id=setInterval(tick,50);
  return ()=>{clearInterval(id);restore();};
 },[running]);// eslint-disable-line react-hooks/exhaustive-deps
}
