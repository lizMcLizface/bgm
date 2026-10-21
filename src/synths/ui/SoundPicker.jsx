import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// A synth page's sound browser, in the style of the generator's preset window
// (src/app/PresetBrowser.jsx): a button that opens the sounds as cards sorted
// into the synth's own categories (its presets file exports CATEGORIES), with a
// search over names, notes and styles. Beside the button, the sounds sharing the
// current one's category stay one tap away for playing. Synths with a generator (synth.generate,
// synth.generates) also offer "New": a fresh sound drawn for a category.
const ALL='all',MINE={id:'mine',label:'Mine',blurb:'Saved on this device'},OTHER={id:'other',label:'Other',blurb:''};

/** The sounds in picker order: the synth's categories in turn (sounds outside them under Other), then yours. */
export function soundList(synth,presets,mine){
 const own=synth.categories??[],ids=new Set(own.map(c=>c.id));
 const categories=[...own,...(presets.some(p=>!ids.has(p.category))?[OTHER]:[]),...(mine.length?[MINE]:[])];
 const label=Object.fromEntries(categories.map(c=>[c.id,c.label]));
 const tagged=[...presets.map(p=>({...p,cat:ids.has(p.category)&&p.category!==MINE.id?p.category:OTHER.id})),...mine.map(p=>({...p,cat:MINE.id}))];
 const sounds=categories.flatMap(c=>tagged.filter(p=>p.cat===c.id).map(p=>({...p,categoryLabel:label[c.id]})));
 return {categories,sounds};
}

/**
 * The sound a hotkey moves to: dir ±1 through the sounds (step), or to the first sound of the
 * previous/next category (jump). `current` is the playing sound's name, `currentCategory` its category
 * (a generated sound is not in the list, but its category is).
 */
export function nextSound({sounds,categories},current,currentCategory,dir,jump){
 if(!sounds.length)return null;
 const exact=sounds.findIndex(p=>p.name===current&&(p.cat===MINE.id)===(currentCategory===MINE.id));
 const at=exact>=0?exact:sounds.findIndex(p=>p.name===current);
 const cat=at>=0?sounds[at].cat:currentCategory;
 if(jump){
  const order=categories.map(c=>c.id).filter(id=>sounds.some(p=>p.cat===id));
  const i=order.indexOf(cat);
  const next=order[((i<0?(dir>0?-1:0):i)+dir+order.length)%order.length];
  return sounds.find(p=>p.cat===next);
 }
 if(at<0){const first=sounds.findIndex(p=>p.cat===cat);return sounds[first<0?0:dir>0?first:(first-1+sounds.length)%sounds.length];}
 return sounds[(at+dir+sounds.length)%sounds.length];
}

const matches=(p,words)=>{const hay=[p.name,p.note,...(p.styles??[]),p.categoryLabel].join(' ').toLowerCase();return words.every(w=>hay.includes(w));};

// `container`: where the browser window opens (a host page that scopes the synths' styles passes its own).
export default function SoundPicker({synth,presets,mine,current,currentCategory,choose,remove,container}){
 const [open,setOpen]=useState(false);
 const [category,setCategory]=useState(ALL);
 const [query,setQuery]=useState('');
 const trigger=useRef(null),search=useRef(null);
 const {categories,sounds}=useMemo(()=>soundList(synth,presets,mine),[synth,presets,mine]);
 const active=sounds.find(p=>p.name===current&&(p.cat===MINE.id)===(currentCategory===MINE.id))??sounds.find(p=>p.name===current);
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
 // a generated sound is not in the list: keep its category's sounds (and another "New") at hand
 const here=active?active.cat:currentCategory;
 const neighbours=here?sounds.filter(p=>p.cat===here):[];
 const canMake=id=>synth.generate&&synth.generates?.includes(id);
 const make=(id,andClose)=>{choose(synth.generate(id,Math.floor(Math.random()*1e9)));if(andClose)close();};
 const label=id=>categories.find(c=>c.id===id)?.label??id;

 return <>
  <button ref={trigger} type="button" className="sp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} title={`Browse every sound by category · keys: ← → sound, ↑ ↓ category${synth.generate?', N new':''}`}>
   <span className="sp-trigger-label">{active?.categoryLabel??(here?label(here):'Sounds')}</span><span className="sp-trigger-name">{current||'Pick one…'}</span><span aria-hidden="true">▾</span>
  </button>
  {here&&canMake(here)&&<button type="button" className="sp-new" onClick={()=>make(here)} title={`A fresh sound in ${label(here)}, generated now`}>✦ New</button>}
  {neighbours.map(p=><button type="button" key={p.cat+'/'+p.name} style={{'--chip':p.colour}} className={'sp-chip'+(p.name===current?' on':'')} onClick={()=>choose(p)} title={p.note}>{p.name}</button>)}
  {open&&createPortal(<div className="sp-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&close()}>
   <div className="sp" role="dialog" aria-modal="true" aria-label={synth.name+' sounds'}>
    <div className="sp-head">
     <h2>{synth.name} sounds</h2>
     <small className="sp-keys">← → sound · ↑ ↓ category{synth.generate?' · N new':''}</small>
     <input ref={search} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search: brass, glassy, sync…" aria-label="Search sounds"/>
     <button type="button" className="sp-close" onClick={close} aria-label="Close">×</button>
    </div>
    <div className="sp-body">
     <nav className="sp-cats" aria-label="Categories">
      {[{id:ALL,label:'All',blurb:'Every sound'},...categories].map(c=><button key={c.id} type="button" className={category===c.id?'on':''} aria-pressed={category===c.id} title={c.blurb} onClick={()=>setCategory(c.id)}>
       {c.label}<small>{c.id===ALL?sounds.length:sounds.filter(p=>p.cat===c.id).length}</small></button>)}
     </nav>
     <div className="sp-scroll">
      {category!==ALL&&canMake(category)&&<button type="button" className="sp-make" onClick={()=>make(category,true)}>✦ New sound in {label(category)}<small>generated now, in the spirit of the originals</small></button>}
      {category===ALL&&!words.length&&synth.generates?.length>0&&<p className="sp-blurb-line">Pick a category to generate a new sound in it.</p>}
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
  </div>,container??document.body)}
 </>;
}
