import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import useModulation from './useModulation';
import {cleanMod} from './mod';

const params={BY_KEY:{cut:{id:7,min:0,max:100,default:50,curve:'lin'}}};
let root,element,time,engine,sets,clock;
let outs;
function Harness({running,mod}){useModulation({live:()=>engine,clock:()=>clock,mod,params,values:()=>({cut:40}),running,onOut:o=>outs.push(o)});return null;}
beforeEach(()=>{
 vi.useFakeTimers();globalThis.IS_REACT_ACT_ENVIRONMENT=true;time=0;sets=[];outs=[];clock={at:()=>({beat:0.1})};
 engine={context:{get currentTime(){return time;}},setParams:p=>sets.push(p)};
 element=document.createElement('div');document.body.append(element);root=createRoot(element);
});
afterEach(()=>{act(()=>root.unmount());element.remove();vi.useRealTimers();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

describe('useModulation',()=>{
 const mod=cleanMod({lanes:[{steps:[1,0],div:1}],assigns:{cut:{source:'lane1',amount:1}}});
 it('sends the knob value plus the source while running, and puts the knob back when it stops',()=>{
  act(()=>root.render(<Harness running mod={mod}/>));
  time=0.1;act(()=>{vi.advanceTimersByTime(20);});
  expect(sets.at(-1)).toEqual([[7,90]]);        // lane step 1 (full): 40 + 0.5 * 100
  expect(outs.at(-1)).toEqual({cut:90});         // and the same value for whatever reads the knob in JavaScript
  act(()=>root.render(<Harness running={false} mod={mod}/>));
  expect(sets.at(-1)).toEqual([[7,40]]);
  expect(outs.at(-1)).toEqual({});
 });
 it('sends nothing without assignments',()=>{
  act(()=>root.render(<Harness running mod={cleanMod({})}/>));
  time=0.1;act(()=>{vi.advanceTimersByTime(60);});
  expect(sets).toEqual([]);
 });
});
