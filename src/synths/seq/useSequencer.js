import {useMemo,useRef,useState} from 'react';
import {usePatternBank,chainCommands} from './bank';
import {movePlayhead} from './playhead';
import {createClockSync} from './clockSync';

/**
 * Everything the sequenced pages share: the pattern bank, the engine's copy of it, transport,
 * pattern letters, chain, length, per-pattern tempo, the playhead and MIDI clock follow.
 * patternCommands(index, pattern) lists the engine commands for one pattern; empty() and valid()
 * make and check a pattern; copyPattern(pattern) clones one; tempoId is the tempo parameter.
 */
const setAt=(list,i,value)=>Array.from({length:8},(_,j)=>j===i?value:(list?.[j]??{}));
export function useSequencer({id,empty,valid,patternCommands,copyPattern,tempoId,initialBank,onEdit}){
 const [bank,setBank,bankRef]=usePatternBank(id,empty,valid,initialBank);
 const [playing,setPlaying]=useState(false);
 const [playingPattern,setPlayingPattern]=useState(0),patternRef=useRef(0);
 const [sync,setSync]=useState({on:false,bpm:0});
 const syncRef=useRef(sync);syncRef.current=sync;
 const live=useRef(null),head=useRef(null),playingRef=useRef(false),awaitingStop=useRef(false),external=useRef(false);
 const send=cmds=>live.current?.seq(cmds);
 const commit=next=>{onEdit?.();bankRef.current=next;setBank(next);};
 const replacePattern=(index,pattern)=>commit({...bankRef.current,patterns:bankRef.current.patterns.map((p,i)=>i===index?pattern:p)});
 const transport=on=>{awaitingStop.current=!on;playingRef.current=on;setPlaying(on);if(!on)movePlayhead(head.current,{running:false,step:0});};
 const onEngine=l=>{live.current=l;awaitingStop.current=false;playingRef.current=false;setPlaying(false);const b=bankRef.current;send([...b.patterns.flatMap((p,i)=>patternCommands(i,p)),...chainCommands(b)]);};
 // The pattern that is playing, shown in the page; while a chain runs the editor follows it. This is a display
 // update only: selecting through api.select would queue the page in the engine and disrupt the chain.
 const showPattern=(pattern,running)=>{
  if(Number.isInteger(pattern)&&pattern!==patternRef.current){patternRef.current=pattern;setPlayingPattern(pattern);}
  const b=bankRef.current;
  if(running&&b.chain.length&&Number.isInteger(pattern)&&pattern>=0&&pattern<8&&b.current!==pattern){
   const next={...b,current:pattern};bankRef.current=next;setBank(next);
  }
 };
 const onStats=data=>{
  // an external clock (the sequencer core, src/seq) owns transport and playhead: the engine's own sequencer is not running
  if(external.current)return;
  const running=!!data.running;
  // Audio reports arrive asynchronously. Ignore running reports until Stop is
  // acknowledged, so Stop followed by a page edit cannot jump back to playback.
  if(awaitingStop.current){if(running)return;awaitingStop.current=false;}
  movePlayhead(head.current,data);
  showPattern(data.pattern,running);
  if(running!==playingRef.current){playingRef.current=running;setPlaying(running);}
 };
 const clock=useMemo(()=>createClockSync({
  enabled:()=>syncRef.current.on,
  onTempo:bpm=>{live.current?.setParam(tempoId,bpm);setSync(s=>({...s,bpm}));},
  onStart:fresh=>{transport(true);live.current?.seq(fresh?[[6,0,0],[0,1,0]]:[[0,1,0]]);},
  onStop:()=>{transport(false);live.current?.seq([[0,0,0]]);},
 }),[tempoId]);
 const api={
  bank,bankRef,live,playing,playingPattern,sync,head,send,commit,replacePattern,onEngine,onStats,onMidiRealtime:clock,
  setSync:on=>setSync({on,bpm:0}),
  /** Lets another clock drive transport: the engine's reports are ignored while on (see src/seq). */
  setExternal:on=>{external.current=on;},
  showPattern,
  /** Sets the transport state without sending anything to the engine (for an external clock). */
  setTransport:on=>{playingRef.current=on;awaitingStop.current=false;setPlaying(on);if(!on)movePlayhead(head.current,{running:false,step:0});},
  togglePlay:()=>{const on=!playingRef.current;transport(on);send([[0,on?1:0,0]]);},
  select:i=>{commit({...bankRef.current,current:i});send([[2,i,0]]);},
  clear:()=>{const b=bankRef.current;commit({...b,patterns:b.patterns.map((p,i)=>i===b.current?empty():p),locks:setAt(b.locks,b.current,{}),trackLengths:setAt(b.trackLengths,b.current,{})});send([[7,b.current,0]]);},
  /** One step's per-step values (see src/seq/core.js); null clears them. Only the core clock plays them. */
  setLock:(track,step,lock)=>{const b=bankRef.current,all={...(b.locks?.[b.current]??{})},key=track+':'+step;if(lock&&Object.keys(lock).length)all[key]=lock;else delete all[key];commit({...b,locks:setAt(b.locks,b.current,all)});},
  /** The song (see bank.js cleanSong); only the core clock plays it. */
  setSong:(song)=>{commit({...bankRef.current,song});},
  setSongOn:(on)=>{commit({...bankRef.current,songOn:on});},
  setSongLoop:(loop)=>{commit({...bankRef.current,songLoop:loop});},
  /** A track's own loop length (polymeter); null puts it back on the pattern's length. */
  setTrackLength:(track,n)=>{const b=bankRef.current,all={...(b.trackLengths?.[b.current]??{})};if(n)all[track]=n;else delete all[track];commit({...b,trackLengths:setAt(b.trackLengths,b.current,all)});},
  copy:()=>{
   const b=bankRef.current,to=(b.current+1)%8;
   const patterns=b.patterns.map((p,i)=>i===to?copyPattern(b.patterns[b.current]):p);
   const lengths=b.lengths.map((n,i)=>i===to?b.lengths[b.current]:n),tempos=b.tempos.map((t,i)=>i===to?b.tempos[b.current]:t);
   commit({...b,patterns,lengths,tempos,locks:setAt(b.locks,to,b.locks?.[b.current]??{}),trackLengths:setAt(b.trackLengths,to,b.trackLengths?.[b.current]??{}),current:to});
   send([...patternCommands(to,patterns[to]),[5,lengths[to],to],[8,to,tempos[to]],[2,to,0]]);
  },
  chain:list=>{commit({...bankRef.current,chain:list});send([[4,list.length,0],...list.map((p,i)=>[3,i,p])]);},
  setLength:n=>{const b=bankRef.current;commit({...b,lengths:b.lengths.map((x,i)=>i===b.current?n:x)});send([[5,n,b.current]]);},
  setTempo:bpm=>{const b=bankRef.current;commit({...b,tempos:b.tempos.map((x,i)=>i===b.current?bpm:x)});send([[8,b.current,bpm]]);},
  /** Arrangements rewind; loading a loop can keep the transport and step clock running. */
  loadBank:(next,{keepPlaying=false}={})=>{
   commit(next);send([...(keepPlaying?[]:[[0,0,0]]),...next.patterns.flatMap((p,i)=>patternCommands(i,p)),...chainCommands(next),...(keepPlaying?[]:[[6,0,0]])]);
   if(!keepPlaying)transport(false);
  },
  /** Replaces the pattern being edited. */
  load:pattern=>{const b=bankRef.current;replacePattern(b.current,pattern);send(patternCommands(b.current,pattern));},
 };
 return api;
}
