// Pattern storage shared by the drum machines and the bass line: eight patterns (A–H), a chain,
// each pattern's length and optional tempo, and the pattern being edited, kept in the browser.
// The engine holds a copy; `chainCommands` sends everything but the steps.
import {useEffect,useRef,useState} from 'react';
import {load,save} from '../storage';

export const LETTERS='ABCDEFGH';
export const STEPS=16;

/** valid(pattern) checks a stored pattern's shape; empty() makes a blank one. */
export function usePatternBank(id,empty,valid){
 const KEY=`synths:${id}:patterns`;
 const [bank,setBank]=useState(()=>{
  const s=load(KEY,null);
  if(s&&Array.isArray(s.patterns)&&s.patterns.length===8&&s.patterns.every(valid)){
   const lengths=Array.from({length:8},(_,i)=>{const n=Number(s.lengths?.[i]);return n>=1&&n<=STEPS?Math.round(n):STEPS;});
   const tempos=Array.from({length:8},(_,i)=>{const n=Number(s.tempos?.[i]);return n>=30&&n<=300?n:0;});
   return {patterns:s.patterns,lengths,tempos,chain:(s.chain??[]).filter(n=>n>=0&&n<8).slice(0,16),current:Math.min(7,Math.max(0,s.current|0))};
  }
  return {patterns:Array.from({length:8},empty),lengths:Array(8).fill(STEPS),tempos:Array(8).fill(0),chain:[],current:0};
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
