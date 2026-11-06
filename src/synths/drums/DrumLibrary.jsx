import React,{useState} from 'react';
import {ARRANGEMENTS,beatPattern,arrangementBank} from './kits';
import './drums.css';

/** Puts a loop (a recipe of beats.js) into the pattern being edited, keeping the transport running; the pattern's length and tempo are reset and the chain is off. */
export function loadBeatInto(seq,kit,beat){
 const b=seq.bankRef.current,i=b.current;
 seq.loadBank({...b,patterns:b.patterns.map((p,j)=>j===i?beatPattern(kit,beat):p),lengths:b.lengths.map((n,j)=>j===i?16:n),tempos:b.tempos.map((n,j)=>j===i?0:n),chain:[],title:beat.name,names:b.names.map((n,j)=>j===i?beat.name:n)},{keepPlaying:true});
}

// The arranger's loader: a ready-made arrangement (a chain of patterns with a song) replaces all the patterns. Loops go into one pattern
// through the sequencer's Load key instead.
export default function ArrangementLoader({kit,seq,choose,values,current}){
 const [category,setCategory]=useState('All'),[id,setId]=useState(ARRANGEMENTS[0].id);
 const list=ARRANGEMENTS.filter(b=>category==='All'||b.category===category),selected=list.find(b=>b.id===id)??list[0];
 const load=()=>{
  seq.loadBank(arrangementBank(kit,selected));
  choose({name:current,values:{...values,tempo:selected.bpm,swing:selected.swing}});
 };
 return <div className="drum-library">
  <label>Style<select aria-label="Arrangement style" value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(ARRANGEMENTS.map(b=>b.category))].map(c=><option key={c}>{c}</option>)}</select></label>
  <label>Arrangement<select aria-label="Drum arrangement" value={selected.id} onChange={e=>setId(e.target.value)}>{list.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <button type="button" onClick={load}>Load arrangement</button>
  <span className="drum-recipe-note">{selected.bpm} bpm · {Math.round(selected.swing*100)}% swing · {selected.chain.length} bars · replaces all patterns</span>
 </div>;
}
