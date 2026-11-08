import {useEffect,useRef,useState} from 'react';
import {load,save} from '../storage';
import {useSaved} from '../useSaved';
import {SECTIONS} from './generatorBoxModel';
import {FEEL_SLIDERS,CHOICE_GROUPS} from '../../app/quickControls';
import {CHAPTERS,RULES} from '../../app/rulebook/model';
import {DEFAULT_DRIFT} from '../../app/conductor';
import {WANDER_ROLES} from '../../app/engine/wander';

export const GENERATOR_VIEW_KEY='synths:all:generator-view';
export const VISIBILITY_KEY='synths:all:visibility';
export const CONTROL_PAGES=[{id:'feel',label:'Feel'},{id:'band',label:'Band'},{id:'macros',label:'Macros'},{id:'character',label:'Character'}];
export const EVOLUTION_PAGES=[{id:'changes',label:'Changes'},{id:'keys',label:'Keys'},{id:'modes',label:'Modes'}];
const choice=(value,items,fallback)=>items.includes(value)?value:fallback;
export function cleanGeneratorView(value={}){
 value=value&&typeof value==='object'?value:{};
 const chapter=choice(value.chapter,CHAPTERS.map(c=>c.id),'melody');
 return {section:choice(value.section,SECTIONS.map(s=>s.id),'scale'),controlPage:choice(value.controlPage,CONTROL_PAGES.map(p=>p.id),'feel'),feel:choice(value.feel,FEEL_SLIDERS.map(s=>s.id),'swing'),band:choice(value.band,CHOICE_GROUPS.map(g=>g.id),'root'),evolution:choice(value.evolution,[...Object.keys(DEFAULT_DRIFT).filter(k=>/Chance$/.test(k)),'homePull','tempoRange'],'homePull'),evolutionPage:choice(value.evolutionPage,EVOLUTION_PAGES.map(p=>p.id),'changes'),wander:choice(value.wander,['period','volume','filter','pitch','panMin','panMax'],'pitch'),voice:choice(value.voice,WANDER_ROLES,'lead'),chapter,ruleId:RULES.some(r=>r.id===value.ruleId&&r.chapter===chapter)?value.ruleId:null};
}
export function useGeneratorView(){
 const [view,setView]=useState(()=>cleanGeneratorView(load(GENERATOR_VIEW_KEY,{})));
 const latest=useRef(view);latest.current=view;
 useEffect(()=>()=>save(GENERATOR_VIEW_KEY,latest.current),[]);
 useSaved(GENERATOR_VIEW_KEY,view);
 return [view,patch=>setView(old=>cleanGeneratorView({...old,...patch}))];
}
export function cleanVisibility(value={}){
 value=value&&typeof value==='object'?value:{};
 const roles=['lead','counter','rhythm','pad','bass','perc'];
 const wins=Object.fromEntries(Object.entries(value.wins??{}).filter(([id,on])=>on===true&&roles.some(r=>id==='synth:'+r||id==='fx:'+r||r!=='perc'&&id==='tuning:'+r)));
 return {panels:{generator:value.panels?.generator===true,ambience:value.panels?.ambience===true},wins,scope:value.scope===true,setup:value.setup===true,sequenceScale:value.sequenceScale===true};
}
