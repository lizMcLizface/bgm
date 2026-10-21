import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// A synth page's sound browser, in the style of the generator's preset window
// (src/app/PresetBrowser.jsx): a button that opens the sounds as cards sorted
// into the synth's own categories (its presets file exports CATEGORIES), with a
// search over names, notes and styles. Beside the button, the sounds sharing the
// current one's category stay one tap away for playing.
const ALL='all',MINE={id:'mine',label:'Mine',blurb:'Saved on this device'},OTHER={id:'other',label:'Other',blurb:''};

const matches=(p,words)=>{const hay=[p.name,p.note,...(p.styles??[]),p.categoryLabel].join(' ').toLowerCase();return words.every(w=>hay.includes(w));};

export default function SoundPicker({synth,presets,mine,current,choose,remove}){
 const [open,setOpen]=useState(false);
 const [category,setCategory]=useState(ALL);
 const [query,setQuery]=useState('');
 const trigger=useRef(null),search=useRef(null);
 const categories=useMemo(()=>{
  const own=synth.categories??[],ids=new Set(own.map(c=>c.id));
  return [...own,...(presets.some(p=>!ids.has(p.category))?[OTHER]:[]),...(mine.length?[MINE]:[])];
 },[synth,presets,mine.length]);
 const sounds=useMemo(()=>{
  const ids=new Set(categories.map(c=>c.id)),label=Object.fromEntries(categories.map(c=>[c.id,c.label]));
  const tag=(p,id)=>({...p,cat:id,categoryLabel:label[id]});
  return [...presets.map(p=>tag(p,ids.has(p.category)&&p.category!==MINE.id?p.category:OTHER.id)),...mine.map(p=>tag(p,MINE.id))];
 },[presets,mine,categories]);
 const active=sounds.find(p=>p.name===current&&p.cat===MINE.id)??sounds.find(p=>p.name===current);
 const close=()=>{setOpen(false);setQuery('');trigger.current?.focus();};
 useEffect(()=>{
  if(!open)return undefined;
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
  document.addEventListener('keydown',key);
  if(!window.matchMedia?.('(pointer: coarse)').matches)search.current?.focus({preventScroll:true});
  return ()=>document.removeEventListener('keydown',key);
 },[open]); // eslint-disable-line react-hooks/exhaustive-deps

 const words=query.toLowerCase().split(/\s+/).filter(Boolean);
 const shown=sounds.filter(p=>(category===ALL||p.cat===category)&&(!words.length||matches(p,words)));
 const sections=words.length&&category===ALL
  ?[{id:'matches',label:'Matches',blurb:'',items:shown}].filter(s=>s.items.length)
  :(category===ALL?categories:categories.filter(c=>c.id===category)).map(c=>({...c,items:shown.filter(p=>p.cat===c.id)})).filter(s=>s.items.length);
 const pick=p=>{choose(p);close();};
 const neighbours=active?sounds.filter(p=>p.cat===active.cat):[];

 return <>
  <button ref={trigger} type="button" className="sp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} title="Browse every sound by category">
   <span className="sp-trigger-label">{active?.categoryLabel??'Sounds'}</span><span className="sp-trigger-name">{current||'Pick one…'}</span><span aria-hidden="true">▾</span>
  </button>
  {neighbours.map(p=><button type="button" key={p.cat+'/'+p.name} style={{'--chip':p.colour}} className={'sp-chip'+(p.name===current?' on':'')} onClick={()=>choose(p)} title={p.note}>{p.name}</button>)}
  {open&&createPortal(<div className="sp-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&close()}>
   <div className="sp" role="dialog" aria-modal="true" aria-label={synth.name+' sounds'}>
    <div className="sp-head">
     <h2>{synth.name} sounds</h2>
     <input ref={search} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search: brass, glassy, sync…" aria-label="Search sounds"/>
     <button type="button" className="sp-close" onClick={close} aria-label="Close">×</button>
    </div>
    <div className="sp-body">
     <nav className="sp-cats" aria-label="Categories">
      {[{id:ALL,label:'All',blurb:'Every sound'},...categories].map(c=><button key={c.id} type="button" className={category===c.id?'on':''} aria-pressed={category===c.id} title={c.blurb} onClick={()=>setCategory(c.id)}>
       {c.label}<small>{c.id===ALL?sounds.length:sounds.filter(p=>p.cat===c.id).length}</small></button>)}
     </nav>
     <div className="sp-scroll">
      {!sections.length&&<p className="sp-empty">Nothing matches “{query}”.</p>}
      {sections.map(s=><section key={s.id}>
       {category===ALL||words.length?<h3>{s.label}{s.blurb&&<small> {s.blurb}</small>}</h3>:s.blurb&&<p className="sp-blurb-line">{s.blurb}</p>}
       <ul className="sp-grid">{s.items.map(p=><li key={p.cat+'/'+p.name} className={'sp-card'+(p===active?' on':'')}>
        <button type="button" className="sp-pick" onClick={()=>pick(p)} aria-current={p===active?'true':undefined}>
         <span className="sp-colour" style={{background:p.colour??'var(--line)'}}/>
         <strong>{p.name}</strong>
         {p.note&&<span className="sp-note">{p.note}</span>}
         {(p.styles?.length>0||words.length>0)&&<span className="sp-chips">{words.length>0&&<span className="sp-cat">{p.categoryLabel}</span>}{(p.styles??[]).map(t=><span key={t}>{t}</span>)}</span>}
        </button>
        {p.cat===MINE.id&&<button type="button" className="sp-remove" aria-label={`Delete ${p.name}`} title="Delete this sound" onClick={()=>remove(p.name)}>×</button>}
       </li>)}</ul>
      </section>)}
     </div>
    </div>
   </div>
  </div>,document.body)}
 </>;
}
