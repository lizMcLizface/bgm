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
export function useSequencer({id,empty,valid,patternCommands,copyPattern,tempoId}){
 const [bank,setBank,bankRef]=usePatternBank(id,empty,valid);
 const [playing,setPlaying]=useState(false);
 const [sync,setSync]=useState({on:false,bpm:0});
 const syncRef=useRef(sync);syncRef.current=sync;
 const live=useRef(null),head=useRef(null),playingRef=useRef(false);
 const send=cmds=>live.current?.seq(cmds);
 const commit=next=>{bankRef.current=next;setBank(next);};
 const replacePattern=(index,pattern)=>commit({...bankRef.current,patterns:bankRef.current.patterns.map((p,i)=>i===index?pattern:p)});
 const onEngine=l=>{live.current=l;const b=bankRef.current;send([...b.patterns.flatMap((p,i)=>patternCommands(i,p)),...chainCommands(b)]);};
 const onStats=data=>{
  movePlayhead(head.current,data);
  const running=!!data.running;
  if(running!==playingRef.current){playingRef.current=running;setPlaying(running);}
 };
 const clock=useMemo(()=>createClockSync({
  enabled:()=>syncRef.current.on,
  onTempo:bpm=>{live.current?.setParam(tempoId,bpm);setSync(s=>({...s,bpm}));},
  onStart:fresh=>{live.current?.seq(fresh?[[6,0,0],[0,1,0]]:[[0,1,0]]);},
  onStop:()=>live.current?.seq([[0,0,0]]),
 }),[tempoId]);
 const api={
  bank,bankRef,live,playing,sync,head,send,commit,replacePattern,onEngine,onStats,onMidiRealtime:clock,
  setSync:on=>setSync({on,bpm:0}),
  togglePlay:()=>send([[0,playing?0:1,0]]),
  select:i=>{commit({...bankRef.current,current:i});send([[2,i,0]]);},
  clear:()=>{const b=bankRef.current;replacePattern(b.current,empty());send([[7,b.current,0]]);},
  copy:()=>{
   const b=bankRef.current,to=(b.current+1)%8;
   const patterns=b.patterns.map((p,i)=>i===to?copyPattern(b.patterns[b.current]):p);
   const lengths=b.lengths.map((n,i)=>i===to?b.lengths[b.current]:n),tempos=b.tempos.map((t,i)=>i===to?b.tempos[b.current]:t);
   commit({...b,patterns,lengths,tempos,current:to});
   send([...patternCommands(to,patterns[to]),[5,lengths[to],to],[8,to,tempos[to]],[2,to,0]]);
  },
  chain:list=>{commit({...bankRef.current,chain:list});send([[4,list.length,0],...list.map((p,i)=>[3,i,p])]);},
  setLength:n=>{const b=bankRef.current;commit({...b,lengths:b.lengths.map((x,i)=>i===b.current?n:x)});send([[5,n,b.current]]);},
  setTempo:bpm=>{const b=bankRef.current;commit({...b,tempos:b.tempos.map((x,i)=>i===b.current?bpm:x)});send([[8,b.current,bpm]]);},
  /** Replaces the pattern being edited. */
  load:pattern=>{const b=bankRef.current;replacePattern(b.current,pattern);send(patternCommands(b.current,pattern));},
 };
 return api;
}
