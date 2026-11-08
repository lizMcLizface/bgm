import React from 'react';
import FeelPad from '../../app/FeelPad';
import IntensityFader from '../../app/IntensityFader';
import MoodFader from '../../app/MoodFader';
import {FEEL_SLIDERS,CHOICE_GROUPS,MELODY_PLAN,MELODY_STYLE,MELODY_PARTS,LEVELS,STACKS,choiceAt,choicePatch,stackLevel,stackPatch,readValue,sliderPatch} from '../../app/quickControls';
import {songPartCan} from '../../app/composition/songParts';
import {WANDER_LIMITS,WANDER_MODES,WANDER_ROLES} from '../../app/engine/wander';
import {DRIFT_MODES,DEFAULT_DRIFT} from '../../app/conductor';
import {SCALE_FAMILIES,TONIC_NAMES} from '../../app/theory';
import {CHAPTERS,RULES,compileRules,ruleState} from '../../app/rulebook/model';
import {baseSettings} from '../../app/rulebook/session';
import {EVOLUTION_PAGES} from './workbenchView';
import '../../app/generative.css';

const clamp=v=>Math.max(0,Math.min(1,v));
const options=o=>Object.entries(o).map(([value,label])=>({value,label}));
const percent=v=>`${Math.round(v*100)}%`;
const amount=(v,unit='%',step=.01)=>unit==='%'?percent(v):`${Number(v.toFixed(step>=1?0:2))}${unit}`;
export const numberKnob=(label,value,change,{min=0,max=1,step=.01,unit='%',home=value,help,disabled=false}={})=>({
 label,display:amount(value,unit,step),position:clamp((value-min)/(max-min)),step:step/(max-min),disabled,help,
 onPosition:p=>change(Number((min+Math.round(clamp(p)*(max-min)/step)*step).toFixed(6))),onReset:()=>change(home),
});
export const choiceKnob=(label,items,value,change,help)=>{
 const index=Math.max(0,items.findIndex(item=>item.value===value));
 return {label,display:items[index]?.label??'—',position:items.length>1?index/(items.length-1):0,step:1/Math.max(1,items.length-1),disabled:items.length<2,help,
  onPosition:p=>change(items[Math.round(clamp(p)*(items.length-1))].value),onReset:()=>change(items[0].value)};
};
const Toggle=({label,on,onClick,disabled=false})=><button type="button" className="gb-pill" aria-pressed={on} disabled={disabled} onClick={onClick}>{label}</button>;
const PillStack=({label,items,value,onChange,selected=false,slot})=><div className={'gb-stack'+(selected?' selected':'')} role="group" aria-label={label} data-knob={slot}><b>{slot&&<em>{slot}</em>}{label}</b>{items.map(item=><Toggle key={item.value} label={item.label} on={item.value===value} onClick={()=>onChange(item.value)}/>)}</div>;
const Readouts=({items,selected,onSelect})=><div className="gb-readouts">{items.map(item=><button type="button" key={item.id} className={item.id===selected?'selected':''} aria-label={`Edit ${item.label}`} aria-pressed={item.id===selected} onClick={()=>onSelect(item.id)}><span data-knob={item.id===selected?2:undefined}>{item.label}</span><b data-knob={item.id===selected?3:undefined}>{item.display}</b>{item.level!==undefined&&<i style={{'--level':`${clamp(item.level)*100}%`}}/>}</button>)}</div>;
const VOICES={lead:'Lead',counter:'Lead 2',rhythm:'Rhythm',pad:'Pad',bass:'Bass',perc:'Drums'};

// Screen selections assign the same four physical encoders on every page.
// Composition adapters are shared with QuickPanel and the full rulebook.
export default function useGeneratorControls(section,settings,onSettings,book,onRule,view,updateView){
 const {controlPage,feel,band,evolution,evolutionPage,wander,voice,chapter,ruleId}=view;
 const select=key=>value=>updateView({[key]:value});
 const setFeel=select('feel'),setBand=select('band'),setEvolution=select('evolution'),setWander=select('wander'),setVoice=select('voice'),setRuleId=select('ruleId');
 const setChapter=id=>updateView({chapter:id,ruleId:null});
 if(!settings)return null;
 const set=(key,value)=>onSettings({[key]:value});
 if(section==='control'){
  const axis=(key,v)=>{const other=key==='busy'?'bright':'busy',limit=1-Math.abs(v);set('feel',{...settings.feel,[key]:v,[other]:Math.max(-limit,Math.min(limit,settings.feel[other]))});};
  if(controlPage==='character')return {title:'Character',help:'Intensity shapes energy; Mood shapes harmony. The diamond combines Busy and Bright within the scene’s range.',screen:<div className="gb-character"><div className="gb-character-faders"><div data-knob="1"><h4><em>1</em>Intensity</h4><IntensityFader push={settings.push} now={settings.push.level} onChange={v=>set('push',v)}/><p>Calm → overdrive</p></div><div data-knob="2"><h4><em>2</em>Mood</h4><MoodFader mood={settings.mood} now={settings.mood.level} onChange={v=>set('mood',v)}/><p>Suspended → lush</p></div></div><div className="gb-character-pad"><FeelPad compact feel={settings.feel} onChange={v=>set('feel',v)}/><div className="gb-axis-values"><span data-knob="3">3 · Busy {percent(settings.feel.busy)}</span><span data-knob="4">4 · Bright {percent(settings.feel.bright)}</span></div></div></div>,knobs:[
   numberKnob('Intensity',settings.push.level,v=>set('push',{...settings.push,level:v}),{min:-1,step:.05,home:0,disabled:settings.push.program.mode!=='off',help:settings.push.program.mode!=='off'?'The intensity program controls this value.':'Calm to overdrive; music eases toward this intensity.'}),
   numberKnob('Mood',settings.mood.level,v=>set('mood',{...settings.mood,level:v}),{min:-1,step:.05,home:0,help:'Suspended and sparse to lush, extended chords.'}),
   numberKnob('Busy',settings.feel.busy,v=>axis('busy',v),{min:-1,step:.05,home:0,help:'Calmer to busier, relative to the scene.'}),
   numberKnob('Bright',settings.feel.bright,v=>axis('bright',v),{min:-1,step:.05,home:0,help:'Darker to brighter, relative to the scene.'}),
  ]};
  if(controlPage==='feel'){
   const item=FEEL_SLIDERS.find(s=>s.id===feel);
   return {title:'Feel',help:'Press Control again for Band, Macros and Character. Select a fader with knob 1; knob 2 edits its value.',screen:<div className="gb-feel-layout"><div className="gb-feel-faders">{FEEL_SLIDERS.map(s=><label key={s.id} data-knob="2" className={s.id===feel?'selected':''} onPointerEnter={()=>setFeel(s.id)} onFocusCapture={()=>setFeel(s.id)}><output>{amount(readValue(settings,s.path),s.max>=20?' ms':'%',s.step)}</output><input type="range" aria-label={s.label} aria-orientation="vertical" min={s.min??0} max={s.max} step={s.step} value={readValue(settings,s.path)} onChange={e=>onSettings(sliderPatch(settings,s.path,+e.target.value))}/><span>{s.label}</span></label>)}</div><aside className="gb-feel-help"><h4 data-knob="1">1 · {item.label}</h4><p>{item.title}</p><output data-knob="2">2 · {amount(readValue(settings,item.path),item.max>=20?' ms':'%',item.step)}</output></aside></div>,knobs:[
    choiceKnob('Feel target',FEEL_SLIDERS.map(s=>({value:s.id,label:s.label})),feel,setFeel,'Choose the playing detail highlighted on screen.'),
    numberKnob(item.label,readValue(settings,item.path),v=>onSettings(sliderPatch(settings,item.path,v)),{...item,unit:item.max>=20?' ms':'%',help:item.title}),null,null,
   ]};
  }
  if(controlPage==='macros')return {title:'Macros',help:'Each numbered, colored stack matches the knob below. Unlit stacks mean a custom combination.',screen:<div className="gb-stacks gb-macro-stacks">{STACKS.map((s,i)=><PillStack key={s.id} slot={i+1} label={s.label} items={LEVELS.map((label,value)=>({label,value}))} value={stackLevel(settings,s)} onChange={v=>onSettings(stackPatch(settings,s,v))}/>)}</div>,knobs:STACKS.map(s=>({...choiceKnob(s.label,LEVELS.map((label,value)=>({label,value})),Math.max(0,stackLevel(settings,s)),v=>onSettings(stackPatch(settings,s,v)),s.title),display:LEVELS[stackLevel(settings,s)]??'Custom',onReset:()=>onSettings(stackPatch(settings,s,s.defaultLevel??0))}))};
  const group=CHOICE_GROUPS.find(g=>g.id===band),current=choiceAt(settings,group);
  const choose=(g,v)=>onSettings({...choicePatch(settings,g,v),...(g===MELODY_STYLE&&settings.melodyPlan==='noodle'?choicePatch(settings,MELODY_PLAN,'same'):{})});
  return {title:'Band',accessory:<div className="gb-band-row"><span>Melody parts</span>{MELODY_PARTS.map(p=><Toggle key={p.id} label={p.label} on={songPartCan(settings,p.id)&&readValue(settings,p.path)!==false} disabled={!songPartCan(settings,p.id)} onClick={()=>onSettings({...sliderPatch(settings,p.path,!readValue(settings,p.path)),...(settings.melodyPlan==='noodle'?choicePatch(settings,MELODY_PLAN,'same'):{})})}/>)}</div>,help:group.title,screen:<div className="gb-stacks gb-band-stacks">{[...CHOICE_GROUPS,MELODY_PLAN,MELODY_STYLE].map(g=><PillStack key={g.id} label={g.label} items={g.choices} value={choiceAt(settings,g)} selected={band===g.id} slot={g===MELODY_PLAN?3:g===MELODY_STYLE?4:band===g.id?2:undefined} onChange={v=>{if(CHOICE_GROUPS.includes(g))setBand(g.id);choose(g,v);}}/>)}</div>,knobs:[choiceKnob('Band target',CHOICE_GROUPS.map(g=>({value:g.id,label:g.label})),band,setBand,'Choose the stack highlighted on screen.'),{...choiceKnob(group.label,group.choices,current,v=>choose(group,v),group.title),display:group.choices.find(c=>c.value===current)?.label??'Custom'},choiceKnob('Melody',MELODY_PLAN.choices,settings.melodyPlan,v=>choose(MELODY_PLAN,v),MELODY_PLAN.title),choiceKnob('Style',MELODY_STYLE.choices,settings.melodyStyle,v=>choose(MELODY_STYLE,v),MELODY_STYLE.title)]};
 }
 if(section==='evolution'){
  const d=settings.drift,change=p=>set('drift',{...d,...p});
  const fields=[...Object.keys(d).filter(k=>/Chance$/.test(k)).map(id=>({id,label:id.replace(/Chance$/,' chance').replace(/([a-z])([A-Z])/g,'$1 $2'),value:d[id]})),{id:'homePull',label:'Home pull',value:d.homePull},{id:'tempoRange',label:'Tempo range',value:d.tempoRange,max:20,step:1,unit:' BPM'}];
  const item=fields.find(f=>f.id===evolution)??fields[0],family=SCALE_FAMILIES.find(f=>f.modes.some(m=>m.id===settings.mode));
  return {title:EVOLUTION_PAGES.find(p=>p.id===evolutionPage).label,help:'Changes shape future progressions. Keys and modes limit the destinations; the home key stays available.',screen:<><div className="gb-song-badges"><span data-knob="1">{DRIFT_MODES[d.mode]}</span><span data-knob="2">{item.label}</span><span data-knob="3">{amount(item.value,item.unit,item.step)}</span><span data-knob="4">{d.pivot?'Prepared':'Direct'}</span></div>{evolutionPage==='changes'?<Readouts items={fields.map(f=>({...f,display:amount(f.value,f.unit,f.step)}))} selected={item.id} onSelect={setEvolution}/>:<div className="gb-pool"><span>{evolutionPage==='keys'?'Allowed keys':'Allowed modes'}</span><div className="gb-option-row">{evolutionPage==='keys'?TONIC_NAMES.map((name,i)=><Toggle key={i} label={name} on={!d.excludedTonics.includes(i)} disabled={settings.tonic===i} onClick={()=>change({excludedTonics:d.excludedTonics.includes(i)?d.excludedTonics.filter(x=>x!==i):[...d.excludedTonics,i]})}/>):family?.modes.map(m=><Toggle key={m.id} label={m.name} on={!d.excludedModes.includes(m.id)} disabled={settings.mode===m.id} onClick={()=>change({excludedModes:d.excludedModes.includes(m.id)?d.excludedModes.filter(x=>x!==m.id):[...d.excludedModes,m.id]})}/>)}</div></div>}</>,knobs:[choiceKnob('Evolution mode',options(DRIFT_MODES),d.mode,v=>change({mode:v}),'Off, centered on home, or wandering.'),choiceKnob('Evolution target',fields.map(f=>({value:f.id,label:f.label})),item.id,setEvolution,'Choose a probability, home pull or tempo range.'),numberKnob(item.label,item.value,v=>change({[item.id]:v}),{...item,home:DEFAULT_DRIFT[item.id],help:item.id==='tempoRange'?'Tempo deviation around home, in BPM.':item.id==='homePull'?'How strongly evolution returns to home.':'Chance of a change at a progression boundary.'}),choiceKnob('Pivot',[{value:false,label:'Direct'},{value:true,label:'Prepared'}],d.pivot,v=>change({pivot:v}),'Prepare a key change with the destination’s dominant chord.')]};
 }
 if(section==='wander'){
  const w=settings.wander,change=p=>set('wander',{...w,...p});
  const fields=[...['period','volume','filter','pitch'].map(id=>({id,label:'Wander '+id,value:w[id],...WANDER_LIMITS[id],unit:id==='period'?' s':id==='pitch'?' cents':id==='filter'?' oct':'%'})),{id:'panMin',label:'Pan minimum',value:w.pan.min,...WANDER_LIMITS.pan,unit:''},{id:'panMax',label:'Pan maximum',value:w.pan.max,...WANDER_LIMITS.pan,unit:''}];
  const item=fields.find(f=>f.id===wander),edit=v=>item.id==='panMin'?change({pan:{min:v,max:Math.max(v,w.pan.max)}}):item.id==='panMax'?change({pan:{min:Math.min(v,w.pan.min),max:v}}):change({[item.id]:v});
  const toggle=r=>change({voices:{...w.voices,[r]:!w.voices[r]}});
  return {title:'Wander',help:'Slow motion of live voices. Select a depth, then turn its knob. Press the Voice display to switch its motion on or off.',screen:<><div className="gb-song-badges"><span data-knob="1">{WANDER_MODES[w.mode]}</span><span data-knob="4">{VOICES[voice]} · {w.voices[voice]?'on':'off'}</span></div><Readouts items={fields.map(f=>({...f,display:amount(f.value,f.unit,f.step)}))} selected={wander} onSelect={setWander}/><div className="gb-voice-row" role="group" aria-label="Voices that wander">{WANDER_ROLES.map(r=><Toggle key={r} label={VOICES[r]} on={w.voices[r]} onClick={()=>{setVoice(r);toggle(r);}}/>)}</div></>,knobs:[choiceKnob('Wander motion',options(WANDER_MODES),w.mode,v=>change({mode:v}),'Smooth waves or a bounded random walk.'),choiceKnob('Wander target',fields.map(f=>({value:f.id,label:f.label})),wander,setWander,'Choose period, depth or the pan limits.'),numberKnob(item.label,item.value,edit,{...item,help:'Live motion range; minimum and maximum pan stay ordered.'}),{...choiceKnob('Voice',WANDER_ROLES.map(r=>({value:r,label:VOICES[r]})),voice,setVoice,'Turn to select a voice. Press the display to enable or disable its motion.'),display:`${VOICES[voice]} · ${w.voices[voice]?'on':'off'}`,onPress:()=>toggle(voice)}]};
 }
 if(section==='rules'){
  const pages=CHAPTERS.filter(c=>RULES.some(r=>r.chapter===c.id)),rules=RULES.filter(r=>r.chapter===chapter),rule=rules.find(r=>r.id===ruleId)??rules[0];
  const saved=book??{rules:{},baseline:{}},compiled=compileRules(baseSettings(settings,saved),saved.rules,saved.inherited),state=ruleState(rule,compiled),choice=saved.rules[rule.id];
  const mode=choice?choice.enabled?'on':'off':'preset',permission=v=>onRule(rule.id,v==='preset'?null:{...choice,enabled:v==='on'});
  let fourth=null;
  if(rule.parameter){const p=rule.parameter;fourth=numberKnob(p.label,choice?.value??state.value,v=>onRule(rule.id,{enabled:true,value:v}),{...p,unit:p.unit==='%'?'%':` ${p.unit??''}`,disabled:choice?.enabled===false,help:rule.description});}
  else if(rule.options&&state.enabled)fourth=choiceKnob('Approach',rule.options.filter(v=>v!==rule.off).map(value=>({value,label:rule.optionLabels?.[value]??String(value)})),state.value,v=>onRule(rule.id,{enabled:true,value:v}),rule.description);
  const p=rule.parameter;
  return {title:'Rules',help:state.reason,screen:<><div className="gb-rule-path"><span data-knob="1">{pages.find(c=>c.id===chapter).title}</span><span>{rules.indexOf(rule)+1} / {rules.length}</span></div><div className="gb-rule-focus"><strong data-knob="2">{rule.title}</strong><span className={state.enabled?'enabled':''}>{state.status} · {state.source}</span></div><p className="gb-rule-description">{rule.description}</p><div className="gb-option-row" role="group" aria-label="Rule permission" data-knob="3">{[['preset','Follow preset'],['on','Allow'],['off','Deny']].map(([id,label])=><Toggle key={id} label={label} on={mode===id} onClick={()=>permission(id)}/>)}</div>{p?<label className="gb-rule-amount" data-knob="4"><span>{p.label}</span><input type="range" aria-label={p.label} min={p.min??0} max={p.max??1} step={p.step??.01} value={choice?.value??state.value} disabled={choice?.enabled===false} onChange={e=>onRule(rule.id,{enabled:true,value:+e.target.value})}/><output>{fourth.display}</output></label>:rule.options&&state.enabled?<div className="gb-option-row gb-rule-options" role="group" aria-label="Approach" data-knob="4">{rule.options.filter(v=>v!==rule.off).map(v=><Toggle key={String(v)} label={rule.optionLabels?.[v]??String(v)} on={state.value===v} onClick={()=>onRule(rule.id,{enabled:true,value:v})}/>)}</div>:null}</>,knobs:[choiceKnob('Rulebook page',pages.map(c=>({value:c.id,label:c.title})),chapter,setChapter,'Browse every rule chapter.'),choiceKnob('Rule',rules.map(r=>({value:r.id,label:r.title})),rule.id,setRuleId,'Choose the rule described on screen.'),choiceKnob('Permission',[{value:'preset',label:'Follow preset'},{value:'on',label:'Allow'},{value:'off',label:'Deny'}],mode,permission,'Follow the scene, explicitly allow, or explicitly deny.'),fourth]};
 }
 return null;
}
