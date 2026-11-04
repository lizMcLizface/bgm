import React,{useEffect,useMemo,useState} from 'react';
import {soundList} from '../ui/SoundPicker';
import {patchCode} from './sysex';

// The Juno-106's patch selector for this page's own sounds, laid out like its front panel and the Bank shelf: group A or B,
// bank 1–8, number 1–8 (128 slots). Sounds fill the slots in category order, so each kind of sound sits together; the eight
// number buttons are coloured by the kind of sound in each slot. Sounds you saved yourself stay as chips beside it.
export default function PatchGrid({synth,presets,mine,current,choose,remove}){
 const {sounds}=useMemo(()=>soundList(synth,presets,[]),[synth,presets]);
 const colour=Object.fromEntries((synth.categories??[]).map(c=>[c.id,c.colour]));
 const at=sounds.findIndex(p=>p.name===current);
 const [cursor,setCursor]=useState(0);
 useEffect(()=>{if(at>=0)setCursor(at);},[at]);
 const index=at>=0?at:cursor,group=index<64?0:1,bank=Math.floor(index%64/8),num=index%8;
 const slot=(g,b,n)=>g*64+b*8+n;
 const go=i=>{const n=128;const k=(i+n)%n;setCursor(k);if(sounds[k])choose(sounds[k]);};
 const filled=i=>i<sounds.length;
 // wide enough for the longest code and name, so the row never shifts as sounds change
 const nameWidth=Math.ceil(Math.max(...sounds.map(p=>`A11 ${p.name}`.length),12)*.92);
 return <div className="bank pg">
  <span className="bank-buttons" role="group" aria-label="Group">{['A','B'].map((g,i)=><button type="button" key={g} className={group===i?'on':''} disabled={!filled(slot(i,0,0))} onClick={()=>go(slot(i,bank,num))}>{g}</button>)}</span>
  <span className="bank-buttons" role="group" aria-label="Bank">{Array.from({length:8},(_,b)=><button type="button" key={b} className={bank===b?'on':''} disabled={!filled(slot(group,b,0))} onClick={()=>go(slot(group,b,num))}>{b+1}</button>)}</span>
  <span className="bank-buttons numbers" role="group" aria-label="Number">{Array.from({length:8},(_,n)=>{
   const i=slot(group,bank,n),p=sounds[i];
   return <button type="button" key={n} className={'pg-slot'+(i===index?' on':'')} style={p?{'--kind':colour[p.category]??'#c9c3b4'}:undefined} disabled={!p} title={p?`${patchCode(i)} ${p.name}`:'empty'} onClick={()=>go(i)}>{n+1}</button>;
  })}</span>
  <span className="bank-name" style={{width:nameWidth+'ch'}}><span className="pg-title"><b>{at>=0?patchCode(at):'—'}</b> {current||'Pick one…'}</span>{at>=0&&<small className="pg-kind">{sounds[at].categoryLabel}</small>}</span>
  {mine.length>0&&<span className="pg-mine" role="group" aria-label="Your sounds">{mine.map(p=><span key={p.name} className="pg-chip"><button type="button" className={p.name===current&&at<0?'on':''} onClick={()=>choose(p)}>{p.name}</button><button type="button" aria-label={'Delete '+p.name} onClick={()=>remove(p.name)}>×</button></span>)}</span>}
 </div>;
}
