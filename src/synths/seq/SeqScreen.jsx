import React from 'react';
import Encoder from './Encoder';

// The sequencer's display and its four encoders, after the OXI One: an OLED window names what is being edited, three
// page tabs choose what the encoders are (pattern, a step, a step's second page) and each encoder shows its value in the window.
// `actions`: { pageId: { title, onClick } }: tapping the tab of the page already shown runs it (Gen: tap again to generate).
// `pages`: [{ id, label, encoders: [{ label, display, position, onPosition, onReset, disabled }] }]; `lines`: the window's text.
export default function SeqScreen({lines,pages,page,onPage,accent,actions={}}){
 const current=pages.find(p=>p.id===page)??pages[0];
 return <div className="seq-screen" style={{'--accent':accent}}>
  <div className="oled-window" role="status">
   {lines.map((l,i)=><div key={i} className={'oled-line l'+i}>{l}</div>)}
   <div className="oled-values">{current.encoders.map((e,i)=><span key={i} className={e.disabled?'dim':''}><small>{e.label}</small><b>{e.display}</b></span>)}</div>
  </div>
  <div className="screen-tabs" role="tablist" aria-label="Encoder page">
   {pages.map(p=><button type="button" key={p.id} role="tab" aria-selected={current.id===p.id} className={current.id===p.id?'on':''} title={actions[p.id]&&current.id===p.id?actions[p.id].title:undefined} onClick={()=>{if(current.id===p.id&&actions[p.id])actions[p.id].onClick();else onPage(p.id);}}>{p.label}</button>)}
  </div>
  <div className="encoders">{current.encoders.map((e,i)=><Encoder key={current.id+i} {...e}/>)}</div>
 </div>;
}
