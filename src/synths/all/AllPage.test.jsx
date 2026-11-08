import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeKey } from '../../seq/harmony';
import {sceneSettings} from '../../app/scenes';
import {sanitizeSettings} from '../../app/settings';
import {METERS} from '../../app/meter';

// the desk the page sits on measures itself with a ResizeObserver, which jsdom does not have
globalThis.ResizeObserver??=class{observe(){}unobserve(){}disconnect(){}};
window.matchMedia??=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});

const mocks = vi.hoisted(() => ({ scheduler: null, capture: vi.fn(), hosts: [], failScene: false, continuousRole:'lead' }));
vi.mock('../ui/Scope',()=>({default:({audio})=><div aria-label="Oscilloscope and spectrum" data-audio={audio}/>}));
vi.mock('../../seq/scheduler', () => ({
 createScheduler: options => {
  mocks.scheduler = { options, stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), scope:'pattern', position:{pattern:0,step:4,wrapped:false} };
  mocks.scheduler.start=vi.fn((_delay,scope,position)=>{mocks.scheduler.scope=scope;mocks.scheduler.position=position?{...position,wrapped:false}:{pattern:options.bank().current,step:4,wrapped:false};});
  mocks.scheduler.reposition=vi.fn((position,scope)=>{mocks.scheduler.scope=scope;mocks.scheduler.position={...position,wrapped:false};});
  return mocks.scheduler;
 },
}));
vi.mock('./host', () => {
 const SEQUENCERS = [{role:'lead',label:'Lead',short:'LD'},{role:'counter',label:'Second lead',short:'2L'},{role:'rhythm',label:'Rhythm',short:'RH'},{role:'pad',label:'Pad',short:'PD'},{role:'bass',label:'Bass',short:'BS'},{role:'perc',label:'Drums',short:'DR'}];
 return {
  SEQUENCERS, synthChoices: () => [{id:'calmbgm',name:'calmbgm'}], patchesOf: () => [], isNative: () => false, synthForPreset: () => null,
  drumChoices:()=>[{id:'scene',name:'Scene kits'},{id:'kit',name:'Basic kits'},{id:'tr808',name:'808'}],drumPatches:id=>id==='kit'?[{id:'felt',name:'Felt'},{id:'hand',name:'Hand percussion'}]:id==='tr808'?[{name:'Classic'},{name:'Room'}]:[{name:'Rainy café'}],
  sceneDrumPatch:name=>name,
  createHost: (scene,options={}) => {
   const host={
   scene,options,
   editSettings:vi.fn(patch=>{host.g.settings=sanitizeSettings(patch,host.g.settings);}),
   settings:{seed:options.seed??1}, loaded:{}, context:{currentTime:0}, g:{settings:options.settings??sceneSettings(scene,options.seed??1),set(key,value){this.settings[key]=value;},AC:{outputLatency:0},roles:{},planner:()=>({settings:{meter:'4/4',bpm:90},meter:{units:4},plan:new Map(),planBar(bar){this.plan.set(bar,{bar,music:{tonic:0,mode:'Major-1',cycleStart:bar},nextMusic:{cycleStart:bar+1},chord:{name:'C',pitchClasses:[0,4,7]},events:[{role:mocks.continuousRole,midi:60,beat:0,length:1,velocity:.8}]});}})},
   wake:async()=>{}, applySceneVoices:async()=>{if(mocks.failScene)throw Error('voice loading failed');}, applyFrontPageLink:async()=>{}, setupMixer:async()=>{}, setSound:async(role,sound)=>{const entry={...sound,name:sound.name??(sound.synth==='tr808'?'Classic':'')};host.loaded[role]=entry;return entry;}, soundOf:()=>null, setTempo:()=>{}, rackValues:()=>null, dispose:vi.fn(), note:()=>{},drum:vi.fn(),
   snapshotSounds:()=>Object.fromEntries(SEQUENCERS.map(({role})=>[role,{selection:host.loaded[role]??{synth:role==='perc'?'scene':'calmbgm',name:scene.name},rack:{},...(role==='perc'?{kit:{},mix:{muted:[],solo:[]}}:{})}])),
   restoreSounds:async(saved)=>{host.loaded=Object.fromEntries(Object.entries(saved).map(([role,entry])=>[role,entry.selection]));},
   openMonitor:async()=>({dispose:vi.fn()}),
   capture:(options)=>{mocks.capture(options);return {
    bars:2,stepsPerBar:16,bpm:90,key:makeKey(),chords:[{bar:0,name:'C',pitchClasses:[0,4,7],scalePcs:[0,2,4,5,7,9,11]},{bar:1,name:'G',pitchClasses:[7,11,2],scalePcs:[0,2,4,5,7,9,11]}],
    progressions:[{startBar:0,bars:1},{startBar:1,bars:1}],
    patterns:{lead:{mode:'note',follow:'scale',length:32,steps:[{n:[{d:0}]},...Array(15).fill(null),{n:[{d:4}]},...Array(15).fill(null)]},pad:{mode:'poly',follow:'scale',length:32,steps:[...Array(8).fill(null),{n:[{d:0,chordSource:{group:'pad:0',root:0,style:'sustain'}},{d:2,chordSource:{group:'pad:0',root:0,style:'sustain'}},{d:4,chordSource:{group:'pad:0',root:0,style:'sustain'}}],len:4},...Array(23).fill(null)]},perc:{mode:'drums',length:32,steps:[{hits:[{drum:0,velocity:.8,duration:1}]},...Array(31).fill(null)]}},
   };},
  };mocks.hosts.push(host);return host;},
 };
});
import AllPage,{defaultSequencer} from './AllPage';

let root, container;
const button = name => [...container.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') === name || x.textContent.trim() === name));
beforeEach(async () => {
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 localStorage.clear();
 window.history.replaceState(null,'','/');
 mocks.capture.mockClear();
 mocks.hosts=[];mocks.failScene=false;mocks.continuousRole='lead';
 container = document.createElement('div'); document.body.append(container);
 root = createRoot(container);
 await act(async () => root.render(<AllPage/>));
 const mode=container.querySelector('[aria-label="Generator mode"]');
 await act(async()=>{mode.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));});
 const resolution=container.querySelector('[aria-label="Resolution"]');
 act(()=>resolution.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 act(()=>resolution.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 mocks.scheduler.stop.mockClear();
});

test('ribbon buttons hide and restore independent panels without resetting their controls',()=>{
 const generator=container.querySelector('[aria-controls="all-panel-generator"]'),ambience=container.querySelector('[aria-controls="all-panel-ambience"]');
 const generatorPanel=container.querySelector('#all-panel-generator'),ambiencePanel=container.querySelector('#all-panel-ambience');
 expect(generator.getAttribute('aria-expanded')).toBe('false');
 expect(ambience.getAttribute('aria-expanded')).toBe('false');
 act(()=>{generator.click();ambience.click();});
 act(()=>ambiencePanel.querySelector('.amb-run').click());
 act(()=>{generator.click();ambience.click();});
 expect(generator.getAttribute('aria-expanded')).toBe('false');
 expect(generatorPanel.getAttribute('aria-hidden')).toBe('true');
 expect(ambiencePanel.getAttribute('aria-hidden')).toBe('true');
 act(()=>ambience.click());
 expect(ambiencePanel.getAttribute('aria-hidden')).toBe('false');
 expect(ambiencePanel.querySelector('.amb-run').textContent).toBe('RUNNING');
 expect(generatorPanel.getAttribute('aria-hidden')).toBe('true');
 act(()=>generator.click());
 expect(generatorPanel.getAttribute('aria-hidden')).toBe('false');
});

test('generator, mixer and ambience edits survive a finite-song page reload',async()=>{
 const press=(node,key)=>act(()=>node.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
 act(()=>container.querySelector('[aria-controls="all-panel-generator"]').click());
 act(()=>button('Evolution').click());press(container.querySelector('.gb-knobs [aria-label="Home pull"]'),'End');
 expect(mocks.hosts.at(-1).g.settings.drift.homePull).toBe(1);
 act(()=>button('Wander').click());press(container.querySelector('.gb-knobs [aria-label="Wander pitch"]'),'ArrowRight');
 expect(mocks.hosts.at(-1).g.settings.wander.pitch).toBe(6);
 act(()=>container.querySelector('.gb-sections button:last-child').click());
 const mixInput=container.querySelector('.gb-knobs [aria-label="Swing"]');
 expect(mixInput).toBeTruthy();
 press(mixInput,'Home');
 expect(mocks.hosts.at(-1).editSettings).toHaveBeenLastCalledWith({swing:0});
 press(container.querySelector('[aria-label="Mixing desk"] [aria-label="Lead level"]'),'ArrowDown');
 const rain=+container.querySelector('[aria-label="Rain level"]').getAttribute('aria-valuenow')-.02;
 press(container.querySelector('[aria-label="Rain level"]'),'ArrowDown');
 act(()=>window.dispatchEvent(new Event('pagehide')));
 const saved=JSON.parse(localStorage.getItem('synths:all:state'));
 expect(saved.desk.strips.lead.vol).toBe(.73);
 expect(saved.settings.drift.homePull).toBe(1);expect(saved.ambience.sources.rain.level).toBeCloseTo(rain);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<AllPage/>));
 expect(mocks.hosts.at(-1).options.settings.drift.homePull).toBe(1);
 expect(container.querySelector('[aria-label="Lead level"]').getAttribute('aria-valuenow')).toBe('0.73');
 expect(+container.querySelector('[aria-label="Rain level"]').getAttribute('aria-valuenow')).toBeCloseTo(rain);
});

test('scope starts closed and becomes active when song playback wakes audio',async()=>{
 expect(container.querySelector('[aria-label="Oscilloscope and spectrum"]')).toBeNull();
 await act(async()=>button('Scope').click());
 expect(container.querySelector('[aria-label="Oscilloscope and spectrum"]').dataset.audio).toBe('off');
 await act(async()=>button('▶Play').click());
 expect(container.querySelector('[aria-label="Oscilloscope and spectrum"]').dataset.audio).toBe('on');
});
test('scope starts closed even when it was left open on another synth page',async()=>{
 act(()=>root.unmount());
 localStorage.setItem('synths:scope:open',JSON.stringify(true));
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(button('Scope').getAttribute('aria-pressed')).toBe('false');
 expect(container.querySelector('[aria-label="Oscilloscope and spectrum"]')).toBeNull();
});

test('scene selector and generator preset knob load the same scene and restore the scene song',async()=>{
 const scene=container.querySelector('.bar-scene select'),knob=container.querySelector('[aria-label="Scene preset"]');
 act(()=>container.querySelector('[aria-label="Mixing desk"] button[title^="Lead:"]').click());
 const before=scene.value,next=[...scene.options].find(o=>o.value!==before).value;
 await act(async()=>{scene.value=next;scene.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(scene.value).toBe(next);
 expect(container.querySelector('[aria-label="Channel"]').getAttribute('aria-valuetext')).toBe('Pad');
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Pad');
 expect(knob.getAttribute('aria-valuetext')).toBe(next);
 expect(mocks.hosts.at(-1).scene.name).toBe(next);
 expect(mocks.hosts[0].dispose).toHaveBeenCalledOnce();
 await act(async()=>{knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
 expect(scene.value).toBe(knob.getAttribute('aria-valuetext'));
 expect(mocks.hosts.at(-1).scene.name).toBe(scene.value);
 const count=mocks.hosts.length;
 await act(async()=>button('Reset scene').click());
 expect(mocks.hosts).toHaveLength(count+1);
 expect(mocks.hosts.at(-1).scene.name).toBe(scene.value);
});

test('opening a copied front-page setup preserves its mutes and leaves the address alone until a scene is chosen',async()=>{
 const original=location.href,old=mocks.hosts.at(-1),input=container.querySelector('.all-link textarea');
 const enter=async value=>{
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>input.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 };
 await enter(JSON.stringify({name:'Imported',settings:{muted:{lead:true}},voices:{lead:'Soft Pad'}}));
 expect(container.querySelector('.bar-scene select').value).toBe('Imported');
 expect(container.querySelector('.voice-card input[type=checkbox]').checked).toBe(true);
 expect(mocks.hosts.at(-1).g.settings.muted.lead).toBe(false);
 expect(location.href).toBe(original);
 expect(old.dispose).toHaveBeenCalledOnce();
 const current=mocks.hosts.at(-1);
 await enter('not a real preset');
 expect(mocks.hosts.at(-1)).toBe(current);
 expect(current.dispose).not.toHaveBeenCalled();
 expect(container.querySelector('.patch-name').textContent).toContain('Could not open link');
 const select=container.querySelector('.bar-scene select'),next=[...select.options].find(o=>o.value!=='Imported').value;
 await act(async()=>{select.value=next;select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(new URL(location.href).searchParams.get('preset')).toBeTruthy();
 expect(location.pathname).toBe(new URL(original).pathname);
});

test('an address with a front-page preset takes precedence over a saved song',async()=>{
 const savedScene=mocks.hosts.at(-1).scene.name,project=mocks.hosts.at(-1).capture({});
 act(()=>root.unmount());
 localStorage.setItem('synths:all:state',JSON.stringify({scene:savedScene,project,selected:0}));
 window.history.replaceState(null,'','/?preset=rainy-cafe');
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('.bar-scene select').value).toBe('Rainy café');
 expect(container.querySelector('[aria-label="Generator mode"]').getAttribute('aria-valuetext')).toBe('Continuous');
 expect(location.search).toBe('?preset=rainy-cafe');
});

test('failed scene loading keeps the current scene and host usable',async()=>{
 const scene=container.querySelector('.bar-scene select'),current=scene.value,old=mocks.hosts[0];
 const next=[...scene.options].find(o=>o.value!==current).value;
 mocks.failScene=true;
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  await act(async()=>{scene.value=next;scene.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(scene.value).toBe(current);
  expect(container.querySelector('[aria-label="Scene preset"]').getAttribute('aria-valuetext')).toBe(current);
  expect(container.querySelector('.patch-name').textContent).toContain('voice loading failed');
  expect(old.dispose).not.toHaveBeenCalled();
  expect(mocks.hosts.at(-1).dispose).toHaveBeenCalledOnce();
  expect(button('▶Play').disabled).toBe(false);
 }finally{log.mockRestore();}
});
test('setup files restore the scene and leave the current host intact on invalid input or load failure',async()=>{
 let blob;
 const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;
 URL.createObjectURL=vi.fn(value=>{blob=value;return 'blob:setup';});
 URL.revokeObjectURL=vi.fn();
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const upload=async(text)=>{
  const input=container.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[{name:'setup.json',size:text.length,text:async()=>text}]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 };
 try{
  const initial=container.querySelector('.bar-scene select').value;
  act(()=>container.querySelector('[aria-label="Mixing desk"] button[title^="Ambience:"]').click());
  act(()=>button('Save setup').click());
  const text=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});
  const exported=JSON.parse(text),savedSeq=exported.workbench.objects.find(o=>o.binding==='surface:sequencer');
  expect(exported.version).toBe(2);expect(savedSeq.id).toBe(container.querySelector('#all-panel-sequencer').dataset.deskObjectId);
  const moved=structuredClone(exported);moved.workbench.objects.find(o=>o.binding==='surface:sequencer').pose={x:-640,y:560,angle:25};
  const select=container.querySelector('.bar-scene select'),next=[...select.options].find(o=>o.value!==initial).value;
  await act(async()=>{select.value=next;select.dispatchEvent(new Event('change',{bubbles:true}));});
  const old=mocks.hosts.at(-1);
  await upload('{');
  expect(old.dispose).not.toHaveBeenCalled();
  expect(select.value).toBe(next);
  mocks.failScene=true;
  await upload(text);
  expect(old.dispose).not.toHaveBeenCalled();
  expect(mocks.hosts.at(-1).dispose).toHaveBeenCalledOnce();
  expect(select.value).toBe(next);
  mocks.failScene=false;
  await upload(JSON.stringify(moved));
  expect(old.dispose).toHaveBeenCalledOnce();
  const restoredSeq=container.querySelector('#all-panel-sequencer');expect(restoredSeq.dataset.deskObjectId).toBe(savedSeq.id);expect(restoredSeq.style.left).toBe('-640px');expect(restoredSeq.style.top).toBe('560px');expect(restoredSeq.style.transform).toBe('rotate(25deg)');
  expect(select.value).toBe(initial);
  expect(container.querySelector('.patch-name').textContent).toContain('Opened setup.json');
  expect(container.querySelector('[aria-label="Channel"]').getAttribute('aria-valuetext')).toBe('Ambience');
  expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Pad');
 }finally{await new Promise(resolve=>setTimeout(resolve,1100));URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;click.mockRestore();log.mockRestore();}
});
afterEach(() => {
 act(() => root.unmount());
 container.remove();
 delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('a fresh page starts continuous playback with the default lookahead',async()=>{
 act(()=>root.unmount());
 localStorage.clear();
 mocks.capture.mockClear();
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Generator mode"]').getAttribute('aria-valuetext')).toBe('Continuous');
 expect(container.querySelector('[aria-label="Channel"]').getAttribute('aria-valuetext')).toBe('Pad');
 expect(container.querySelector('[aria-label="Resolution"]').getAttribute('aria-valuetext')).toBe('1/4');
 expect(container.querySelector('[aria-label="Repeat song"]')).toBeTruthy();
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(5);
 expect(mocks.capture).not.toHaveBeenCalled();
 expect(mocks.scheduler.start).not.toHaveBeenCalled();
 await act(async()=>button('▶Play').click());
 expect(mocks.scheduler.start).toHaveBeenLastCalledWith(.08,'song',{pattern:0,step:0});
});

test('a fresh rhythm-only progression selects rhythm in the sequencer and mixer',async()=>{
 act(()=>root.unmount());
 localStorage.clear();mocks.continuousRole='rhythm';
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Rhythm');
 expect(container.querySelector('[aria-label="Channel"]').getAttribute('aria-valuetext')).toBe('Rhythm');
});

test('default sequencer favours an audible pad or rhythm in the first progression',()=>{
 const pattern=steps=>({steps,chords:[]}),project={bars:2,stepsPerBar:2,progressions:[{startBar:0,bars:1},{startBar:1,bars:1}],patterns:{
  lead:pattern([{n:[{d:0}]},null,null,null]),
  pad:pattern([null,null,{n:[{d:0}]},null]),
  rhythm:pattern([{n:[{d:1}]},null,null,null]),
 }};
 expect(defaultSequencer(project)).toBe(2);
 project.patterns.pad.steps[0]={n:[{d:0}]};
 expect(defaultSequencer(project)).toBe(3);
 delete project.patterns.pad;
 expect(defaultSequencer(project)).toBe(2);
 delete project.patterns.rhythm;
 expect(defaultSequencer(project)).toBe(3);
});

test('a fresh continuous session uses saved buffer preferences',async()=>{
 act(()=>root.unmount());
 localStorage.clear();
 localStorage.setItem('synths:all:continuous-buffer',JSON.stringify({ahead:2,history:3}));
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Generator mode"]').getAttribute('aria-valuetext')).toBe('Continuous');
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(3);
});

test('a saved finite song is restored in song mode',async()=>{
 act(()=>window.dispatchEvent(new Event('pagehide')));
 const saved=JSON.parse(localStorage.getItem('synths:all:state'));
 expect(saved.project.progressions).toHaveLength(2);
 act(()=>root.unmount());
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Generator mode"]').getAttribute('aria-valuetext')).toBe('Song');
 expect(container.querySelector('[aria-label="Repeat pattern"]')).toBeTruthy();
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(2);
 expect(container.querySelector('.patch-name').textContent).toContain('back where you left off');
 expect(JSON.parse(localStorage.getItem('synths:all:state')).project).toEqual(saved.project);
});

test('the default resolution uses the coarsest grid for an eighth-note meter',async()=>{
 act(()=>window.dispatchEvent(new Event('pagehide')));
 const saved=JSON.parse(localStorage.getItem('synths:all:state'));
 act(()=>root.unmount());
 localStorage.setItem('synths:all:state',JSON.stringify({...saved,project:{...saved.project,meter:'6/8'}}));
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Resolution"]').getAttribute('aria-valuetext')).toBe('1/8');
});

test('a saved song for an unavailable scene starts a fresh continuous session',async()=>{
 act(()=>window.dispatchEvent(new Event('pagehide')));
 const saved=JSON.parse(localStorage.getItem('synths:all:state'));
 act(()=>root.unmount());
 localStorage.setItem('synths:all:state',JSON.stringify({...saved,scene:'Unavailable scene'}));
 mocks.capture.mockClear();
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Generator mode"]').getAttribute('aria-valuetext')).toBe('Continuous');
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(5);
 expect(mocks.capture).not.toHaveBeenCalled();
});

test('selects progression loops, switches to arrangement playback, and applies sequencer solo', async () => {
 expect(mocks.capture).toHaveBeenCalledWith({progressions:4,seed:1});
 expect(container.querySelector('[aria-label="Progression editor"]')).toBeTruthy();
 act(() => { button('ViewArrange').click(); });
 const grid=container.querySelector('[aria-label="Arrangement"]');
 expect(grid.classList.contains('lane-grid')).toBe(true);
 expect(container.querySelectorAll('.seq-grid')).toHaveLength(1);
 expect(grid.querySelector('[aria-label^="Lead, progression 2, has notes"]')).toBeTruthy();
 act(() => { grid.querySelector('[aria-label^="Lead, progression 2, has notes"]').click(); });
 expect(mocks.scheduler.options.bank().current).toBe(1);
 await act(async () => { button('▶Play').click(); });
 expect(mocks.scheduler.start).toHaveBeenLastCalledWith(0.08,'pattern');
 await act(async () => { button('⟲Pattern').click(); });
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:1,step:4},'song');
 act(() => { button('RowsSolo').click(); });
 act(() => { grid.querySelector('[aria-label="Solo Lead"]').click(); });
 const bank = mocks.scheduler.options.bank();
 const project = mocks.scheduler.options.pattern(bank.patterns[1]);
 expect(project.start).toBe(16);
 expect(project.sequencers.map(x => !!x.mute)).toEqual([false,true,true,true,true,true]);
 const events = mocks.scheduler.options.events(project,0,{time:0,stepSec:0.1,swing:0.5});
 expect(events.map(x => x.note)).toEqual([67]);
 act(() => { button('RowsMute').click(); });
 act(() => { grid.querySelector('[aria-label="Mute Lead"]').click(); });
 expect(mocks.scheduler.options.pattern(bank.patterns[1]).sequencers[0].mute).toBe(true);
 act(() => { button('ViewArrange').click(); });
 expect(container.querySelector('[aria-label="Arrangement"]')).toBeNull();
 expect(container.querySelectorAll('.seq-grid')).toHaveLength(1);
});

test('continuous playback retains a rolling buffer and resumes from a selected history progression',async()=>{
 const mode=container.querySelector('[aria-label="Generator mode"]');
 await act(async()=>{mode.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));});
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(5);
 await act(async()=>button('▶Play').click());
 expect(mocks.scheduler.start).toHaveBeenLastCalledWith(.08,'song',{pattern:0,step:0});
 for(let index=1;index<=4;index++){
  mocks.scheduler.position={pattern:index,step:1,wrapped:false};
  await act(async()=>{mocks.scheduler.options.onStep({pattern:index,step:0,time:0});await new Promise(r=>setTimeout(r,5));});
 }
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(8);
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:3,step:1},'song');
 act(()=>button('⏸Pause').click());
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label^="Lead, progression 1,"]').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:0},'song');
 await act(async()=>button('▶Play').click());
 expect(mocks.scheduler.resume).toHaveBeenCalledWith(.08);
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(8);
});

test('continuous buffer settings apply finite lookahead and unlimited history',async()=>{
 act(()=>container.querySelector('[aria-label="Setup"]').click());
 const ahead=container.querySelector('[aria-label="Progressions ahead"]'),history=container.querySelector('[aria-label="History retained"]');
 act(()=>{ahead.value='2';ahead.dispatchEvent(new Event('change',{bubbles:true}));history.value='infinite';history.dispatchEvent(new Event('change',{bubbles:true}));});
 const mode=container.querySelector('[aria-label="Generator mode"]');
 await act(async()=>{mode.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));});
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(3);
 await act(async()=>button('▶Play').click());
 for(let index=1;index<=6;index++){
  mocks.scheduler.position={pattern:index,step:1,wrapped:false};
  await act(async()=>{mocks.scheduler.options.onStep({pattern:index,step:0,time:0});await new Promise(r=>setTimeout(r,5));});
 }
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(9);
 expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
});

test('cycles repeat modes at the next unbooked step without restarting playback',async()=>{
 await act(async()=>button('▶Play').click());
 mocks.scheduler.position={pattern:0,step:6,wrapped:false};
 await act(async()=>button('⟲Pattern').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:6},'song');
 mocks.scheduler.position={pattern:1,step:6,wrapped:false};
 mocks.scheduler.options.onStep({pattern:1,step:5,time:0});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 await act(async()=>button('⟲Song').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:6},'pattern');
 let bank=mocks.scheduler.options.bank();
 expect(bank.patterns).toEqual([{startBar:1,bars:1}]);
 expect(bank.lengths).toEqual([16]);
 expect(mocks.scheduler.options.pattern(bank.patterns[0]).start).toBe(16);
 await act(async()=>button('⟲Bar').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:6},'pattern');
 bank=mocks.scheduler.options.bank();
 expect(bank.patterns).toEqual([{startBar:1,bars:1}]);
 await act(async()=>button('⟲Chord').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:1,step:6},'pattern');
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(2);
 expect(mocks.scheduler.start).toHaveBeenCalledTimes(1);
 expect(mocks.scheduler.stop).not.toHaveBeenCalled();
});

test('changing repeat while paused preserves the paused position',async()=>{
 await act(async()=>button('▶Play').click());
 mocks.scheduler.position={pattern:0,step:7,wrapped:false};
 act(()=>button('⏸Pause').click());
 act(()=>button('⟲Pattern').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:7},'song');
 expect(mocks.scheduler.resume).not.toHaveBeenCalled();
 await act(async()=>button('▶Play').click());
 expect(mocks.scheduler.resume).toHaveBeenCalledWith(.08);
 expect(mocks.scheduler.start).toHaveBeenCalledTimes(1);
});

test('switching from progression to song at a booked boundary advances to the next progression',async()=>{
 await act(async()=>button('▶Play').click());
 mocks.scheduler.position={pattern:0,step:0,wrapped:true};
 act(()=>button('⟲Pattern').click());
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:1,step:0},'song');
});

test('changing repeat while holding a temporary chord loop takes effect on release',async()=>{
 await act(async()=>button('▶Play').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Focus chord C, bar 1"]').click());
 mocks.scheduler.position={pattern:0,step:7,wrapped:false};
 act(()=>button('⟲Pattern').click());
 expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
 expect(mocks.scheduler.options.bank().patterns).toEqual([{startBar:0,bars:1}]);
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(mocks.scheduler.reposition).toHaveBeenCalledWith({pattern:0,step:7},'song');
});

test('releasing a temporary chord loop while paused restores the selected repeat mode',async()=>{
 await act(async()=>button('▶Play').click());
 act(()=>button('⟲Pattern').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Focus chord C, bar 1"]').click());
 mocks.scheduler.position={pattern:0,step:8,wrapped:false};
 act(()=>button('⏸Pause').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:8},'song');
 await act(async()=>button('▶Play').click());
 expect(mocks.scheduler.resume).toHaveBeenCalledWith(.08);
});

test('keeps the display and knob slots shared when switching grid views',()=>{
 const editor=container.querySelector('[aria-label="Progression editor"]');
 expect(editor.querySelector('.grid-display[aria-label="Chord timeline"]')).toBeTruthy();
 expect([...editor.querySelectorAll('.grid-control [role="slider"]')].map(x=>x.getAttribute('aria-label'))).toEqual(['Page','Voices']);
 expect(editor.querySelector('[aria-label="Voices"]').getAttribute('aria-disabled')).toBe('true');
 act(()=>button('ViewArrange').click());
 const arrangement=container.querySelector('[aria-label="Arrangement"]');
 const display=arrangement.querySelector('.grid-display[aria-label="Progression timeline"]');
 expect(display.querySelectorAll('.progression-marker')).toHaveLength(2);
 expect(display.querySelector('.lane-ruler')).toBeNull();
 expect([...arrangement.querySelectorAll('.grid-control [role="slider"]')].map(x=>x.getAttribute('aria-label'))).toEqual(['Progressions','Voices']);
 expect(arrangement.querySelector('[aria-label="Voices"]').getAttribute('aria-disabled')).toBe('true');
});

test('resolution edits a quarter note and displays its sustain at sixteenth resolution',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const knob=container.querySelector('[aria-label="Resolution"]');
 expect(knob.getAttribute('aria-valuetext')).toBe('1/16');
 act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 expect(knob.getAttribute('aria-valuetext')).toBe('1/4');
 let grid=container.querySelector('[aria-label="Progression editor"]');
 expect(grid.querySelector('[aria-label="C step 5"]')).toBeNull();
 act(()=>grid.querySelector('[aria-label="C step 2"]').click());
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 const event=mocks.scheduler.options.events(p,4,{time:0,stepSec:.1,swing:.5}).find(e=>e.note===60);
 expect(event.duration).toBeCloseTo(.38);
 act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 grid=container.querySelector('[aria-label="Progression editor"]');
 expect(grid.querySelector('[aria-label="C step 5"]').getAttribute('aria-pressed')).toBe('true');
 for(let i=6;i<=8;i++)expect(grid.querySelector(`[aria-label="C step ${i}, held"]`).getAttribute('aria-pressed')).toBe('true');
 expect(grid.querySelector('[aria-label="C step 9"]').getAttribute('aria-pressed')).toBe('false');
});

test('holds Shift to filter an octave and restores all octaves on release',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>grid.querySelector('[aria-label="C step 2"]').click());
 act(()=>grid.querySelector('[aria-label="Select octave 5"]').click());
 act(()=>grid.querySelector('[aria-label="C step 3"]').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>grid.querySelector('[aria-label="Select octave 4"]').click());
 expect(grid.querySelector('[aria-label="C step 2"]').getAttribute('aria-pressed')).toBe('true');
 expect(grid.querySelector('[aria-label="C step 3"]').getAttribute('aria-pressed')).toBe('false');
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(grid.querySelector('[aria-label="C step 3"]').getAttribute('aria-pressed')).toBe('true');
 expect(grid.querySelector('[aria-label="Select octave 5"]').getAttribute('aria-pressed')).toBe('true');
});

test('Shift-click loops a chord while playing and resumes the previous mode on release',async()=>{
 await act(async()=>button('▶Play').click());
 await act(async()=>button('⟲Pattern').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Focus chord C, bar 1"]').click());
 expect(mocks.scheduler.start).toHaveBeenLastCalledWith(.08,'pattern',{pattern:0,step:0});
 mocks.scheduler.position={pattern:0,step:4,wrapped:false};
 expect(mocks.scheduler.options.bank().patterns).toEqual([{startBar:0,bars:1}]);
 expect(container.querySelector('[aria-label="Focus chord C, bar 1"]').getAttribute('aria-pressed')).toBe('false');
 const stops=mocks.scheduler.stop.mock.calls.length,starts=mocks.scheduler.start.mock.calls.length;
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:0,step:4},'song');
 expect(mocks.scheduler.start).toHaveBeenCalledTimes(starts);
 expect(mocks.scheduler.stop).toHaveBeenCalledTimes(stops);
 expect(mocks.scheduler.options.bank().patterns).toHaveLength(2);
});

test('releasing a chord loop at a booked wrap continues into the next progression in song mode',async()=>{
 await act(async()=>button('▶Play').click());
 await act(async()=>button('⟲Pattern').click());
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Focus chord C, bar 1"]').click());
 mocks.scheduler.position={pattern:0,step:0,wrapped:true};
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith({pattern:1,step:0},'song');
});

test.each([
 ['pattern',0,{pattern:0,step:0}],
 ['bar',2,{pattern:0,step:0}],
 ['chord',3,{pattern:0,step:0}],
])('releasing at a chord wrap preserves %s repeat',async(_mode,changes,expected)=>{
 await act(async()=>button('▶Play').click());
 for(let i=0;i<changes;i++){
  const control=container.querySelector('[aria-label^="Repeat "]');
  await act(async()=>control.click());
 }
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Focus chord C, bar 1"]').click());
 mocks.scheduler.position={pattern:0,step:0,wrapped:true};
 act(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true})));
 expect(mocks.scheduler.reposition).toHaveBeenLastCalledWith(expected,'pattern');
});

test('places a held progression-root chord and edits both chord pages',()=>{
 act(()=>button('InsertNote').click());
 const grid=container.querySelector('[aria-label="Progression editor"]'),cells=grid.querySelector('.seq-cells');
 cells.getBoundingClientRect=()=>({left:0,width:1600});
 const pad=grid.querySelector('[aria-label="Octave 4 step 2"]');
 const pointer=(type,x)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x});Object.defineProperty(event,'pointerId',{value:1});pad.dispatchEvent(event);};
 act(()=>pointer('pointerdown',150));
 act(()=>pointer('pointermove',450));
 act(()=>pointer('pointerup',450));
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 let events=mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3);
 expect(events.map(e=>e.note)).toEqual([60,64,67]);
 expect(events.every(e=>Math.abs(e.duration-.4)<1e-8)).toBe(true);
 expect(container.querySelector('.oled-window').textContent).toContain('PLACED CHORD');
 expect(container.querySelector('.oled-window .l1').textContent).toMatch(/^C · BAR 1 · BEAT 1.2 · /);
 expect(grid.querySelector('[aria-label="Octave 4 step 3, held"]')).toBeTruthy();
 for(const name of ['Length','Flavour','Inversion'])act(()=>container.querySelector(`[aria-label="${name}"]`).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(container.querySelector('[aria-label="Length"]')).toBeTruthy();
 expect(container.querySelector('[aria-label="Flavour"]').getAttribute('aria-valuetext')).toBe('Sus2');
 expect(container.querySelector('[aria-label="Length"]').getAttribute('aria-valuetext')).toBe('Seventh');
 expect(container.querySelector('[aria-label="Inversion"]').getAttribute('aria-valuetext')).toBe('1');
 act(()=>[...container.querySelectorAll('[role="tab"]')].find(x=>x.textContent==='Play').click());
 expect(container.querySelector('[aria-label="Rate"]')).toBeTruthy();
 act(()=>container.querySelector('[aria-label="Style"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Rate"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
 events=mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3);
 expect(events).toHaveLength(1);
 expect(events[0].note).toBe(62);
 expect(events[0].duration).toBeCloseTo(.2);
 expect(mocks.scheduler.options.events(p,2,{time:.1,stepSec:.1,swing:.5}).filter(e=>e.track===3)).toEqual([]);
});

test('layers chords, cycles deletion across a stack, and holds to delete all',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 act(()=>button('InsertNote').click());
 const select=container.querySelector('[aria-label="Chord overlap"]');
 expect(select.value).toBe('replace');
 act(()=>{select.value='layer';select.dispatchEvent(new Event('change',{bubbles:true}));});
 let grid=container.querySelector('[aria-label="Progression editor"]');
 const pad=()=>grid.querySelector('[aria-label="Octave 4 step 1"]');
 act(()=>pad().click());
 act(()=>pad().dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true,detail:1})));
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[0].pattern.chords).toHaveLength(2);
 act(()=>button('ModeDelete').click());
 act(()=>pad().click());
 expect(container.querySelector('.oled-window').textContent).toContain('DELETE NOTE C4');
 act(()=>pad().click());
 expect(container.querySelector('.oled-window').textContent).toContain('DELETE CHORD C4');
 act(()=>button('ConfirmDelete').click());
 expect(container.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Seq');
 bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[0].pattern.chords).toHaveLength(1);
 expect(p.sequencers[0].pattern.steps[0].n).toHaveLength(1);
 vi.useFakeTimers();
 try{
  const event=new MouseEvent('pointerdown',{bubbles:true,button:0});Object.defineProperty(event,'pointerId',{value:10});
  act(()=>pad().dispatchEvent(event));
  act(()=>vi.advanceTimersByTime(600));
  const up=new MouseEvent('pointerup',{bubbles:true,button:0});Object.defineProperty(up,'pointerId',{value:10});
  act(()=>pad().dispatchEvent(up));
  bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
  expect(p.sequencers[0].pattern.chords).toHaveLength(0);
  expect(p.sequencers[0].pattern.steps[0]).toBeNull();
 }finally{vi.useRealTimers();}
});

test('delete mode can select the entire stack and delete chord tones from note view',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 act(()=>button('InsertNote').click());
 const select=container.querySelector('[aria-label="Chord overlap"]');
 act(()=>{select.value='layer';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>grid.querySelector('[aria-label="Octave 4 step 1"]').click());
 act(()=>button('InsertChord').click());
 expect(grid.querySelector('[aria-label="E step 1"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('ModeDelete').click());
 act(()=>grid.querySelector('[aria-label="E step 1"]').click());
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[0].pattern.chords).toHaveLength(0);
 expect(p.sequencers[0].pattern.steps[0].n).toHaveLength(1);
 act(()=>button('ModeDelete').click());
 act(()=>button('InsertNote').click());
 act(()=>grid.querySelector('[aria-label="Octave 4 step 1"]').click());
 act(()=>button('ModeDelete').click());
 act(()=>grid.querySelector('[aria-label="Octave 4 step 1"]').click());
 act(()=>grid.querySelector('[aria-label="Octave 4 step 1"]').click());
 act(()=>grid.querySelector('[aria-label="Octave 4 step 1"]').click());
 expect(container.querySelector('.oled-window').textContent).toContain('DELETE ALL');
 act(()=>button('ConfirmDelete').click());
 bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[0].pattern.steps[0]).toBeNull();
 expect(p.sequencers[0].pattern.chords).toHaveLength(0);
});

test('edit mode selects generated notes without changing them and edits independent metadata',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>button('LayerEdit').click());
 act(()=>grid.querySelector('[aria-label="C step 1"]').click());
 expect([...container.querySelectorAll('[role="tab"]')].map(t=>t.textContent)).toEqual(['Note','Scale','','','','']);
 expect(container.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Note');
 const key=name=>act(()=>container.querySelector(`[aria-label="${name}"]`).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 key('Length');key('Velocity');key('Note gate');
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 let event=mocks.scheduler.options.events(p,0,{time:0,stepSec:.1,swing:.5}).find(e=>e.track===0);
 expect(event.duration).toBeCloseTo(.185);
 expect(event.velocity).toBeCloseTo(.81);
 expect(p.sequencers[0].pattern.steps[0].n).toHaveLength(1);
 for(let i=0;i<20;i++)act(()=>container.querySelector('[aria-label="Chance"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(mocks.scheduler.options.events(p,0,{time:0,stepSec:.1,swing:.5,random:()=>.5}).filter(e=>e.track===0)).toEqual([]);
});

test('generated chord provenance is selectable and original playback survives until its voicing is edited',()=>{
 act(()=>button('InsertNote').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>button('LayerEdit').click());
 act(()=>grid.querySelector('[aria-label="Octave 4 step 9"]').click());
 expect(container.querySelector('.oled-window').textContent).toContain('GENERATED CHORD');
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[3].pattern.steps[8].n).toHaveLength(3);
 expect(mocks.scheduler.options.events(p,8,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3).map(e=>e.note)).toEqual([60,64,67]);
 act(()=>[...container.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Rhythm').click());
 expect(container.querySelector('[aria-label="Omit"]').getAttribute('aria-valuetext')).toBe('None');
 act(()=>container.querySelector('[aria-label="Omit"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(container.querySelector('[aria-label="Omit"]').getAttribute('aria-valuetext')).toBe('Root');
 act(()=>container.querySelector('[aria-label="Omit"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 act(()=>[...container.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Level').click());
 act(()=>container.querySelector('[aria-label="Velocity"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 act(()=>[...container.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Chord').click());
 act(()=>container.querySelector('[aria-label="Flavour"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 bank=mocks.scheduler.options.bank();p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(p.sequencers[3].pattern.steps[8]).toBeNull();
 expect(p.sequencers[3].pattern.chords).toHaveLength(1);
 expect(mocks.scheduler.options.events(p,8,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3).map(e=>e.note)).toEqual([60,62,67]);
 expect(p.sequencers[3].pattern.chords[0].vel).toBeCloseTo(.79);
});

test('copy mode picks a source then pastes a note repeatedly at target pitch and time',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>button('ModeCopy').click());
 act(()=>grid.querySelector('[aria-label="C step 1"]').click());
 act(()=>grid.querySelector('[aria-label="E step 2"]').click());
 act(()=>grid.querySelector('[aria-label="G step 3"]').click());
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5}).find(e=>e.track===0).note).toBe(64);
 expect(mocks.scheduler.options.events(p,2,{time:0,stepSec:.1,swing:.5}).find(e=>e.track===0).note).toBe(67);
 expect(p.sequencers[0].pattern.steps[0].n).toHaveLength(1);
});

test('the notes of a generated chord are dithered in the note view, and plain notes are not',()=>{
 const grid=container.querySelector('[aria-label="Progression editor"]');
 expect(grid.querySelectorAll('.cell.grouped').length).toBeGreaterThan(0);
 expect([...grid.querySelectorAll('.cell.grouped')].every(c=>/ g[01]( |$)/.test(c.className))).toBe(true);
});

test('chord mode keeps a legend beside the octave rows: Scale chords, then one line per degree, the chord of the key on it',()=>{
 act(()=>button('InsertNote').click());
 const labels=[...container.querySelectorAll('.seq-info .lane-info')].map(x=>x.textContent);
 expect(labels[0]).toBe('SCALE CHORDS:');
 expect(labels[7]).toContain('I · C');
 expect(labels[1]).toContain('vii°');
 expect(labels.some(x=>x.includes('ii · D')&&x.includes('Dm7'))).toBe(true);
 expect(labels.some(x=>x.includes('vii°'))).toBe(true);
 expect(container.querySelector('[aria-label="Octave 4 step 1"]')).toBeTruthy();
});
test('copy mode duplicates a generated chord without changing its original notes',()=>{
 act(()=>button('InsertNote').click());
 act(()=>button('ModeCopy').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>grid.querySelector('[aria-label="Octave 4 step 9"]').click());
 act(()=>grid.querySelector('[aria-label="Octave 5 step 2"]').click());
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3).map(e=>e.note)).toEqual([72,76,79]);
 expect(mocks.scheduler.options.events(p,8,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3).map(e=>e.note)).toEqual([60,64,67]);
});

test('note page edits held chord length and velocity in playback',()=>{
 act(()=>button('InsertNote').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>grid.querySelector('[aria-label="Octave 3 step 2"]').click());
 act(()=>[...container.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Level').click());
 act(()=>container.querySelector('[aria-label="Length"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 act(()=>container.querySelector('[aria-label="Velocity"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 const events=mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5}).filter(e=>e.track===3);
 expect(events.map(e=>e.note)).toEqual([48,52,55]);
 expect(events.every(e=>Math.abs(e.duration-.2)<1e-8&&Math.abs(e.velocity-.79)<1e-8)).toBe(true);
});

test('dragging inserts a sustained note and suppresses the subsequent click',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]'),cells=grid.querySelector('.seq-cells');
 cells.getBoundingClientRect=()=>({left:0,width:1600});
 const pad=grid.querySelector('[aria-label="C step 2"]');
 const pointer=(type,x)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x});Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});pad.dispatchEvent(event);};
 act(()=>pointer('pointerdown',150));
 act(()=>pointer('pointermove',450));
 expect(grid.querySelectorAll('.drag-preview')).toHaveLength(4);
 act(()=>pointer('pointerup',450));
 act(()=>pad.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1})));
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 const events=mocks.scheduler.options.events(p,1,{time:0,stepSec:.1,swing:.5});
 expect(events.find(e=>e.note===60).duration).toBeCloseTo(.38);
 expect(grid.querySelector('[aria-label="C step 5, held"]').getAttribute('aria-pressed')).toBe('true');
});

test('selects and deselects a chord, and transposes notes and chord across sequencers',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label^="Lead, progression 2,"]').click());
 act(()=>button('ViewArrange').click());
 let grid=container.querySelector('[aria-label="Progression editor"]');
 const focus=()=>grid.querySelector('[aria-label="Focus chord G, bar 2"]');
 act(()=>focus().click());
 expect(focus().getAttribute('aria-pressed')).toBe('true');
 expect(container.querySelector('.oled-window').textContent).toContain('PROGRESSION CHORD');
 const g=[...grid.querySelectorAll('.lane-info')].find(x=>x.querySelector('b')?.textContent==='G');
 const c=[...grid.querySelectorAll('.lane-info')].find(x=>x.querySelector('b')?.textContent==='C');
 expect(g.style.getPropertyValue('--voice')).toBe('#ff4d4d');
 expect(c.querySelector('i').textContent).toBe('Perfect fourth');
 expect(container.querySelectorAll('.encoders [role="slider"]')).toHaveLength(4);
 act(()=>container.querySelector('[aria-label="Degree"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(container.querySelector('.oled-window').textContent).toContain('Am · BARS');
 let bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[1]);
 expect(mocks.scheduler.options.events(p,0,{time:0,stepSec:.1,swing:.5}).map(e=>e.note)).toEqual([69]);
 act(()=>container.querySelector('[aria-label="Octave"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 p=mocks.scheduler.options.pattern(bank.patterns[1]);
 expect(mocks.scheduler.options.events(p,0,{time:0,stepSec:.1,swing:.5}).map(e=>e.note)).toEqual([81]);
 act(()=>grid.querySelector('[aria-label="Focus chord Am, bar 2"]').click());
 expect(container.querySelector('.oled-window').textContent).not.toContain('Am · BARS');
 const tonic=[...grid.querySelectorAll('.lane-info')].find(x=>x.querySelector('b')?.textContent==='C');
 expect(tonic.style.getPropertyValue('--voice')).toBe('#ff4d4d');
 expect(tonic.querySelector('i').textContent).toBe('Root');
});

test('drums can be selected, scrolled, edited, and scheduled', async()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Drums sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 expect(grid.querySelector('[aria-label="Felt kick step 1"]').getAttribute('aria-pressed')).toBe('true');
 const initialBank=mocks.scheduler.options.bank(),initial=mocks.scheduler.options.pattern(initialBank.patterns[0]);
 expect(mocks.scheduler.options.events(initial,0,{time:1,stepSec:.1,swing:.5}).find(e=>e.track===5).hit.drum).toBe(0);
 const knob=grid.querySelector('[aria-label="Voices"]');
 expect(knob.getAttribute('aria-disabled')).toBe('false');
 act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(grid.querySelector('[aria-label="Soft ride step 2"]')).toBeTruthy();
 act(()=>grid.querySelector('[aria-label="Soft ride step 2"]').click());
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 const events=mocks.scheduler.options.events(p,1,{time:1,stepSec:.1,swing:.5});
 expect(events.find(e=>e.track===5).hit).toEqual({drum:8,velocity:.8,duration:1});
});

test('switches drum kits without changing the song and restores the chosen kit',async()=>{
 const source=container.querySelector('[aria-label="Drums sound generator"]'),patch=container.querySelector('[aria-label="Drums patch"]');
 const before=mocks.scheduler.options.pattern(mocks.scheduler.options.bank().patterns[0]).drums;
 await act(async()=>{source.value='tr808';source.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(source.value).toBe('tr808');
 await act(async()=>{patch.value='Room';patch.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(mocks.scheduler.options.pattern(mocks.scheduler.options.bank().patterns[0]).drums).toEqual(before);
 act(()=>window.dispatchEvent(new Event('pagehide')));
 act(()=>root.unmount());
 root=createRoot(container);
 await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-label="Drums sound generator"]').value).toBe('tr808');
 expect(container.querySelector('[aria-label="Drums patch"]').value).toBe('Room');
});

test('extra machine tracks stay separate from the common drum lane',async()=>{
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Drums sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]'),knob=grid.querySelector('[aria-label="Voices"]');
 for(let i=0;i<8;i++)act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 act(()=>grid.querySelector('[aria-label="Mid tom step 2"]').click());
 const bank=mocks.scheduler.options.bank(),p=mocks.scheduler.options.pattern(bank.patterns[0]);
 expect(mocks.scheduler.options.events(p,1,{time:1,stepSec:.1,swing:.5}).find(e=>e.track===5).hit).toEqual({drum:6,track:'mt',velocity:.8,duration:1});
});

test('selects a sequencer in arrangement, transposes the grid view, and preserves stacked octave notes', async () => {
 expect(container.querySelector('[aria-label="Sequencer select"]')).toBeNull();
 expect(container.querySelector('.stack-mode')).toBeNull();
 expect(container.querySelectorAll('[role="tab"]')).toHaveLength(6);
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 expect(grid.querySelector('[aria-label="C step 1"]').style.getPropertyValue('--voice')).toBe('#ff4d4d');
 expect(grid.querySelector('[aria-label="Select octave 4"]')).toBeTruthy();
 act(()=>grid.querySelector('[aria-label="C step 2"]').click());
 act(()=>grid.querySelector('[aria-label="Select octave 5"]').click());
 act(()=>grid.querySelector('[aria-label="C step 2"]').click());
 const bank=mocks.scheduler.options.bank(), project=mocks.scheduler.options.pattern(bank.patterns[0]);
 let events=mocks.scheduler.options.events(project,1,{time:0,stepSec:0.1,swing:0.5});
 expect(events.map(e=>e.note).sort((a,b)=>a-b)).toEqual([60,72]);
 act(()=>grid.querySelector('[aria-label="C step 2"]').click());
 const next=mocks.scheduler.options.pattern(bank.patterns[0]);
 events=mocks.scheduler.options.events(next,1,{time:0,stepSec:0.1,swing:0.5});
 expect(events.map(e=>e.note)).toEqual([60]);
 act(()=>container.querySelector('[aria-label="Grid view: scale"]').click());
 expect(grid.querySelector('[aria-label="Octave 4 step 2"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>grid.querySelector('[aria-label="Toggle off-scale notes"]').click());
 expect(grid.querySelector('[aria-label="Select C♯"]')).toBeTruthy();
 act(()=>grid.querySelector('[aria-label="Octave 4 step 3"]').click());
 expect(grid.querySelector('[aria-label="Step 3: contains off-scale notes"]')).toBeTruthy();
});

test('arrangement row controls return to voice selection after mute or solo mode is turned off',()=>{
 act(()=>button('ViewArrange').click());
 const grid=container.querySelector('[aria-label="Arrangement"]');
 act(()=>button('RowsMute').click());
 act(()=>grid.querySelector('[aria-label="Mute Lead"]').click());
 expect(grid.querySelector('[aria-label="Mute Lead"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('RowsMute').click());
 expect(grid.querySelector('[aria-label="Lead sequencer display"]').textContent).toContain('MUTED');
 act(()=>button('RowsSolo').click());
 act(()=>grid.querySelector('[aria-label="Solo Drums"]').click());
 expect(grid.querySelector('[aria-label="Solo Drums"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('RowsSolo').click());
 act(()=>grid.querySelector('[aria-label="Select Drums sequencer"]').click());
 expect(container.querySelector('[aria-label="Arrangement"]')).toBeNull();
 expect(container.querySelector('[aria-label="Felt kick step 1"]')).toBeTruthy();
});
test('arrangement display buttons open the sequencer even in a row-action mode',()=>{
 act(()=>button('ViewArrange').click());
 act(()=>button('RowsMute').click());
 act(()=>container.querySelector('[aria-label="Lead sequencer display"]').click());
 expect(container.querySelector('[aria-label="Arrangement"]')).toBeNull();
 expect(container.querySelector('[aria-label="Progression editor"]')).toBeTruthy();
 expect(container.querySelector('[aria-label="C step 1"]')).toBeTruthy();
});
test('voice cards and their accessible labels open the corresponding sequencer without triggering on controls',()=>{
 const cards=container.querySelectorAll('.voice-card');
 act(()=>cards[0].click());
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Lead');
 act(()=>button('ViewArrange').click());
 act(()=>cards[1].querySelector('[aria-label="Open Second lead sequencer"]').click());
 expect(container.querySelector('[aria-label="Arrangement"]')).toBeNull();
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Second lead');
 act(()=>cards[2].querySelector('input[type="checkbox"]').click());
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Second lead');
});
test('mixer channel selection opens its sequencer, while non-sequencer channels leave it unchanged',()=>{
 const mixer=container.querySelector('[aria-label="Mixing desk"]');
 act(()=>button('ViewArrange').click());
 act(()=>mixer.querySelector('button[title^="Bass:"]').click());
 expect(container.querySelector('[aria-label="Arrangement"]')).toBeNull();
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Bass');
 act(()=>mixer.querySelector('button[title^="Ambience:"]').click());
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Bass');
 act(()=>mixer.querySelectorAll('.dk-strip')[5].querySelector('.sel').click());
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Drums');
 act(()=>mixer.querySelector('[aria-label="Channel"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
 expect(container.querySelector('.device-seq .device-head span').textContent).toContain('Bass');
});
test('changing progression count generates immediately before playback',()=>{
 const select=container.querySelector('.gb-head [aria-label="Progressions"]');
 expect(select.getAttribute('aria-valuetext')).toBe('4');
 act(()=>select.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(mocks.capture).toHaveBeenLastCalledWith(expect.objectContaining({progressions:8}));
 expect(container.querySelector('[aria-label="Progression editor"]')).toBeTruthy();
 expect(container.querySelector('[aria-label="Grid view: octave"]')).toBeNull();
 expect(container.querySelectorAll('[aria-label^="Grid view:"]')).toHaveLength(1);
});

test('restores visible surfaces and the selected generator bank without starting audio',async()=>{
 act(()=>{container.querySelector('[aria-controls="all-panel-generator"]').click();container.querySelector('[aria-controls="all-panel-ambience"]').click();button('Scope').click();container.querySelector('[aria-label="Setup"]').click();button('Control').click();});
 act(()=>button('Control').click());
 act(()=>{window.dispatchEvent(new Event('pagehide'));});
 expect(JSON.parse(localStorage.getItem('synths:all:visibility'))).toMatchObject({panels:{generator:true,ambience:true},scope:true,setup:true});
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<AllPage/>));
 expect(container.querySelector('[aria-controls="all-panel-generator"]').getAttribute('aria-expanded')).toBe('true');
 expect(container.querySelector('[aria-controls="all-panel-ambience"]').getAttribute('aria-expanded')).toBe('true');
 expect(button('Scope').getAttribute('aria-pressed')).toBe('true');
 expect(container.querySelector('[aria-label="Setup"]').getAttribute('aria-pressed')).toBe('true');
 expect(container.querySelector('.gb-title>span').textContent).toBe('Band');
 expect(container.querySelector('[aria-label="Oscilloscope and spectrum"]').dataset.audio).toBe('off');
 expect(mocks.scheduler.start).not.toHaveBeenCalled();
});

function responsivePlanner(host){
 host.g.planner=()=>({settings:{...host.g.settings},plan:new Map(),get meter(){return METERS[this.settings.meter];},planBar(bar){
  const tonic=this.settings.tonic??0;
  this.plan.set(bar,{bar,music:{tonic,mode:this.settings.mode??'Major-1',cycleStart:bar},nextMusic:{cycleStart:bar+1},chord:{name:'new root',pitchClasses:[tonic]},events:[{role:'lead',midi:60+tonic,beat:0,length:1,velocity:.8}]});
 }});
}
const turnGeneratorKey=async()=>{
 act(()=>container.querySelector('.gb-sections [aria-label="Scale"]').click());
 await act(async()=>{container.querySelector('.gb-knobs [aria-label="Key"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await new Promise(r=>setTimeout(r,380));});
};
test('queues a finite generator edit until the next unbooked sequence without stopping or rewinding',async()=>{
 const host=mocks.hosts.at(-1);responsivePlanner(host);
 await act(async()=>button('▶Play').click());
 mocks.scheduler.position={pattern:0,step:6,wrapped:false};
 const options=mocks.scheduler.options,old=options.pattern(options.bank().patterns[0]),oldStep=structuredClone(old.sequencers[0].pattern.steps[0]);
 await turnGeneratorKey();
 expect(mocks.scheduler.stop).not.toHaveBeenCalled();expect(mocks.scheduler.start).toHaveBeenCalledTimes(1);expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
 act(()=>window.dispatchEvent(new Event('pagehide')));expect(JSON.parse(localStorage.getItem('synths:all:state')).pendingGenerator).toBe(true);
 act(()=>options.beforeStep({pattern:0,step:7}));expect(options.pattern(options.bank().patterns[0]).sequencers[0].pattern.steps[0]).toEqual(oldStep);
 mocks.scheduler.position={pattern:1,step:0,wrapped:false};act(()=>options.beforeStep({pattern:1,step:0}));
 expect(options.pattern(options.bank().patterns[0]).sequencers[0].pattern.steps[0]).toEqual(oldStep);
 const next=options.pattern(options.bank().patterns[1]),events=options.events(next,0,{time:1,stepSec:.125,count:16,cycle:1});
 expect(events.find(e=>e.track===0).note).toBe(60+host.g.settings.tonic);
 expect(button('▶Play').getAttribute('aria-pressed')).toBe('true');expect(mocks.scheduler.position).toEqual({pattern:1,step:0,wrapped:false});
 act(()=>window.dispatchEvent(new Event('pagehide')));expect(JSON.parse(localStorage.getItem('synths:all:state')).pendingGenerator).toBe(false);
});
test('replaces continuous lookahead at the next boundary while a paused transport keeps its resume point',async()=>{
 await act(async()=>container.querySelector('[aria-label="Generator mode"]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
 responsivePlanner(mocks.hosts.at(-1));mocks.scheduler.stop.mockClear();
 await act(async()=>button('▶Play').click());act(()=>button('⏸Pause').click());
 mocks.scheduler.position={pattern:0,step:6,wrapped:false};const options=mocks.scheduler.options;
 await turnGeneratorKey();expect(options.bank().patterns).toHaveLength(5);
 expect(mocks.scheduler.stop).not.toHaveBeenCalled();expect(mocks.scheduler.resume).not.toHaveBeenCalled();
 await act(async()=>button('▶Play').click());expect(mocks.scheduler.resume).toHaveBeenCalledOnce();
 act(()=>options.beforeStep({pattern:0,step:6}));expect(options.bank().patterns).toHaveLength(5);
 mocks.scheduler.position={pattern:1,step:0,wrapped:false};act(()=>options.beforeStep({pattern:1,step:0}));
 expect(options.bank().patterns).toHaveLength(6);expect(mocks.scheduler.start).toHaveBeenCalledOnce();expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
 expect(mocks.scheduler.position).toEqual({pattern:1,step:0,wrapped:false});expect(button('▶Play').getAttribute('aria-pressed')).toBe('true');
});
test('restores an unapplied finite generator change and applies it on the first sequence',async()=>{
 responsivePlanner(mocks.hosts.at(-1));await turnGeneratorKey();act(()=>window.dispatchEvent(new Event('pagehide')));
 expect(JSON.parse(localStorage.getItem('synths:all:state')).pendingGenerator).toBe(true);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<AllPage/>));
 expect(mocks.scheduler.start).not.toHaveBeenCalled();act(()=>mocks.scheduler.options.beforeStep({pattern:0,step:0}));
 act(()=>window.dispatchEvent(new Event('pagehide')));expect(JSON.parse(localStorage.getItem('synths:all:state')).pendingGenerator).toBe(false);
});

const openSequenceScale=()=>act(()=>[...container.querySelectorAll('.seq-screen [role="tab"]')].find(t=>t.textContent==='Scale').click());
const turnSequence=async(label,key='ArrowRight')=>{
 await act(async()=>{container.querySelector(`[aria-label="Sequence ${label}"]`).dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));await new Promise(r=>setTimeout(r,300));});
};
const savedSong=()=>{act(()=>window.dispatchEvent(new Event('pagehide')));return JSON.parse(localStorage.getItem('synths:all:state')).project;};
test('sequencer scale edits transpose the whole finite song without regenerating or resetting playback and survive reload',async()=>{
 await act(async()=>button('▶Play').click());const old=savedSong(),captures=mocks.capture.mock.calls.length;
 openSequenceScale();await turnSequence('key');await turnSequence('mode');
 const next=savedSong();expect(next.key).toMatchObject({tonic:1,scaleId:'Major-2'});
 expect(next.patterns.lead.steps[16].n[0].d).toBe(4);expect(next.patterns.perc).toEqual(old.patterns.perc);
 const options=mocks.scheduler.options,p=options.pattern(options.bank().patterns[0]);
 expect(options.events(p,8,{time:1,stepSec:.125,count:8,cycle:0}).filter(e=>e.track===3).map(e=>e.note)).toEqual([61,64,68]);
 expect(mocks.capture).toHaveBeenCalledTimes(captures);expect(mocks.scheduler.stop).not.toHaveBeenCalled();expect(mocks.scheduler.start).toHaveBeenCalledOnce();expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
 expect(button('▶Play').getAttribute('aria-pressed')).toBe('true');
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<AllPage/>));
 expect(savedSong().patterns).toEqual(next.patterns);expect(container.querySelector('[aria-label="Sequence key"]').getAttribute('aria-valuetext')).toBe('C♯/D♭');
 expect(button('▶Play').getAttribute('aria-pressed')).toBe('false');
});
test('continuous sequencer transposition preserves history, edits every pitched voice in the current progression and replans future',async()=>{
 responsivePlanner(mocks.hosts.at(-1));await act(async()=>container.querySelector('[aria-label="Generator mode"]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
 const options=mocks.scheduler.options;act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label^="Lead, progression 2,"]').click());
 act(()=>button('ViewArrange').click());
 await act(async()=>button('▶Play').click());mocks.scheduler.position={pattern:1,step:4,wrapped:false};
 mocks.scheduler.stop.mockClear();mocks.scheduler.reposition.mockClear();
 const previous=options.pattern(options.bank().patterns[0]),first=structuredClone(previous.sequencers[0].pattern.steps.slice(0,16));
 openSequenceScale();await turnSequence('key');
 const bank=options.bank(),current=options.pattern(bank.patterns[1]),past=options.pattern(bank.patterns[0]);
 expect(past.sequencers[0].pattern.steps.slice(0,16)).toEqual(first);
 expect(options.events(current,0,{time:1,stepSec:.125,count:16,cycle:1}).find(e=>e.track===0).note).toBe(63);
 expect(options.events(options.pattern(bank.patterns[2]),0,{time:2,stepSec:.125,count:32,cycle:2}).find(e=>e.track===0).note).toBe(63);
 act(()=>container.querySelector('[aria-label="Grid view: octave"]')?.click());
 expect([...container.querySelectorAll('[aria-label="Progression editor"] .cell')].map(e=>e.getAttribute('aria-label'))).toContain('E♭ step 1');
 expect(mocks.scheduler.stop).not.toHaveBeenCalled();expect(mocks.scheduler.reposition).not.toHaveBeenCalled();
});

test('Spread arranges visible objects without changing the song and restores object poses and IDs locally',async()=>{
 const old=savedSong(),seq=container.querySelector('#all-panel-sequencer'),keyboard=container.querySelector('.keybox'),hidden=container.querySelector('#all-panel-generator');
 const seqId=seq.dataset.deskObjectId,keyId=keyboard.dataset.deskObjectId;
 expect(seqId).toMatch(/^obj-/);expect(keyId).toMatch(/^obj-/);expect(seqId).not.toContain('sequencer');
 for(const el of container.querySelectorAll('[data-desk-object-id]'))Object.defineProperties(el,{offsetWidth:{configurable:true,value:700},offsetHeight:{configurable:true,value:400}});
 act(()=>hidden.querySelector('.box-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 const hiddenPose={left:hidden.style.left,top:hidden.style.top,transform:hidden.style.transform};
 act(()=>button('Spread').click());expect(savedSong()).toEqual(old);expect(mocks.scheduler.stop).not.toHaveBeenCalled();
 expect(seq.style.left).toBe('0px');expect(seq.style.top).toBe('0px');expect(seq.style.transform).toBe('rotate(0deg)');
 expect({left:hidden.style.left,top:hidden.style.top,transform:hidden.style.transform}).toEqual(hiddenPose);
 act(()=>seq.querySelector('.box-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 act(()=>window.dispatchEvent(new Event('pagehide')));const pose={left:seq.style.left,top:seq.style.top,transform:seq.style.transform,zIndex:seq.style.zIndex};
 act(()=>root.unmount());
 // A desk object may legitimately sit below the current browser window.
 const layout=JSON.parse(localStorage.getItem('synths:all:objects'));layout.objects.find(o=>o.binding==='keyboard').pose.y=2400;localStorage.setItem('synths:all:objects',JSON.stringify(layout));
 root=createRoot(container);await act(async()=>root.render(<AllPage/>));
 const restored=container.querySelector('#all-panel-sequencer');expect(restored.dataset.deskObjectId).toBe(seqId);expect(container.querySelector('.keybox').dataset.deskObjectId).toBe(keyId);expect(container.querySelector('.keybox').style.top).toBe('2400px');
 expect({left:restored.style.left,top:restored.style.top,transform:restored.style.transform,zIndex:restored.style.zIndex}).toEqual(pose);
});
