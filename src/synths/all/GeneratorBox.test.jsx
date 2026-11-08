import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {defaultSettings,sanitizeSettings} from '../../app/settings';
import GeneratorBox from './GeneratorBox';
import {CHAPTERS,RULES} from '../../app/rulebook/model';
import {GENERATOR_VIEW_KEY} from './workbenchView';

let root,container,settings,ruleEdit;
beforeEach(()=>{
 localStorage.clear();globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);ruleEdit=vi.fn();
 function Device(){const [s,set]=useState(defaultSettings()),[book,setBook]=useState({rules:{},baseline:{}});settings=s;
  return <GeneratorBox settings={s} onSettings={patch=>set(old=>sanitizeSettings(patch,old))} book={book} onRule={(id,choice)=>{ruleEdit(id,choice);setBook(b=>({...b,rules:{...b.rules,[id]:choice}}));}} seq={{...s,generated:false}} onSeq={()=>{}}/>;
 }
 act(()=>root.render(<Device/>));
});
afterEach(()=>{act(()=>root.unmount());container.remove();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const click=name=>act(()=>[...container.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')??b.textContent.trim())===name).click());
const bank=name=>{if(!container.querySelector('.gb-sections [aria-label=Control][aria-pressed=true]'))click('Control');for(let i=0;i<4&&container.querySelector('.gb-title>span').textContent!==name;i++)click('Control');expect(container.querySelector('.gb-title>span').textContent).toBe(name);};
const press=(label,key)=>act(()=>container.querySelector(`.gb-knobs [aria-label="${label}"]`).dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
const select=(label,value)=>{const pages=CHAPTERS.filter(c=>RULES.some(r=>r.chapter===c.id));const items=label==='Rulebook page'?pages:RULES.filter(r=>r.chapter===JSON.parse(localStorage.getItem(GENERATOR_VIEW_KEY)).chapter);press(label,'Home');for(let i=0;i<items.findIndex(x=>x.id===value);i++)press(label,'ArrowRight');act(()=>window.dispatchEvent(new Event('pagehide')));};
const slide=(selector,value)=>act(()=>{const node=container.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});

it('keeps four physical encoders on every page, with unassigned slots visibly inactive',()=>{
 for(const page of ['Scale','Progression','Tempo','Evolution','Wander','Rules','Control']){
  click(page);expect(container.querySelectorAll('.gb-knobs>.gb-knob')).toHaveLength(4);expect(container.querySelectorAll('.gb-knobs [role=slider]')).toHaveLength(4);
 }
 click('Scale');expect(container.querySelector('.gb-knobs>.gb-knob:last-child').classList.contains('inactive')).toBe(true);
 expect(container.querySelector('.gb-knobs [aria-label="Unused control 4"]').getAttribute('aria-disabled')).toBe('true');
});
it('uses the fixed encoders for evolution, bounded wander and the shared feel/macros settings',()=>{
 click('Evolution');press('Home pull','End');expect(settings.drift.homePull).toBe(1);
 click('Wander');press('Wander pitch','ArrowRight');expect(settings.wander.pitch).toBe(6);
 act(()=>container.querySelector('[aria-label="Edit Pan minimum"]').click());press('Pan minimum','End');expect(settings.wander.pan).toEqual({min:1,max:1});
 click('Control');slide('.gb-feel-faders [aria-label="Swing"]',.2);expect(settings.swing).toBe(.2);expect(container.querySelector('.gb-knobs [aria-label="Swing"]').getAttribute('aria-valuetext')).toBe('20%');
 bank('Macros');press('Groove','End');expect(settings.swing).toBe(.4);expect(settings.humanize.timing).toBe(26);
});
it('edits rule permissions and disables an unused fourth encoder for flag-only rules',()=>{
 click('Rules');select('Rulebook page','melodic-composition');select('Rule','note-resolution');
 click('Deny');expect(ruleEdit).toHaveBeenLastCalledWith('note-resolution',{enabled:false});
 expect(container.querySelector('.gb-rule-focus').textContent).toContain('Off');
 expect(container.querySelector('.gb-knobs>.gb-knob:last-child').classList.contains('inactive')).toBe(true);
 click('Allow');expect(ruleEdit).toHaveBeenLastCalledWith('note-resolution',{enabled:true});
});

it('shows numeric rules as sliders synchronized with the fourth knob',()=>{
 click('Rules');select('Rulebook page','melody');
 const slider=container.querySelector('.gb-rule-amount input');expect(slider).toBeTruthy();
 slide('.gb-rule-amount input',slider.max);expect(ruleEdit).toHaveBeenLastCalledWith(expect.any(String),{enabled:true,value:+slider.max});
 expect(container.querySelector('.gb-knobs>.gb-knob:last-child [role=slider]').getAttribute('aria-valuenow')).toBe('1');
 press(slider.getAttribute('aria-label'),'Home');expect(+slider.value).toBe(+slider.min);
 click('Deny');expect(slider.disabled).toBe(true);
});
it('restores the last generator page and bank after remounting',()=>{
 click('Control');bank('Band');act(()=>window.dispatchEvent(new Event('pagehide')));
 act(()=>root.unmount());root=createRoot(container);act(()=>root.render(<GeneratorBox settings={defaultSettings()} onSettings={()=>{}} onRule={()=>{}}/>));
 expect(container.querySelector('.gb-sections [aria-pressed=true]').getAttribute('aria-label')).toBe('Control');
 expect(container.querySelector('.gb-title>span').textContent).toBe('Band');
 expect(container.querySelectorAll('.gb-stacks>.gb-stack')).toHaveLength(7);
 expect(container.querySelectorAll('.gb-character input')).toHaveLength(0);
 expect(container.querySelectorAll('select')).toHaveLength(0);
});
it('keeps pill stacks and knobs in sync for band and macros',()=>{
 click('Control');bank('Band');
 act(()=>container.querySelector('[aria-label=Root] button:last-child').click());expect(settings.padRoot).toBe('never');
 expect(container.querySelector('.gb-knobs [aria-label=Root]').getAttribute('aria-valuetext')).toBe('None');
 press('Root','Home');expect(container.querySelector('[aria-label=Root] button:first-of-type').getAttribute('aria-pressed')).toBe('true');
 bank('Macros');act(()=>container.querySelector('[aria-label=Groove] button:last-child').click());expect(settings.swing).toBe(.4);
 press('Groove','Home');expect(settings.swing).toBe(0);expect(container.querySelector('[aria-label=Groove] button:first-of-type').getAttribute('aria-pressed')).toBe('true');
});

it('cycles Control and Evolution banks with their section buttons and preserves settings',()=>{
 const before=structuredClone(settings);click('Control');
 for(const name of ['Feel','Band','Macros','Character','Feel']){expect(container.querySelector('.gb-title>span').textContent).toBe(name);expect(container.querySelectorAll('.gb-bank-meter>i')).toHaveLength(4);expect(container.querySelectorAll('.gb-bank-meter>.lit')).toHaveLength(1);click('Control');}
 click('Evolution');for(const name of ['Changes','Keys','Modes','Changes']){expect(container.querySelector('.gb-title>span').textContent).toBe(name);expect(container.querySelectorAll('.gb-bank-meter>i')).toHaveLength(3);click('Evolution');}
 expect(settings).toEqual(before);expect(container.querySelectorAll('.gb-subtabs')).toHaveLength(0);
});
it('isolates Intensity, Mood and the diamond on Character and bounds both axes',()=>{
 bank('Feel');expect(container.querySelector('.gen-feel')).toBeNull();expect(container.querySelector('[aria-label=Intensity]')).toBeNull();
 bank('Character');expect(container.querySelectorAll('.gb-character input')).toHaveLength(2);expect(container.querySelector('.gen-feel')).toBeTruthy();
 press('Intensity','End');expect(settings.push.level).toBe(1);expect(container.querySelector('input[aria-label=Intensity]').value).toBe('1');
 press('Mood','Home');expect(settings.mood.level).toBe(-1);
 press('Busy','End');expect(settings.feel).toEqual({busy:1,bright:0});press('Bright','End');expect(settings.feel).toEqual({busy:0,bright:1});
 bank('Band');expect(container.querySelector('.gen-feel')).toBeNull();expect(container.querySelector('input[aria-label=Mood]')).toBeNull();
});
it('connects numbered on-screen groups to the same four knob slots',()=>{
 expect([...container.querySelectorAll('.gb-scale-row')].map(e=>e.dataset.knob)).toEqual(['1','2','3']);
 expect(container.querySelectorAll('.gb-chips li[aria-current=true]')).toHaveLength(3);
 bank('Macros');expect([...container.querySelectorAll('.gb-stack')].map(e=>e.dataset.knob)).toEqual(['1','2','3','4']);
 expect([...container.querySelectorAll('.gb-knob')].map(e=>e.dataset.knob)).toEqual(['1','2','3','4']);
});
