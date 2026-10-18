import React,{useState} from 'react';
import {FAMILIES,voicesFor,availabilityLabel} from './catalog';
import {VoiceBadges} from './VoicePicker';

export default function AllVoices({selected,onSelect}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
 const groups=FAMILIES.filter(([id])=>category==='all'||id===category).map(([id,name])=>({id,name,voices:voicesFor(id).filter(v=>`${name} ${v.name} ${v.origin} ${availabilityLabel(v)} ${v.isNew?'new':''}`.toLowerCase().includes(query.toLowerCase().trim()))})).filter(g=>g.voices.length);
 const count=groups.reduce((n,g)=>n+g.voices.length,0);
 return <section className="lab-section lab-all-picker" aria-label="All instrument voices">
  <div className="lab-section-heading"><div><small>01 / choose a voice</small><h2>All instruments</h2></div><span className="lab-hint" role="status">{count} voices</span></div>
  <label className="lab-search-label">Find a voice<input type="search" aria-label="Search all instruments" placeholder="Name, category, new, engine…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="lab-category-tabs" aria-label="Instrument categories"><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>All</button>{FAMILIES.map(([id,name])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{name}</button>)}</div>
  <div className="lab-voice-browser" tabIndex={0} aria-label="Categorised instrument picker">
   {groups.map(g=><section key={g.id} aria-label={g.name}><h3>{g.name}<small>{g.voices.length}</small></h3><div className="lab-voice-grid">{g.voices.map(v=><button key={v.id} className="lab-voice-choice" aria-pressed={selected.id===v.id} onClick={()=>onSelect(v.id)}><strong>{v.name}</strong><VoiceBadges voice={v}/></button>)}</div></section>)}
   {!count&&<p className="lab-hint">No voices match. Try another name or category.</p>}
  </div>
 </section>;
}
