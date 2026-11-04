// Pattern storage shared by the drum machines and the bass line: eight patterns (A–H), a chain,
// each pattern's length and optional tempo, and the pattern being edited, kept in the browser.
// The engine holds a copy; `chainCommands` sends everything but the steps.
import {useEffect,useRef,useState} from 'react';
import {load,save} from '../storage';

export const LETTERS='ABCDEFGH';
export const STEPS=16;

/** Per-step values of a pattern, keyed 'track:step' (see src/seq/core.js for what they mean); bad entries are dropped. */
const RANGES={velocity:[.05,1],prob:[0,1],ratchet:[1,4],nudge:[-.5,.5],tune:[-1,1],decay:[-1,1]};
export function cleanLocks(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [key,lock] of Object.entries(raw)){
  const [t,st]=key.split(':').map(Number);
  if(!(Number.isInteger(t)&&t>=0&&t<32&&Number.isInteger(st)&&st>=0&&st<STEPS)||!lock||typeof lock!=='object')continue;
  const clean={};
  for(const [name,[lo,hi]] of Object.entries(RANGES))if(Number.isFinite(lock[name]))clean[name]=Math.min(hi,Math.max(lo,lock[name]));
  if(typeof lock.cond==='string'&&/^([1-9]:[1-9]|fill|not-fill)$/.test(lock.cond))clean.cond=lock.cond;
  if(Object.keys(clean).length)out[key]=clean;
 }
 return out;
}
/** The song: up to 16 blocks of { p: pattern 0-7, n: repeats 1-8 }. */
export function cleanSong(raw){
 return (Array.isArray(raw)?raw:[]).filter(b=>b&&Number.isInteger(b.p)&&b.p>=0&&b.p<8).slice(0,16).map(b=>({p:b.p,n:Math.min(8,Math.max(1,Math.round(Number(b.n))||1))}));
}
/** A pattern's tracks that loop on their own length: { track: steps }. */
export function cleanTrackLengths(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [t,n] of Object.entries(raw))if(Number.isInteger(+t)&&+t>=0&&+t<32&&Number.isInteger(+n)&&+n>=1&&+n<STEPS)out[t]=+n;
 return out;
}

/** valid(pattern) checks a stored pattern's shape; empty() makes a blank one. */
export function usePatternBank(id,empty,valid,initialBank){
 const KEY=`synths:${id}:patterns`;
 const [bank,setBank]=useState(()=>{
  const s=initialBank??load(KEY,null);
  if(s&&Array.isArray(s.patterns)&&s.patterns.length===8&&s.patterns.every(valid)){
   const lengths=Array.from({length:8},(_,i)=>{const n=Number(s.lengths?.[i]);return n>=1&&n<=STEPS?Math.round(n):STEPS;});
   const tempos=Array.from({length:8},(_,i)=>{const n=Number(s.tempos?.[i]);return n>=30&&n<=300?n:0;});
   return {patterns:s.patterns,lengths,tempos,chain:(Array.isArray(s.chain)?s.chain:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<8).slice(0,16),current:Math.min(7,Math.max(0,s.current|0)),title:String(s.title??'').slice(0,80),names:Array.from({length:8},(_,i)=>String(s.names?.[i]??'').slice(0,32)),locks:Array.from({length:8},(_,i)=>cleanLocks(s.locks?.[i])),trackLengths:Array.from({length:8},(_,i)=>cleanTrackLengths(s.trackLengths?.[i])),song:cleanSong(s.song),songOn:s.songOn===true,songLoop:s.songLoop!==false};
  }
  return {patterns:Array.from({length:8},empty),lengths:Array(8).fill(STEPS),tempos:Array(8).fill(0),chain:[],current:0,locks:Array.from({length:8},()=>({})),trackLengths:Array.from({length:8},()=>({}))};
 });
 const ref=useRef(bank);ref.current=bank;
 useEffect(()=>{const t=setTimeout(()=>save(KEY,bank),300);return ()=>clearTimeout(t);},[bank,KEY]);
 return [bank,setBank,ref];
}

/** Commands that make the engine's chain, lengths, tempos and pattern selection match the bank. */
export function chainCommands(bank){
 return [
  ...bank.lengths.map((n,p)=>[5,n,p]),
  ...bank.tempos.map((t,p)=>[8,p,t]),
  [4,bank.chain.length,0],...bank.chain.map((p,i)=>[3,i,p]),[2,bank.current,0],
 ];
}
