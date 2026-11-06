import {describe,expect,it,vi} from 'vitest';
import {makeKey} from '../../seq/harmony';
import {pitchClasses} from './ProgressionGrid';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ProgressionGrid from './ProgressionGrid';

describe('progression grid pitch ordering',()=>{
 const key=makeKey('Major-1',0);
 it('orders pitches from the scale tonic',()=>{
  expect(pitchClasses(key,false)).toEqual([0,2,4,5,7,9,11]);
  expect(pitchClasses(makeKey('Major-1',10),false)[0]).toBe(10);
 });

 it('uses chord-relative colours for chord tones and tonic-relative colours for other scale tones',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container),key=makeKey('Major-1',0);
  const project={key,stepsPerBar:16,chords:[{bar:0,name:'G',pitchClasses:[7,11,2],scalePcs:[0,2,4,5,7,9,11]}]};
  const pattern={steps:[{n:[{d:0},{d:1},{d:4},{d:6}]}]};
  try{
   act(()=>root.render(<ProgressionGrid project={project} part={{startBar:0,bars:1}} pattern={pattern} colour="#999999" offset={0} onOffset={()=>{}} view="scale" octave={4} sequencers={[]} selected={0}/>));
   expect(container.querySelector('[aria-label="G step 1"]').style.getPropertyValue('--voice')).toBe('#ff4d4d');
   expect(container.querySelector('[aria-label="B step 1"]').style.getPropertyValue('--voice')).toBe('#d2f25f');
   expect(container.querySelector('[aria-label="D step 1"]').style.getPropertyValue('--voice')).toBe('#45b6ff');
   expect(container.querySelector('[aria-label="C step 1"]').style.getPropertyValue('--voice')).toBe('#ff4d4d');
  }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('colours note labels and pitch buttons using the focused chord, without recolouring octave controls',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const project={key,stepsPerBar:16,chords:[
   {bar:0,name:'C',pitchClasses:[0,4,7],scalePcs:[0,2,4,5,7,9,11]},
   {bar:1,name:'G',pitchClasses:[7,11,2],scalePcs:[0,2,4,5,7,9,11]},
  ]};
  const render=(props={})=>act(()=>root.render(<ProgressionGrid project={project} part={{startBar:0,bars:2}} pattern={{steps:[]}} colour="#999999" offset={16} onOffset={()=>{}} view="scale" octave={4} {...props}/>));
  const label=name=>[...container.querySelectorAll('.lane-info')].find(x=>x.querySelector('b')?.textContent===name);
  const rows=()=>[...container.querySelectorAll('.lane-info b')].map(x=>x.textContent);
  try{
   render();
   const initialRows=rows();
   expect(label('C').style.getPropertyValue('--voice')).toBe('#ff4d4d');
   render({focus:1});
   expect(rows()).toEqual(initialRows);
   expect(label('G').style.getPropertyValue('--voice')).toBe('#ff4d4d');
   expect(label('B').style.getPropertyValue('--voice')).toBe('#d2f25f');
   expect(label('D').style.getPropertyValue('--voice')).toBe('#45b6ff');
   expect(label('C').querySelector('i').textContent).toBe('Perfect fourth');
   expect(container.querySelector('[aria-label="Select octave 4"]').style.getPropertyValue('--voice')).toBe('#999999');
   render({offset:0,focus:0});
   expect(label('E').style.getPropertyValue('--voice')).toBe('#d2f25f');
   expect(label('G').style.getPropertyValue('--voice')).toBe('#45b6ff');
   render({view:'octave',focus:0});
   const buttons=[...container.querySelectorAll('.seq-names button')].map(x=>x.textContent);
   expect(buttons).toEqual(['B','A','G','F','E','D','C','♪']);
   expect([...container.querySelectorAll('.lane-info b')].slice(0,7).map(x=>x.textContent)).toEqual(['OCTAVE 8','OCTAVE 7','OCTAVE 6','OCTAVE 5','OCTAVE 4','OCTAVE 3','OCTAVE 2']);
   expect(container.querySelector('[aria-label="Select E"]').style.getPropertyValue('--voice')).toBe('#d2f25f');
   expect([...container.querySelectorAll('.octave-label')].find(x=>x.querySelector('i').textContent==='E · Major third').style.getPropertyValue('--voice')).toBe('#d2f25f');
   render({view:'octave',focus:1});
   expect([...container.querySelectorAll('.seq-names button')].map(x=>x.textContent)).toEqual(buttons);
   expect(container.querySelector('[aria-label="Select G"]').style.getPropertyValue('--voice')).toBe('#ff4d4d');
   render({view:'octave',offScale:true});
   const offScaleButtons=[...container.querySelectorAll('.seq-names button')].map(x=>x.textContent);
   expect(offScaleButtons).toEqual(['B♭','A♭','F♯','E♭','C♯','—','—','♯']);
   expect(container.querySelector('[aria-label="Select C♯"]').style.getPropertyValue('--voice')).toBe('#999999');
   expect(container.querySelector('[aria-label="Toggle off-scale notes"]').style.getPropertyValue('--voice')).toBe('#999999');
   render({view:'octave',offScale:true,focus:1});
   expect([...container.querySelectorAll('.seq-names button')].map(x=>x.textContent)).toEqual(offScaleButtons);
  }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('offers missing pitch classes in tonic-relative order',()=>{
  expect(pitchClasses(key,true)).toEqual([1,3,6,8,10]);
 });
 it('inserts the chosen button pitch in the clicked octave row',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container),toggle=vi.fn();
  const project={key,stepsPerBar:16,chords:[{bar:0,name:'C',pitchClasses:[0,4,7]}]};
  function Harness(){
   const [pitch,setPitch]=React.useState(0),[offScale,setOffScale]=React.useState(false);
   return <ProgressionGrid project={project} part={{startBar:0,bars:1}} pattern={{length:16,steps:Array(16).fill(null)}} colour="#999999" offset={0} onOffset={()=>{}} view="octave" pitch={pitch} onPitch={setPitch} offScale={offScale} onOffScale={setOffScale} onToggleNote={toggle}/>;
  }
  try{
   act(()=>root.render(<Harness/>));
   act(()=>container.querySelector('[aria-label="Select E"]').click());
   act(()=>container.querySelector('[aria-label="Octave 4 step 1"]').click());
   expect(toggle).toHaveBeenLastCalledWith(0,64,1);
   act(()=>container.querySelector('[aria-label="Toggle off-scale notes"]').click());
   act(()=>container.querySelector('[aria-label="Select E♭"]').click());
   act(()=>container.querySelector('[aria-label="Octave 3 step 1"]').click());
   expect(toggle).toHaveBeenLastCalledWith(0,51,1);
  }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('distinguishes octave brightness and filters displayed notes without changing them',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const project={key,stepsPerBar:16,chords:[{bar:0,name:'C',pitchClasses:[0,4,7]}]};
  const pattern={length:16,steps:[{n:[{d:-7}]},{n:[{d:0}]},{n:[{d:7}]},{n:[{d:-7,len:2}]},...Array(12).fill(null)]};
  const render=filter=>act(()=>root.render(<ProgressionGrid project={project} part={{startBar:0,bars:1}} pattern={pattern} colour="#999999" offset={0} onOffset={()=>{}} view="scale" octave={4} octaveFilter={filter}/>));
  try{
   render(null);
   expect(container.querySelector('[aria-label="C step 1"]').style.getPropertyValue('--voice')).toBe('#d13f3f');
   expect(container.querySelector('[aria-label="C step 2"]').style.getPropertyValue('--voice')).toBe('#ff4d4d');
   expect(container.querySelector('[aria-label="C step 3"]').style.getPropertyValue('--voice')).toBe('#ff6d6d');
   render(3);
   expect(container.querySelector('[aria-label="C step 5, held"]').classList.contains('held')).toBe(true);
   expect(container.querySelector('[aria-label="C step 3"]').getAttribute('aria-pressed')).toBe('false');
   render(null);
   expect(container.querySelector('[aria-label="C step 3"]').getAttribute('aria-pressed')).toBe('true');
  }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
 it('shows several bars at coarse resolution and reaches the last page',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const project={key,stepsPerBar:28,chords:[{bar:0,name:'C'}]};
  function Harness(){
   const [offset,setOffset]=React.useState(0);
   return <ProgressionGrid project={project} part={{startBar:0,bars:3}} pattern={{length:84,steps:Array(84).fill(null)}} colour="#999" offset={offset} onOffset={setOffset} view="scale" octave={4} stepSize={4}/>;
  }
  try{
   act(()=>root.render(<Harness/>));
   expect([...container.querySelectorAll('.bar-tick small')].map(x=>x.textContent)).toEqual(['1','2','3']);
   const knob=container.querySelector('[aria-label="Page"]');
   for(let i=0;i<5;i++)act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
   expect(knob.getAttribute('aria-valuetext')).toBe('6–21');
   expect(container.querySelector('[aria-label="C step 21"]')).toBeTruthy();
  }finally{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
 });
});
