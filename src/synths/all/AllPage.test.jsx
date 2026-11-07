import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeKey } from '../../seq/harmony';

// the desk the page sits on measures itself with a ResizeObserver, which jsdom does not have
globalThis.ResizeObserver??=class{observe(){}unobserve(){}disconnect(){}};
window.matchMedia??=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});

const mocks = vi.hoisted(() => ({ scheduler: null, capture: vi.fn() }));
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
  createHost: () => ({
   settings:{seed:1}, loaded:{}, context:{currentTime:0}, g:{AC:{outputLatency:0},roles:{}},
   wake:async()=>{}, applySceneVoices:()=>{}, dispose:()=>{}, note:()=>{},drum:vi.fn(),
   capture:(options)=>{mocks.capture(options);return {
    bars:2,stepsPerBar:16,bpm:90,key:makeKey(),chords:[{bar:0,name:'C',pitchClasses:[0,4,7],scalePcs:[0,2,4,5,7,9,11]},{bar:1,name:'G',pitchClasses:[7,11,2],scalePcs:[0,2,4,5,7,9,11]}],
    progressions:[{startBar:0,bars:1},{startBar:1,bars:1}],
    patterns:{lead:{mode:'note',follow:'scale',length:32,steps:[{n:[{d:0}]},...Array(15).fill(null),{n:[{d:4}]},...Array(15).fill(null)]},pad:{mode:'poly',follow:'scale',length:32,steps:[...Array(8).fill(null),{n:[{d:0,chordSource:{group:'pad:0',root:0,style:'sustain'}},{d:2,chordSource:{group:'pad:0',root:0,style:'sustain'}},{d:4,chordSource:{group:'pad:0',root:0,style:'sustain'}}],len:4},...Array(23).fill(null)]},perc:{mode:'drums',length:32,steps:[{hits:[{drum:0,velocity:.8,duration:1}]},...Array(31).fill(null)]}},
   };},
  }),
 };
});
import AllPage from './AllPage';

let root, container;
const button = name => [...container.querySelectorAll('button')].find(x => x.textContent.trim() === name);
beforeEach(() => {
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 localStorage.clear();
 mocks.capture.mockClear();
 container = document.createElement('div'); document.body.append(container);
 root = createRoot(container);
 act(() => root.render(<AllPage/>));
});
afterEach(() => {
 act(() => root.unmount());
 container.remove();
 delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('selects progression loops, switches to arrangement playback, and applies sequencer solo', async () => {
 expect(mocks.capture).toHaveBeenCalledWith({progressions:4});
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
 const grid=container.querySelector('[aria-label="Progression editor"]');
 act(()=>button('LayerEdit').click());
 act(()=>grid.querySelector('[aria-label="C step 1"]').click());
 expect([...container.querySelectorAll('[role="tab"]')].map(t=>t.textContent)).toEqual(['Note','','','','']);
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
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
 act(()=>button('ViewArrange').click());
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

test('selects a sequencer in arrangement, transposes the grid view, and preserves stacked octave notes', async () => {
 expect(container.querySelector('[aria-label="Sequencer select"]')).toBeNull();
 expect(container.querySelector('.stack-mode')).toBeNull();
 expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
 act(()=>button('ViewArrange').click());
 act(()=>container.querySelector('[aria-label="Select Lead sequencer"]').click());
 act(()=>button('ViewArrange').click());
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
 act(()=>grid.querySelector('[aria-label="Select Lead sequencer"]').click());
 expect(grid.querySelector('[aria-label="Select Lead sequencer"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('RowsMute').click());
 act(()=>grid.querySelector('[aria-label="Mute Lead"]').click());
 expect(grid.querySelector('[aria-label="Mute Lead"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('RowsMute').click());
 act(()=>grid.querySelector('[aria-label="Select Drums sequencer"]').click());
 expect(grid.querySelector('[aria-label="Select Drums sequencer"]').getAttribute('aria-pressed')).toBe('true');
 expect(grid.querySelector('[aria-label="Lead sequencer display"]').textContent).toContain('MUTED');
 act(()=>button('RowsSolo').click());
 act(()=>grid.querySelector('[aria-label="Solo Drums"]').click());
 act(()=>button('RowsSolo').click());
 expect(grid.querySelector('[aria-label="Select Drums sequencer"]').getAttribute('aria-pressed')).toBe('true');
 act(()=>button('ViewArrange').click());
 expect(container.querySelector('[aria-label="Felt kick step 1"]')).toBeTruthy();
});
test('changing progression count generates immediately before playback',()=>{
 const select=container.querySelector('select[aria-label="Progressions"]')??[...container.querySelectorAll('select')].find(x=>x.parentElement.textContent.includes('Progressions'));
 expect(select.value).toBe('4');
 act(()=>{select.value='8';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(mocks.capture).toHaveBeenLastCalledWith(expect.objectContaining({progressions:8}));
 expect(container.querySelector('[aria-label="Progression editor"]')).toBeTruthy();
 expect(container.querySelector('[aria-label="Grid view: octave"]')).toBeNull();
 expect(container.querySelectorAll('[aria-label^="Grid view:"]')).toHaveLength(1);
});
