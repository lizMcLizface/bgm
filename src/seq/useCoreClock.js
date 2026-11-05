import {useEffect,useMemo,useRef} from 'react';
import {createScheduler} from './scheduler';
import {drumTarget,drumPattern} from './targets/drum';
import {bassTarget,bassPattern,bassStepEvents} from './targets/bass';
import {movePlayhead} from '../synths/seq/playhead';

/**
 * Drives a drum page (or, with bass, the bass line) from the sequencer core (src/seq) instead of the engine's own sequencer: the core books
 * timed notes on the audio clock and the engine plays them. `seq` is the page's useSequencer API, `values()` the
 * machine's current knob values, as a function returning {tempo, swing, flam, accent}. Experimental: see docs/SEQUENCER_DEVICE_PLAN.md.
 * Returns { toggle(), running } for the transport; `enabled` false leaves the engine's sequencer in charge.
 */
export default function useCoreClock({seq,kit,bass=false,values,enabled,silent,fill}){
 const fillRef=useRef(fill);fillRef.current=fill;
 const silentRef=useRef(silent);silentRef.current=silent;
 const seqRef=useRef(seq);seqRef.current=seq;
 const valuesRef=useRef(values);valuesRef.current=values;
 const timers=useRef(new Set());
 const scheduler=useMemo(()=>{
  const target=bass?bassTarget(()=>seqRef.current.live.current):drumTarget(kit,()=>seqRef.current.live.current,()=>valuesRef.current().accent??.5);
  const live=()=>seqRef.current.live.current;
  return createScheduler({
   now:()=>live()?.context.currentTime??0,
   bank:()=>seqRef.current.bankRef.current,
   pattern:bass?bassPattern():drumPattern(kit,t=>silentRef.current?.(t)??false),
   ...(bass?{events:bassStepEvents}:{}),
   tempo:()=>valuesRef.current().tempo??120,swing:()=>valuesRef.current().swing??.5,flam:()=>valuesRef.current().flam??.5,fill:()=>fillRef.current?.()??false,
   emit:events=>events.forEach(e=>target.trigger(e)),
   // a song that does not loop ends: stop the transport once its last step has been heard
   onEnd:({time})=>{const l=live();const wait=l?Math.max(0,(time-l.context.currentTime+l.latency)*1000):0;const id=setTimeout(()=>{timers.current.delete(id);stop();},wait);timers.current.add(id);},
   // the playhead and the pattern letter follow what is heard, which is the audio clock plus the output latency
   onStep:({pattern,step,time,count,song})=>{
    const l=live();if(!l)return;
    const wait=Math.max(0,(time-l.context.currentTime+l.latency)*1000);
    const id=setTimeout(()=>{timers.current.delete(id);const s=seqRef.current;movePlayhead(s.head.current,{running:true,step});if(s.head.current){s.head.current.dataset.count=count;if(song){s.head.current.dataset.songIndex=song.index;s.head.current.dataset.songRep=song.rep;}else{delete s.head.current.dataset.songIndex;}}s.showPattern(pattern,true);},wait);
    timers.current.add(id);
   },
  });
 },[kit,bass]);
 const clear=()=>{timers.current.forEach(clearTimeout);timers.current.clear();};
 const stop=()=>{scheduler.stop();clear();if(seqRef.current.head.current)delete seqRef.current.head.current.dataset.count;seqRef.current.setTransport(false);};
 const start=()=>{
  const s=seqRef.current;
  s.send([[0,0,0],[6,0,0]]); // the engine's own sequencer stays stopped and rewound
  s.setExternal(true);s.setTransport(true);scheduler.start();
 };
 // switching the clock off (or leaving the page) stops it and hands transport back to the engine
 useEffect(()=>()=>{scheduler.stop();clear();},[scheduler]);
 useEffect(()=>{if(!enabled&&scheduler.running)stop();seqRef.current.setExternal(enabled);},[enabled]);// eslint-disable-line react-hooks/exhaustive-deps
 return {toggle:()=>(scheduler.running?stop():start())};
}
