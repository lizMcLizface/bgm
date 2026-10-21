import React,{useEffect,useState} from 'react';
import {BEATS,ARRANGEMENTS,beatPattern,arrangementBank} from './kits';
import {drumShareUrl} from './share';
import './drums.css';

export function ShareDrums({kit,bank,values,rack,name}){
 const [link,setLink]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{setLink('');setStatus('');},[bank,values,rack,name]);
 const share=async()=>{
  try{
   const url=drumShareUrl(kit,{bank,values,rack,name});
   try{await navigator.clipboard.writeText(url);setLink('');setStatus('Link copied');}
   catch{setLink(url);setStatus('Copy this link');}
  }catch{setStatus('Unable to create link');}
 };
 return <span className="drum-share"><button type="button" onClick={share} title="Share all eight patterns, chain, tempo, swing, drum sounds and effects">Share drums</button>
  <span role="status">{status}</span>{link&&<input aria-label="Drum share link" value={link} readOnly onFocus={e=>e.target.select()}/>}</span>;
}
export default function DrumLibrary({kit,seq,choose,values,current,arrangements=false}){
 const entries=arrangements?ARRANGEMENTS:BEATS;
 const [category,setCategory]=useState('All'),[id,setId]=useState(entries[0].id);
 const list=entries.filter(b=>category==='All'||b.category===category),selected=list.find(b=>b.id===id)??list[0];
 const load=()=>{
  if(arrangements){seq.loadBank(arrangementBank(kit,selected));}
  else{
   const b=seq.bankRef.current,i=b.current;
   seq.loadBank({...b,patterns:b.patterns.map((p,j)=>j===i?beatPattern(kit,selected):p),lengths:b.lengths.map((n,j)=>j===i?16:n),tempos:b.tempos.map((n,j)=>j===i?0:n),chain:[],title:selected.name,names:Array.from({length:8},(_,j)=>j===i?selected.name:b.names?.[j]??'')},{keepPlaying:true});
  }
  choose({name:current,values:{...values,tempo:selected.bpm,swing:selected.swing}});
 };
 return <div className="drum-library">
  <label>Style<select aria-label="Rhythm style" value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(entries.map(b=>b.category))].map(c=><option key={c}>{c}</option>)}</select></label>
  <label>{arrangements?'Arrangement':'Loop'}<select aria-label={arrangements?'Drum arrangement':'Drum loop'} value={selected.id} onChange={e=>setId(e.target.value)}>{list.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <button type="button" onClick={load}>{arrangements?'Load arrangement':'Load loop'}</button>
  <span className="drum-recipe-note">{selected.bpm} bpm · {Math.round(selected.swing*100)}% swing · {arrangements?`${selected.chain.length} bars · replaces A–H`:'replaces selected pattern · chain off'}</span>
 </div>;
}
