import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import RoutingMatrix from './DiyMatrix';
import SynthShell from '../ui/SynthShell';
import {EnsemblePanelContext} from '../ui/EmbeddedShell';
import {POLY,FM} from './patches';
import {MOD_SOURCES,MOD_TARGETS} from '../../synth-lab/patch';
import {FM_MOD_SOURCES,FM_MOD_TARGETS} from '../../synth-lab/fmPatch';

let container,root,latest;
function Harness({bound,fm}){
 const schema=fm?FM:POLY,[values,setValues]=useState(()=>schema.params.defaultValues());latest=values;
 return <EnsemblePanelContext.Provider value={{bound,values,onChange:setValues}}><SynthShell synth={{...schema,id:fm?'fm':'poly'}} picker={()=>null}>
  {api=><RoutingMatrix fm={fm} values={api.values} specs={schema.params.BY_KEY} prefix="layers.0." sources={fm?FM_MOD_SOURCES:MOD_SOURCES} targets={fm?FM_MOD_TARGETS:MOD_TARGETS} change={api.change}/>}
 </SynthShell></EnsemblePanelContext.Provider>;
}
const cell=name=>container.querySelector(`[aria-label="${name}"]`);
const key=(el,key)=>act(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
const pointer=(el,type,y)=>act(()=>{const e=new MouseEvent(type,{button:0,bubbles:true,clientY:y});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

for(const bound of [true,false])for(const fm of [false,true])it(`retains source, target and depth when creating/removing a route in ${bound?'bound':'embedded'} ${fm?'FM':'Poly'}`,()=>{
 act(()=>root.render(<Harness bound={bound} fm={fm}/>));const pre=fm?'global.':'layers.0.',name=fm?'LFO 2 to Pitch':'LFO 1 to Pan';
 key(cell(name),'ArrowUp');expect(latest[pre+'modSource1']).toBe(fm?2:1);expect(latest[pre+'modTarget1']).toBe(fm?1:5);expect(latest[pre+'modDepth1']).toBeGreaterThan(0);expect(container.textContent).toContain('1 of 4 used');
 key(cell(name),'Delete');expect(latest[pre+'modSource1']).toBe(0);expect(latest[pre+'modTarget1']).toBe(0);expect(latest[pre+'modDepth1']).toBe(0);expect(container.textContent).toContain('0 of 4 used');
});
it('retains a fast single-move drag and allows creating a different cell immediately afterwards',()=>{
 act(()=>root.render(<Harness bound fm={false}/>));let el=cell('LFO 1 to Pan');pointer(el,'pointerdown',100);pointer(el,'pointermove',60);pointer(el,'pointerup',60);
 expect(latest['layers.0.modSource1']).toBe(1);expect(latest['layers.0.modTarget1']).toBe(5);expect(latest['layers.0.modDepth1']).toBeGreaterThan(.4);
 el=cell('LFO 2 to PW');pointer(el,'pointerdown',100);pointer(el,'pointermove',65);pointer(el,'pointerup',65);
 expect(latest['layers.0.modSource2']).toBe(2);expect(latest['layers.0.modTarget2']).toBe(3);expect(latest['layers.0.modDepth2']).toBeGreaterThan(.4);expect(container.textContent).toContain('2 of 4 used');
});
