import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import DrumTools from './DrumTools';
import {drumStepEvents} from './drumSteps';

it('edits captured velocity up to unity, ratchets and resets through the real drum playback path',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 let pattern;
 function Device(){const [p,set]=useState({length:16,steps:[{hits:[{drum:0,velocity:.8,duration:1}]},...Array(15).fill(null)]});pattern=p;
  return <DrumTools pattern={p} part={{startBar:0,bars:1}} stepsPerBar={16} picked={{step:0,lane:0}} onEdit={fn=>set(fn)} onClose={()=>{}}/>;
 }
 const set=(label,value)=>act(()=>{
  const input=container.querySelector(`[aria-label="${label}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const events=()=>drumStepEvents(pattern,0,{time:1,stepSec:.1});
 try{
  act(()=>root.render(<Device/>));expect(container.querySelector('[aria-label="Tune"]')).toBeNull();
  expect(events()[0].hit.velocity).toBe(.8);
  set('Velocity',1);expect(events()[0].hit.velocity).toBe(1);
  set('Ratchet',3);expect(events()).toHaveLength(3);
  act(()=>container.querySelector('.se-reset').click());expect(events()).toHaveLength(1);expect(events()[0].hit.velocity).toBe(.8);
 }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
