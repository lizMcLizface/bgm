import React,{useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDesk} from './Desk';
import useFloating from './useFloating';
import {soundList} from './SoundPicker';

// Every sound of a synth at once, as a grid of small coloured tiles in a window that floats over the page and is dragged by its title.
// The colour is the sound's category (the legend names them; click one to show only that category). Click a tile to play that sound.
export default function SoundGrid({synth,presets,mine,current,currentCategory,choose,onClose}){
 const float=useFloating('synths:'+synth.id+':sound-grid',s=>({x:s.w+24,y:Math.round(s.h*.3)})),desk=useDesk();
 const {categories,sounds}=useMemo(()=>soundList(synth,presets,mine),[synth,presets,mine]);
 const [only,setOnly]=useState(null),list=useRef(null);
 // Arrow keys move through the tiles by row and column and play each sound as it is reached; Home and End go to the first and last, Escape closes.
 const onKeyDown=e=>{
  if(e.key==='Escape'){e.preventDefault();onClose();return;}
  const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
  if(!keys.includes(e.key)||e.ctrlKey||e.metaKey||e.altKey||!e.target.closest?.('.sg-tile'))return;
  const tiles=[...list.current.querySelectorAll('.sg-tile:not(.dim)')],here=tiles.indexOf(e.target.closest('.sg-tile'));
  if(here<0)return;
  const rect=t=>t.getBoundingClientRect(),from=rect(tiles[here]);let next=here;
  if(e.key==='ArrowLeft')next=Math.max(0,here-1);
  else if(e.key==='ArrowRight')next=Math.min(tiles.length-1,here+1);
  else if(e.key==='Home')next=0;
  else if(e.key==='End')next=tiles.length-1;
  else{
   // the nearest row above or below, and in it the tile whose centre is closest across
   const up=e.key==='ArrowUp',others=tiles.filter(t=>up?rect(t).top<from.top-2:rect(t).top>from.top+2);
   if(others.length){
    const rowTop=up?Math.max(...others.map(t=>rect(t).top)):Math.min(...others.map(t=>rect(t).top)),centre=from.left+from.width/2;
    const row=others.filter(t=>Math.abs(rect(t).top-rowTop)<=2);
    next=tiles.indexOf(row.reduce((a,b)=>Math.abs(rect(b).left+rect(b).width/2-centre)<Math.abs(rect(a).left+rect(a).width/2-centre)?b:a));
   }
  }
  e.preventDefault();
  if(next!==here){tiles[next].focus();tiles[next].click();}
 };
 const active=sounds.find(p=>p.name===current&&(p.cat==='mine')===(currentCategory==='mine'))??sounds.find(p=>p.name===current);
 const colourOf=id=>sounds.find(p=>p.cat===id)?.colour;
 const used=categories.filter(c=>sounds.some(p=>p.cat===c.id));
 return createPortal(<section ref={float.ref} className="group lab-window sound-grid" style={float.style} onPointerDownCapture={float.raise} onKeyDown={onKeyDown} aria-label={synth.name+' sound grid'}>
  <h3 {...float.handle}>Sounds<small>{sounds.length}</small><button type="button" className="lab-close" aria-label="Close sound grid" onClick={onClose}>×</button></h3>
  <div className="sg-legend" role="group" aria-label="Categories">
   {used.map(c=><button type="button" key={c.id} className={only===c.id?'on':''} aria-pressed={only===c.id} style={{'--chip':colourOf(c.id)}} title={c.blurb||c.label} onClick={()=>setOnly(o=>o===c.id?null:c.id)}>{c.label}</button>)}
  </div>
  <ul className="sg-grid" ref={list}>
   {sounds.map((p,i)=><li key={p.cat+'/'+p.name}>
    <button type="button" style={{'--chip':p.colour??'#9b86e5'}} tabIndex={p===active||(!active&&i===0)?0:-1} className={'sg-tile'+(p===active?' on':'')+(only&&p.cat!==only?' dim':'')} aria-current={p===active?'true':undefined} title={[p.categoryLabel,...(p.styles??[])].join(' · ')+(p.note?'\n'+p.note:'')} onClick={()=>choose(p)}>{p.name}</button>
   </li>)}
  </ul>
 </section>,desk.el??document.body);
}
