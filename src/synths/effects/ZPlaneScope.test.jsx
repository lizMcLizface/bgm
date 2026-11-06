import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ZPlaneScope from './ZPlaneScope';
import {cleanRack} from './params';
import {ZPLANE_CUSTOM} from './zplaneShapes';

let root,element,latest,latestSet;
function Harness(){
 const [values,setValues]=useState(()=>cleanRack());
 latest=values;latestSet=setValues;
 return <ZPlaneScope values={values} onChange={change=>setValues(v=>({...v,...change}))} faders={null}/>;
}
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();element=document.createElement('div');document.body.append(element);root=createRoot(element);act(()=>root.render(<Harness/>));});
afterEach(()=>{act(()=>root.unmount());element.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

const press=(target,x,y)=>act(()=>{target.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:x,clientY:y}));target.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:x,clientY:y}));});
const display=()=>{const d=element.querySelector('.rack-scope-display');d.getBoundingClientRect=()=>({left:0,top:0,width:300,height:136,right:300,bottom:136});return d;};
const nodesOnDisplay=()=>element.querySelectorAll('[data-handle]').length;

test('the plot has a row for each side, and each Edit button is its own switch that keeps its text', () => {
 expect(element.querySelectorAll('.zp-row')).toHaveLength(2);
 const edits = [...element.querySelectorAll('.zp-edit')], pressed = () => edits.map(b => b.getAttribute('aria-pressed'));
 expect(edits.map(b => b.textContent)).toEqual(['Edit', 'Edit']);
 expect(pressed()).toEqual(['true', 'false']);
 act(() => edits[1].click()); expect(pressed()).toEqual(['true', 'true']); expect(nodesOnDisplay()).toBe(10);
 act(() => edits[0].click()); act(() => edits[1].click()); expect(pressed()).toEqual(['false', 'false']);
 expect(nodesOnDisplay()).toBe(0); // nothing in the way when no one is editing
 expect(edits.map(b => b.textContent)).toEqual(['Edit', 'Edit']);
 expect(element.querySelector('.rack-scope-name')).toBeNull();
});

test('the morphed curve takes a colour between the two shapes colours, by the morph', () => {
 const blend = () => element.querySelector('.rack-scope').style.getPropertyValue('--zp-m');
 expect(blend()).toMatch(/var\(--zp-a\) 100%.*var\(--zp-b\) 0%/);
 act(() => { latestSet({ ...latest, 'zplane.morph': 0.25 }); });
 expect(blend()).toMatch(/var\(--zp-a\) 75%.*var\(--zp-b\) 25%/);
});

test('two quick presses on the plot put in a node, and two on a node take it out',()=>{
 const before=nodesOnDisplay();   // Ah: five formants
 expect(before).toBe(5);
 const d=display();
 press(d,150,100);press(d,151,100);
 expect(nodesOnDisplay()).toBe(before+1);
 expect(latest['zplane.a']).toBe(ZPLANE_CUSTOM);expect(latest['zplane.can']).toBe(before+1);
 const node=element.querySelector('[data-handle="0"]');
 press(node,10,10);press(node,10,10);
 expect(nodesOnDisplay()).toBe(before);expect(latest['zplane.can']).toBe(before);
 // one press on its own does nothing, and neither do two far apart in time
 press(d,80,60);expect(nodesOnDisplay()).toBe(before);
});
