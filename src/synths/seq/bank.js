// Pattern storage shared by the drum machines and the bass line: eight patterns (A–H), a chain,
// each pattern's length and optional tempo, and the pattern being edited, kept in the browser.
// The engine holds a copy; `chainCommands` sends everything but the steps.
import {useEffect,useRef,useState} from 'react';
import {load,save} from '../storage';
import {DIVISIONS,DIRECTIONS} from '../../seq/core';

export const LETTERS='ABCDEFGH';
/** Patterns are named by layer and letter: pattern 0 is 1A, pattern 9 is 2B, pattern 63 is 8H. */
export const PER_LAYER=8,LAYERS=8,MAX_PATTERNS=PER_LAYER*LAYERS;
export const layerOf=i=>i>>3,letterOf=i=>i&7,patternId=(layer,letter)=>layer*PER_LAYER+letter;
export const patternName=i=>`${layerOf(i)+1}${LETTERS[letterOf(i)]}`;
/** A page of steps (what the grid shows at once, and the engine's own sequencer plays); a pattern may be up to MAX_STEPS long, in pages. */
export const STEPS=16,MAX_STEPS=64;
/** The step count a pattern's rows need for length `n`: whole pages of STEPS. */
export const capacityFor=n=>Math.min(MAX_STEPS,Math.max(STEPS,Math.ceil(n/STEPS)*STEPS));

/** Per-step values of a pattern, keyed 'track:step' (see src/seq/core.js for what they mean); bad entries are dropped. */
const RANGES={velocity:[.05,1],prob:[0,1],ratchet:[1,4],nudge:[-.5,.5],tune:[-1,1],decay:[-1,1]};
export function cleanLocks(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [key,lock] of Object.entries(raw)){
  const [t,st]=key.split(':').map(Number);
  if(!(Number.isInteger(t)&&t>=0&&t<32&&Number.isInteger(st)&&st>=0&&st<MAX_STEPS)||!lock||typeof lock!=='object')continue;
  const clean={};
  for(const [name,[lo,hi]] of Object.entries(RANGES))if(Number.isFinite(lock[name]))clean[name]=Math.min(hi,Math.max(lo,lock[name]));
  if(typeof lock.cond==='string'&&/^([1-9]:[1-9]|fill|not-fill|fixed)$/.test(lock.cond))clean.cond=lock.cond;
  if(Object.keys(clean).length)out[key]=clean;
 }
 return out;
}
/** The song: up to 16 blocks of { p: pattern 0-7, n: repeats 1-8 }. */
export function cleanSong(raw,count=8){
 return (Array.isArray(raw)?raw:[]).filter(b=>b&&Number.isInteger(b.p)&&b.p>=0&&b.p<count).slice(0,16).map(b=>({p:b.p,n:Math.min(8,Math.max(1,Math.round(Number(b.n))||1))}));
}
/** A pattern's tracks that loop on their own length: { track: steps }. */
export function cleanTrackLengths(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [t,n] of Object.entries(raw))if(Number.isInteger(+t)&&+t>=0&&+t<32&&Number.isInteger(+n)&&+n>=1&&+n<MAX_STEPS)out[t]=+n;
 return out;
}

/** How a pattern's tracks play: { track: { div, dir } } (src/seq/core.js DIVISIONS and DIRECTIONS); defaults are not stored. */
export function cleanTrackPlay(raw){
 const out={};
 if(!raw||typeof raw!=='object')return out;
 for(const [t,p] of Object.entries(raw)){
  if(!(Number.isInteger(+t)&&+t>=0&&+t<32)||!p||typeof p!=='object')continue;
  const clean={};
  if(DIVISIONS.some(d=>d.id===p.div)&&p.div!=='1/16')clean.div=p.div;
  if(DIRECTIONS.includes(p.dir)&&p.dir!=='fwd')clean.dir=p.dir;
  if(Object.keys(clean).length)out[t]=clean;
 }
 return out;
}

/**
 * A bank from stored or loaded data, or null when its patterns are not valid. A bank with fewer than `count` patterns
 * (the eight of earlier versions) is filled up with empty ones; lengths, tempos, names and per-pattern settings follow.
 * `loopIn` / `loopOut` are the song blocks the arrangement loops between (null: the whole song).
 */
export function normalizeBank(s,{count=8,empty,valid,migrate=null}){
 if(!s||!Array.isArray(s.patterns)||s.patterns.length<1||s.patterns.length>count||!s.patterns.every(valid))return null;
 const each=fn=>Array.from({length:count},(_,i)=>fn(i));
 const song=cleanSong(s.song,count),block=n=>Number.isInteger(n)&&n>=0&&n<song.length?n:null;
 let loopIn=block(s.loopIn),loopOut=block(s.loopOut);
 if(loopIn!==null&&loopOut!==null&&loopOut<loopIn)[loopIn,loopOut]=[loopOut,loopIn];
 const bank={
  patterns:each(i=>s.patterns[i]??empty()),
  lengths:each(i=>{const n=Number(s.lengths?.[i]);return n>=1&&n<=MAX_STEPS?Math.round(n):STEPS;}),
  tempos:each(i=>{const n=Number(s.tempos?.[i]);return n>=30&&n<=300?n:0;}),
  chain:(Array.isArray(s.chain)?s.chain:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<count).slice(0,16),
  current:Math.min(count-1,Math.max(0,s.current|0)),title:String(s.title??'').slice(0,80),
  names:each(i=>String(s.names?.[i]??'').slice(0,32)),
  locks:each(i=>cleanLocks(s.locks?.[i])),trackLengths:each(i=>cleanTrackLengths(s.trackLengths?.[i])),trackPlay:each(i=>cleanTrackPlay(s.trackPlay?.[i])),
  song,songOn:s.songOn===true,songLoop:s.songLoop!==false,loopIn,loopOut,
  // playback: not looping the pattern being edited but going on through the patterns (linear); staying on the song's current block (holdBlock)
  linear:s.linear===true,holdBlock:s.holdBlock===true,freeRun:s.freeRun===true,
 };
 return migrate?migrate(bank):bank;
}
/** A blank bank of `count` patterns. */
export const blankBank=(count,empty)=>({patterns:Array.from({length:count},empty),lengths:Array(count).fill(STEPS),tempos:Array(count).fill(0),chain:[],current:0,names:Array(count).fill(''),locks:Array.from({length:count},()=>({})),trackLengths:Array.from({length:count},()=>({})),trackPlay:Array.from({length:count},()=>({})),song:[],songOn:false,songLoop:true,loopIn:null,loopOut:null,linear:false,holdBlock:false,freeRun:false});

/** valid(pattern) checks a stored pattern's shape; empty() makes a blank one; `count` is how many patterns the bank holds (8, or 64 for the drum pages). */
export function usePatternBank(id,empty,valid,initialBank,count=8,migrate=null){
 const KEY=`synths:${id}:patterns`;
 const [bank,setBank]=useState(()=>normalizeBank(initialBank??load(KEY,null),{count,empty,valid,migrate})??blankBank(count,empty));
 const ref=useRef(bank);ref.current=bank;
 useEffect(()=>{const t=setTimeout(()=>save(KEY,bank),300);return ()=>clearTimeout(t);},[bank,KEY]);
 return [bank,setBank,ref];
}

/** Commands that make the engine's chain, lengths, tempos and pattern selection match the bank. */
export function chainCommands(bank){
 // the engine's own sequencer holds the first eight patterns; the others are played by the sequencer core
 const chain=bank.chain.filter(p=>p<PER_LAYER);
 return [
  ...bank.lengths.slice(0,PER_LAYER).map((n,p)=>[5,Math.min(n,STEPS),p]),
  ...bank.tempos.slice(0,PER_LAYER).map((t,p)=>[8,p,t]),
  [4,chain.length,0],...chain.map((p,i)=>[3,i,p]),...(bank.current<PER_LAYER?[[2,bank.current,0]]:[]),
 ];
}
