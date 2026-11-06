import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ArrangementGrid from './ArrangementGrid';

test('pages through a long arrangement without losing progression selection', () => {
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.append(container);
 const root=createRoot(container), select=vi.fn();
 const project={stepsPerBar:16,patterns:{lead:{steps:Array(320).fill(null)}},progressions:Array.from({length:20},(_,i)=>({startBar:i,bars:1}))};
 function Harness(){
  const [offset,setOffset]=useState(0);
  return <ArrangementGrid project={project} sequencers={[{role:'lead',label:'Lead',short:'LD'}]} colours={{lead:'#fff'}} selected={0} progression={0} offset={offset} onOffset={setOffset} onSelect={select} rowAction="mute" mutes={{}} solos={{}} onMute={()=>{}} onSolo={()=>{}}/>;
 }
 try {
  act(()=>root.render(<Harness/>));
  expect(container.querySelector('[aria-label^="Lead, progression 16,"]')).toBeTruthy();
  expect(container.querySelector('[aria-label^="Lead, progression 20,"]')).toBeNull();
  const knob=container.querySelector('[aria-label="Progressions"]');
  for(let i=0;i<4;i++)act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
  const last=container.querySelector('[aria-label^="Lead, progression 20,"]');
  expect(last).toBeTruthy();
  act(()=>last.click());
  expect(select).toHaveBeenCalledWith(0,19);
 } finally {
  act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
 }
});
