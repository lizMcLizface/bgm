import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ChannelMixer from './ChannelMixer';
import {BLOCKS,CHOICES} from '../effects/rackParts';
import {cleanRack} from '../effects/params';

let root,container;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

it('exposes every delay and reverb property, edits it, and disables unavailable channels',()=>{
 const channels=[{role:'lead',label:'Lead',short:'LD'}],edit=vi.fn();
 function Desk(){
  const [rack,setRack]=useState({...cleanRack(),'master.sync':0});
  return <ChannelMixer channels={channels} colours={{lead:'#fff'}} host={{rackValues:()=>rack}} tempo={120} onEdit={(_,changes)=>{edit(changes);setRack(r=>({...r,...changes}));}}/>;
 }
 act(()=>root.render(<Desk/>));
 const slider=label=>container.querySelector(`[role="slider"][aria-label="${label}"]`);
 const press=(node,key)=>act(()=>node.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
 const expected=BLOCKS.filter(b=>b.id==='reverb'||b.id==='delay').flatMap(b=>b.keys.map(([key,label])=>({key,label:`${b.name} · ${label}`})));
 expected.push({key:'effects.bypass',label:'Space bypass'},{key:'switch.delay',label:'Delay enabled'},{key:'switch.reverb',label:'Reverb enabled'},{key:'master.reverbFirst',label:'Reverb before delay'});
 for(let i=0;i<expected.length;i++){
  expect(slider('Effect property').getAttribute('aria-valuetext')).toBe(expected[i].label);
  if(CHOICES[expected[i].key])expect(CHOICES[expected[i].key]).toContain(slider('Property value').getAttribute('aria-valuetext'));
  if(i<expected.length-1)press(slider('Effect property'),'ArrowRight');
 }
 press(slider('Property value'),'ArrowRight');
 expect(edit).toHaveBeenLastCalledWith({'master.reverbFirst':1});
 act(()=>container.querySelector('button[title^="Ambience:"]').click());
 expect(slider('Property value').getAttribute('aria-disabled')).toBe('true');
 expect(slider('Reverb').getAttribute('aria-disabled')).toBe('true');
 expect(container.textContent).toContain('other controls are visual only');
});

it('disables manual delay time when synchronized',()=>{
 const rack={...cleanRack(),'master.sync':1};
 act(()=>root.render(<ChannelMixer channels={[{role:'lead',label:'Lead',short:'LD'}]} colours={{lead:'#fff'}} host={{rackValues:()=>rack}} tempo={120} onEdit={()=>{}}/>));
 const time=container.querySelector('[aria-label="Dly time"]');
 expect(time.getAttribute('aria-valuetext')).toBe('500ms');
 expect(time.getAttribute('aria-disabled')).toBe('true');
});
