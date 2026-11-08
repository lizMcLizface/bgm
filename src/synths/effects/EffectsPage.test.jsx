import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const mocks=vi.hoisted(()=>({start:vi.fn(),midis:[]}));
vi.mock('../diy/live',()=>({startDiySynth:options=>mocks.start(options)}));
vi.mock('../ui/VoicePanel',async()=>{
 const {default:FloatingInstrumentCase}=await import('../ui/FloatingInstrumentCase');
 return {VoicePanel:({values,onChange,choose,bound})=><FloatingInstrumentCase object={bound.caseObject} className="diy diy-poly"><div aria-label="DI-Poly editor"><button onClick={()=>onChange({...values,'layers.0.cutoff':1234})}>Edit cutoff</button><button onClick={()=>choose({name:'Another dry source',values:{...values,'layers.0.cutoff':2345,'effects.reverb':.8}})}>Choose source patch</button></div></FloatingInstrumentCase>};
});
vi.mock('./MonitorPedal',()=>({default:({kind,audio,onClose,config,onChange})=><div aria-label={kind+' monitor'} data-audio={audio} data-paused={config.paused}><button onClick={onClose}>Close {kind}</button><button onClick={()=>onChange(kind,{paused:!config.paused})}>Pause {kind}</button></div>}));
vi.mock('../../labs/input',async()=>{const actual=await vi.importActual('../../labs/input');return {...actual,LabMidi:class extends actual.LabMidi{constructor(options){super(options);mocks.midis.push(this);}async connect(){if(navigator.requestMIDIAccess)return super.connect();this.onStatus([{id:'test',name:'Test keyboard'}]);}}};});
import EffectsPage from './EffectsPage';
import {DESK_STATE_KEY,DESK_OBJECTS_KEY,cleanEffectsState} from './deskState';
import {POLY} from '../diy/patches';
import {cleanRack} from './params';
import {RACK_CHANNEL} from './connection';
let container,root,engine,clients;
const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.getAttribute('aria-label')===name);
const input=(el,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));});
const key=(type,code)=>act(()=>window.dispatchEvent(new KeyboardEvent(type,{key:code==='KeyA'?'a':'s',code,bubbles:true})));
const saved=()=>{act(()=>window.dispatchEvent(new Event('pagehide')));return JSON.parse(localStorage.getItem(DESK_STATE_KEY));};
const flush=()=>act(async()=>{await Promise.resolve();});
beforeEach(async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});window.matchMedia??=()=>({matches:false});
 localStorage.clear();history.replaceState(null,'','/synths/effects/');mocks.midis=[];clients=[];
 vi.stubGlobal('BroadcastChannel',class{constructor(name){this.name=name;clients.push(this);}postMessage=vi.fn();close=vi.fn();});
 engine={context:{sampleRate:48000,resume:vi.fn(async()=>{})},latency:.01,setParams:vi.fn(),setRack:vi.fn(),noteOn:vi.fn(),noteOff:vi.fn(),control:vi.fn(),pressure:vi.fn(),panic:vi.fn(),close:vi.fn(async()=>{}),clearRack:vi.fn(),setRackInstances:vi.fn()};mocks.start.mockReset().mockResolvedValue(engine);
 localStorage.setItem(DESK_STATE_KEY,JSON.stringify(cleanEffectsState()));
 container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('anchors MIDI setup outside the desk and dismisses it with outside click or Escape without changing the layout',()=>{
 saved();
 const camera=localStorage.getItem('synths:effects:desk'),layout=JSON.parse(localStorage.getItem(DESK_OBJECTS_KEY));act(()=>button('MIDI / Setup').click());
 let dialog=document.querySelector('[role=dialog][aria-label=Setup]');expect(dialog.closest('.desk')).toBeNull();expect(dialog.hasAttribute('data-desk-item')).toBe(false);expect(dialog.style.position).toBe('fixed');expect(dialog.style.transform).toBe('');
 expect(button('MIDI / Setup').getAttribute('aria-expanded')).toBe('true');expect(dialog.id).toBe(button('MIDI / Setup').getAttribute('aria-controls'));
 expect(JSON.parse(localStorage.getItem(DESK_OBJECTS_KEY)).objects.find(o=>o.binding==='setup').visible).toBe(false);
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(document.querySelector('[role=dialog][aria-label=Setup]')).toBeNull();expect(document.activeElement).toBe(button('MIDI / Setup'));
 act(()=>button('MIDI / Setup').click());act(()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));expect(document.querySelector('[role=dialog][aria-label=Setup]')).toBeNull();
 expect(localStorage.getItem('synths:effects:desk')).toBe(camera);expect(JSON.parse(localStorage.getItem(DESK_OBJECTS_KEY)).objects.map(o=>o.pose)).toEqual(layout.objects.map(o=>o.pose));
});
it('automatically reconnects an approved MIDI keyboard after reload without starting audio, then plays through the saved channel',async()=>{
 act(()=>root.unmount());const descriptors=Object.fromEntries(['requestMIDIAccess','permissions'].map(k=>[k,Object.getOwnPropertyDescriptor(navigator,k)]));
 const input={id:'piano',name:'Saved piano',state:'connected'},access={inputs:new Map([['piano',input]])},request=vi.fn(async()=>access);
 Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:request});Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:vi.fn(async()=>({state:'granted'}))}});
 try{
  const state=JSON.parse(localStorage.getItem(DESK_STATE_KEY));state.setup.midiDevice='piano';state.setup.midiChannel='2';localStorage.setItem(DESK_STATE_KEY,JSON.stringify(state));root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
  expect(request).toHaveBeenCalledOnce();expect(mocks.start).not.toHaveBeenCalled();act(()=>button('MIDI / Setup').click());expect(document.querySelector('[role=dialog][aria-label=Setup]').textContent).toContain('1 MIDI input connected.');
  await act(async()=>input.onmidimessage({data:[145,64,100]}));expect(engine.noteOn).toHaveBeenCalledWith(expect.any(Number),64,expect.any(Number));
  act(()=>window.dispatchEvent(new Event('focus')));await flush();expect(request).toHaveBeenCalledOnce();
 }finally{for(const [key,descriptor] of Object.entries(descriptors))if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];}
});
it('opens fresh visits on the physical wet/dry rig with an 88-key bed, eight mixer inputs and the rack tucked away',async()=>{
 act(()=>root.unmount());localStorage.clear();root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
 const state=saved();expect(state.parallel).toBeTruthy();expect(state.setup).toMatchObject({keys:'show',keysSize:88});expect(state.parallel.mixer.strips.dry.mute).toBe(true);expect(state.patch.name).toBe('Starmap Void');
 expect(container.querySelectorAll('.effects-parallel-mixer .dk-strip')).toHaveLength(8);
 expect(container.querySelectorAll('.lab-piano button')).toHaveLength(88);
 expect(container.querySelector('.effects-rack-box')).toBeNull();expect(container.querySelector('.effects-output-box')).toBeNull();
 expect(container.querySelectorAll('[data-effect-id=delay]')).toHaveLength(2);expect(mocks.start).not.toHaveBeenCalled();
 act(()=>button('Rack').click());act(()=>button('Output').click());expect(container.querySelector('.effects-rack-box')).toBeTruthy();expect(container.querySelector('.effects-output-box')).toBeTruthy();
 const edited=saved();act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved()).toEqual(edited);
});
it('switches all seven desk sound buttons live without replacing routing or starting a new engine, then restores the choice',async()=>{
 await act(async()=>button('Start audio').click());const rack=structuredClone(saved().rack),instances=structuredClone(saved().instances),values=[];
 for(const name of ['Starmap Void','Chip Bass','Bell Lead','Pitched Rain','Warm Organ','Neon Blues Lead','LFO Motion']){
  act(()=>button(name).click());const state=saved();expect(state.patch.name).toBe(name);expect(button(name).getAttribute('aria-checked')).toBe('true');expect(state.rack).toEqual(rack);expect(state.instances).toEqual(instances);expect(state.patch.values['effects.reverb']).toBe(0);values.push(state.patch.values);
 }
 expect(new Set(values.map(v=>JSON.stringify(v))).size).toBe(7);expect(mocks.start).toHaveBeenCalledOnce();expect(engine.setParams).toHaveBeenCalled();expect(engine.close).not.toHaveBeenCalled();
 expect(saved().patch.values).toMatchObject({'layers.0.lfoRate':1.2,'layers.0.lfoFilter':1,'layers.0.lfoPwm':.16,'layers.0.lfo2Rate':.19,'layers.0.lfo2Filter':.4,'layers.0.lfo2Amp':.3});
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(button('LFO Motion').getAttribute('aria-checked')).toBe('true');expect(button('Start audio')).toBeTruthy();
});
it('opens a playable isolated desk without requesting audio or MIDI, and edits the live source and rack independently',async()=>{
 expect(container.querySelector('[aria-label="DI-Poly editor"]')).toBeTruthy();expect(button('Spread')).toBeTruthy();expect(mocks.start).not.toHaveBeenCalled();expect(mocks.midis).toHaveLength(1);
 localStorage.setItem('synths:all:state','preserved');localStorage.setItem('synths:desk','preserved-camera');
 await act(async()=>button('Start audio').click());expect(mocks.start).toHaveBeenCalledOnce();expect(mocks.start.mock.calls[0][0]).toMatchObject({kind:'poly'});
 act(()=>button('Edit cutoff').click());expect(engine.setParams).toHaveBeenLastCalledWith(expect.arrayContaining([[POLY.params.BY_KEY['layers.0.cutoff'].id,1234]]));
 act(()=>container.querySelector('[aria-label="Saturation · Drive"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));const rack=structuredClone(engine.setRack.mock.lastCall[0]);expect(rack['inserts.drive']).not.toBe(cleanRack()['inserts.drive']);
 act(()=>button('Choose source patch').click());expect(engine.setRack.mock.lastCall[0]).toEqual(rack);expect(saved().patch.values['effects.reverb']).toBe(0);
 act(()=>button('Reset layout').click());expect(localStorage.getItem('synths:all:state')).toBe('preserved');expect(localStorage.getItem('synths:desk')).toBe('preserved-camera');
});
it('cancels an initial key released before loading and plays a key still held when ready',async()=>{
 let resolve;mocks.start.mockImplementation(()=>new Promise(r=>resolve=r));key('keydown','KeyA');key('keyup','KeyA');key('keydown','KeyS');expect(mocks.start).toHaveBeenCalledOnce();
 await act(async()=>resolve(engine));expect(engine.noteOn).toHaveBeenCalledOnce();expect(engine.noteOn.mock.calls[0][1]).toBe(50);key('keyup','KeyS');expect(engine.noteOff).toHaveBeenCalledOnce();
});
it('routes MIDI notes, sustain and expression through the local performer',async()=>{
 await act(async()=>button('Start audio').click());const midi=mocks.midis[0];
 act(()=>{midi.message([144,64,90]);midi.message([176,64,127]);midi.message([176,11,60]);midi.message([128,64,0]);});
 expect(engine.noteOn).toHaveBeenCalledWith(expect.any(Number),64,expect.any(Number));expect(engine.noteOff).toHaveBeenCalled();expect(engine.control).toHaveBeenCalledWith(5,1);expect(engine.control).toHaveBeenCalledWith(3,60/127);
});
it('closes a late-loading engine after switching to remote and returns to the saved local desk stopped',async()=>{
 let resolve;mocks.start.mockImplementation(()=>new Promise(r=>resolve=r));act(()=>button('Edit cutoff').click());act(()=>button('Start audio').click());act(()=>button('Remote rack…').click());
 expect(container.querySelector('.effects-page')).toBeTruthy();await act(async()=>resolve(engine));expect(engine.close).toHaveBeenCalledOnce();expect(engine.noteOn).not.toHaveBeenCalled();
 await act(async()=>button('Local DI-Poly desk').click());expect(saved().patch.values['layers.0.cutoff']).toBe(1234);expect(button('Start audio')).toBeTruthy();expect(mocks.start).toHaveBeenCalledOnce();
});
it('can retry after initial or running engine failure without retaining a broken target',async()=>{
 mocks.start.mockRejectedValueOnce(new Error('No audio device'));await act(async()=>button('Start audio').click());expect(container.textContent).toContain('No audio device');
 await act(async()=>button('Start audio').click());expect(button('Stop audio')).toBeTruthy();act(()=>mocks.start.mock.lastCall[0].onError(new Error('Processor stopped')));expect(engine.close).toHaveBeenCalledOnce();expect(button('Start audio')).toBeTruthy();
 const next={...engine,close:vi.fn()};mocks.start.mockResolvedValue(next);await act(async()=>button('Start audio').click());expect(mocks.start).toHaveBeenCalledTimes(3);
});
it('restores local state and object IDs on reload without starting playback',async()=>{
 act(()=>button('Edit cutoff').click());const old=saved(),layout=JSON.parse(localStorage.getItem(DESK_OBJECTS_KEY));
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
 expect(saved()).toEqual(old);expect(JSON.parse(localStorage.getItem(DESK_OBJECTS_KEY)).objects.map(o=>o.id)).toEqual(layout.objects.map(o=>o.id));expect(mocks.start).not.toHaveBeenCalled();
});
it('hides the rack without changing routing or playback and persists its visibility',async()=>{
 await act(async()=>button('Start audio').click());const old=saved(),calls=engine.setRack.mock.calls.length;
 act(()=>button('Rack').click());expect(container.querySelector('.effects-rack-box')).toBeNull();expect(saved().rack).toEqual(old.rack);expect(saved().panels.rack).toBe(false);expect(engine.setRack).toHaveBeenCalledTimes(calls);expect(engine.close).not.toHaveBeenCalled();
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(container.querySelector('.effects-rack-box')).toBeNull();act(()=>button('Rack').click());expect(container.querySelector('.effects-rack-box')).toBeTruthy();
});
it('loads three parallel mixer inputs, edits two independent delays, and returns to the saved serial sound',async()=>{
 const serial=saved();await act(async()=>button('Start audio').click());act(()=>button('Parallel wet/dry preset').click());
 expect(container.querySelectorAll('.effects-parallel-mixer .dk-strip')).toHaveLength(8);act(()=>button('Rack').click());expect(container.querySelectorAll('[data-effect-id=delay]')).toHaveLength(2);
 expect(saved().patch.name).toBe('Starmap Void');expect(saved().parallel.buses.wet.order).toEqual(['zplane','chorus','vibrato','delay']);
 const vibrato=container.querySelector('[data-effect-instance="wet:vibrato"]');expect(vibrato).toBeTruthy();
 act(()=>vibrato.querySelector('[aria-label="Wet · Vibrato · Depth"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(saved().parallel.buses.wet.rack['vibrato.depth']).toBeGreaterThan(12);
 expect(container.querySelector('.rack-external-editor>b').textContent).toBe('Z-plane');
 const wet=container.querySelector('[data-effect-instance="wet:delay"]'),master=container.querySelector('[data-effect-instance="master:delay"]'),masterMs=saved().parallel.buses.master.rack['effects.delayMs'];
 act(()=>wet.querySelector('[aria-label="Wet · Delay · Time"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(saved().parallel.buses.wet.rack['effects.delayMs']).not.toBe(375);expect(saved().parallel.buses.master.rack['effects.delayMs']).toBe(masterMs);expect(master.dataset.deskObjectId).not.toBe(wet.dataset.deskObjectId);
 act(()=>wet.querySelector('[aria-label="Wet · Delay on/off"]').click());expect(saved().parallel.buses.wet.rack['switch.delay']).toBe(0);expect(saved().parallel.buses.master.rack['switch.delay']).toBe(1);
 act(()=>container.querySelector('.effects-parallel-mixer .dk-strip .mute').click());expect(saved().parallel.mixer.strips.dry.mute).toBe(false);expect(engine.setRack.mock.lastCall[2].mixer.strips.dry.mute).toBe(false);
 const sound=saved();act(()=>button('Rig layout').click());expect(saved().parallel).toEqual(sound.parallel);expect(saved().patch).toEqual(sound.patch);expect(saved().panels.rack).toBe(false);act(()=>button('Rack').click());
 const parallel=saved().parallel;act(()=>button('Rack').click());expect(container.querySelector('.effects-rack-box')).toBeNull();expect(saved().parallel).toEqual(parallel);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved().parallel).toEqual(parallel);expect(container.querySelector('.effects-rack-box')).toBeNull();expect(container.querySelectorAll('[data-effect-id=delay]')).toHaveLength(2);
 act(()=>button('Return to saved serial rack').click());expect(saved().parallel).toBeNull();expect(saved().rack).toEqual(serial.rack);expect(saved().instances).toEqual(serial.instances);
});
it('keeps legacy remote target links and sends edits only to the selected session',async()=>{
 act(()=>root.unmount());history.replaceState(null,'','/synths/effects/?target=b');root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
 expect(container.querySelector('.effects-page')).toBeTruthy();const channel=clients.at(-1);expect(channel.name).toBe(RACK_CHANNEL);
 act(()=>{for(const id of ['a','b'])channel.onmessage({data:{type:'state',id,name:'Poly '+id,values:cleanRack(),audio:'on'}});});
 expect(container.querySelector('[aria-label="Connected synth"]').value).toBe('b');act(()=>button('Bypass effects rack').click());expect(channel.postMessage).toHaveBeenLastCalledWith({type:'edit',target:'b',values:{'master.enabled':0}});expect(mocks.start).not.toHaveBeenCalled();
});
it('exports and imports the complete local desk atomically and leaves imported audio stopped',async()=>{
 let blob;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=vi.fn(value=>{blob=value;return 'blob:desk';});URL.revokeObjectURL=vi.fn();const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const upload=async text=>{const file=container.querySelector('input[type=file]');Object.defineProperty(file,'files',{configurable:true,value:[{name:'desk.json',size:text.length,text:async()=>text}]});await act(async()=>file.dispatchEvent(new Event('change',{bubbles:true})));};
 try{
  act(()=>button('Edit cutoff').click());act(()=>button('Save desk').click());
  const text=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});
  const data=JSON.parse(text);expect(data.format).toBe('calmbgm-effects-desk');data.workbench.objects.find(o=>o.binding==='source').pose={x:-120,y:200,angle:20};
  await act(async()=>button('Start audio').click());await upload('{');expect(engine.close).not.toHaveBeenCalled();expect(button('Stop audio')).toBeTruthy();
  await upload(JSON.stringify(data));expect(engine.close).toHaveBeenCalledOnce();expect(button('Start audio')).toBeTruthy();expect(saved().patch.values['layers.0.cutoff']).toBe(1234);
  const source=container.querySelector('.effects-source-box');expect(source.style.left).toBe('-120px');expect(source.style.transform).toBe('rotate(20deg)');expect(source.dataset.deskObjectId).toBe(data.workbench.objects.find(o=>o.binding==='source').id);expect(mocks.start).toHaveBeenCalledOnce();
 }finally{await act(async()=>{await new Promise(r=>setTimeout(r,1100));});URL.createObjectURL=create;URL.revokeObjectURL=revoke;click.mockRestore();}
});
it('cancels a phrase requested during startup when Panic is pressed',async()=>{
 let resolve;mocks.start.mockImplementation(()=>new Promise(r=>resolve=r));act(()=>container.querySelector('[aria-label="Audition phrases"] button').click());act(()=>button('Panic').click());
 await act(async()=>resolve(engine));await new Promise(r=>setTimeout(r,20));expect(engine.noteOn).not.toHaveBeenCalled();expect(container.querySelector('[aria-label="Audition phrases"] button').getAttribute('aria-pressed')).toBe('false');
});
it('keeps a new startup independent of an older cancelled load and applies the latest patch',async()=>{
 let resolveOld,resolveNew;mocks.start.mockImplementationOnce(()=>new Promise(r=>resolveOld=r)).mockImplementationOnce(()=>new Promise(r=>resolveNew=r));
 act(()=>button('Start audio').click());act(()=>button('Stop audio').click());act(()=>button('Start audio').click());act(()=>button('Edit cutoff').click());
 const old={...engine,close:vi.fn()};await act(async()=>resolveOld(old));expect(old.close).toHaveBeenCalledOnce();expect(engine.setParams).not.toHaveBeenCalled();
 await act(async()=>resolveNew(engine));expect(engine.setParams).toHaveBeenLastCalledWith(expect.arrayContaining([[POLY.params.BY_KEY['layers.0.cutoff'].id,1234]]));expect(button('Stop audio')).toBeTruthy();
});
it('keeps sound, routing and pose independent from closing, reopening and focusing an effect box',async()=>{
 await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=saturation]'),id=box.dataset.deskObjectId;
 const x=parseFloat(box.style.left),zoom=Number(container.querySelector('.desk').dataset.zoom),grip=box.querySelector('.effect-box-grip');
 const pointer=(type,cx,cy)=>act(()=>{const e=new MouseEvent(type,{button:0,bubbles:true,clientX:cx,clientY:cy});Object.defineProperty(e,'pointerId',{value:1});grip.dispatchEvent(e);});
 pointer('pointerdown',100,100);pointer('pointermove',180,140);pointer('pointerup',180,140);expect(parseFloat(box.style.left)).toBeCloseTo(x+80/zoom);
 act(()=>box.querySelector('.effect-box-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 const pose={left:box.style.left,top:box.style.top,transform:box.style.transform},rack=structuredClone(saved().rack),calls=engine.setRack.mock.calls.length;
 act(()=>button('Close Saturation editor').click());expect(container.querySelector('[data-effect-id=saturation]')).toBeNull();expect(saved().rack).toEqual(rack);expect(engine.setRack).toHaveBeenCalledTimes(calls);
 act(()=>button('Open Saturation').click());const reopened=container.querySelector('[data-effect-id=saturation]');expect(reopened.dataset.deskObjectId).toBe(id);expect({left:reopened.style.left,top:reopened.style.top,transform:reopened.style.transform}).toEqual(pose);
 const z=Number(reopened.style.zIndex);act(()=>button('Open Saturation').click());expect(Number(reopened.style.zIndex)).toBeGreaterThan(z);
 act(()=>button('Saturation on/off').click());expect(engine.setRack.mock.lastCall[0]['switch.saturation']).toBe(1);act(()=>button('Saturation on/off').click());expect(engine.setRack.mock.lastCall[0]['switch.saturation']).toBe(0);
});
it('removes and re-adds an effect through the rack while preserving its settings and object identity',()=>{
 const box=container.querySelector('[data-effect-id=saturation]'),id=box.dataset.deskObjectId;
 act(()=>container.querySelector('[aria-label="Saturation · Drive"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));const drive=saved().rack['inserts.drive'];
 act(()=>box.querySelector('.effect-box-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));const angle=box.style.transform;
 act(()=>button('Remove Saturation from chain').click());expect(container.querySelector('[data-effect-id=saturation]')).toBeNull();expect(saved().rack['inserts.drive']).toBe(drive);
 act(()=>{const select=container.querySelector('[aria-label="Add effect"]');select.value='saturation';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const next=container.querySelector('[data-effect-id=saturation]');expect(next.dataset.deskObjectId).toBe(id);expect(next.style.transform).toBe(angle);expect(saved().rack['inserts.drive']).toBe(drive);
});
it('edits and removes the two space faces independently, syncs delay and preserves the remaining reverb',async()=>{
 await act(async()=>button('Start audio').click());act(()=>button('Edit Delay').click());act(()=>button('Edit Reverb').click());
 expect(container.querySelector('[data-effect-id=delay]')).toBeTruthy();expect(container.querySelector('[data-effect-id=reverb]')).toBeTruthy();
 act(()=>container.querySelector('[aria-label="Delay · Send"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(engine.setRack.mock.lastCall[0]['effects.delay']).toBeGreaterThan(0);
 act(()=>container.querySelector('[aria-label="Reverb · Decay"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));const decay=engine.setRack.mock.lastCall[0]['effects.decay'];

 act(()=>container.querySelector('[aria-label="Delay · Sync"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(engine.setRack.mock.lastCall[0]['effects.delayMs']).toBe(600);expect(container.querySelector('[aria-label="Delay · Time"]').getAttribute('aria-disabled')).toBe('true');
 act(()=>button('Edit Delay').click());act(()=>button('Remove Delay from chain').click());expect(container.querySelector('[data-effect-id=delay]')).toBeNull();expect(container.querySelector('[data-effect-id=reverb]')).toBeTruthy();expect(saved().rack['effects.decay']).toBe(decay);
 act(()=>{const select=container.querySelector('[aria-label="Add effect"]');select.value='delay';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(container.querySelector('[data-effect-id=delay]')).toBeTruthy();expect(saved().rack['effects.decay']).toBe(decay);
});
it('updates chain neighbours on reorder without moving boxes, and restores effect views on reload',async()=>{
 const box=container.querySelector('[data-effect-id=saturation]'),pos={left:box.style.left,top:box.style.top},id=box.dataset.deskObjectId;
 act(()=>button('Move Saturation later').click());expect(container.querySelector('[aria-label="Saturation chain neighbours"]').textContent).toContain('Equalizer');expect({left:box.style.left,top:box.style.top}).toEqual(pos);
 act(()=>button('Edit Delay').click());saved();
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
 expect(container.querySelector('[data-effect-id=saturation]').dataset.deskObjectId).toBe(id);expect(container.querySelector('[aria-label="Delay · Sync"]')).toBeTruthy();expect(mocks.start).not.toHaveBeenCalled();
});
it('shows all active editors and hides them without changing the chain',()=>{
 const rack=saved().rack;act(()=>button('Show all boxes').click());expect(container.querySelectorAll('[data-effect-id]')).toHaveLength(8);act(()=>button('Hide boxes').click());expect(container.querySelectorAll('[data-effect-id]')).toHaveLength(0);expect(saved().rack).toEqual(rack);
});
it('arranges one of every effect for browsing without changing live routing, and restores the catalog on reload',async()=>{
 await act(async()=>button('Start audio').click());const rack=structuredClone(saved().rack),calls=engine.setRack.mock.calls.length;
 act(()=>button('Show every effect').click());
 const boxes=[...container.querySelectorAll('[data-effect-id]')];expect(boxes).toHaveLength(23);expect(new Set(boxes.map(b=>b.dataset.effectId)).size).toBe(23);
 for(const box of boxes){expect(box.querySelector('.effect-box-footer')).toBeNull();expect(box.textContent).not.toMatch(/Double-click|Legacy space/);expect(box.querySelector('.effect-box-grip .effect-box-route')).toBeTruthy();expect(box.querySelector('.effect-box-grip .effect-box-close')).toBeTruthy();}
 expect(container.querySelector('[data-effect-id=filter]').textContent).toContain('Not in chain');expect(saved().rack).toEqual(rack);expect(engine.setRack).toHaveBeenCalledTimes(calls);
 act(()=>button('Show every effect').click());expect(container.querySelectorAll('[data-effect-id]')).toHaveLength(23);
 const ids=boxes.map(b=>b.dataset.deskObjectId);saved();act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));
 expect([...container.querySelectorAll('[data-effect-id]')].map(b=>b.dataset.deskObjectId)).toEqual(ids);expect(saved().rack).toEqual(rack);expect(button('Start audio')).toBeTruthy();
 act(()=>button('Add Filter to rack').click());expect(saved().rack['master.chain']).not.toBe(rack['master.chain']);expect(container.querySelector('[data-effect-id=filter]').textContent).not.toContain('Not in chain');
 act(()=>button('Hide boxes').click());expect(container.querySelectorAll('[data-effect-id]')).toHaveLength(0);expect(saved().panels.catalog).toBe(false);
});
it('keeps the last audition clock after stopping a phrase so delay tails do not change time',async()=>{
 await act(async()=>container.querySelector('[aria-label="Audition phrases"] button').click());expect(saved().tempo).toBe(104);act(()=>button('Pause').click());expect(saved().tempo).toBe(104);expect(engine.close).not.toHaveBeenCalled();
});
it('keeps all seven EQ controls fixed, with no display, while edits/reset/reload reach the live rack',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());
 const box=container.querySelector('[data-effect-id=eq]'),controls=[...box.querySelectorAll('[role=slider]')];expect(controls).toHaveLength(7);expect(box.querySelector('.effect-face-screen')).toBeNull();expect(box.querySelector('.effect-plot')).toBeNull();
 const q=box.querySelector('[aria-label="Equalizer · Mid Q"]');act(()=>q.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));const savedQ=saved().rack['inserts.midQ'];expect(savedQ).toBeGreaterThan(.7);
 const gain=box.querySelector('[aria-label="Equalizer · Mid gain"]');act(()=>gain.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));expect(engine.setRack.mock.lastCall[0]['inserts.midGain']).toBe(12);expect([...box.querySelectorAll('[role=slider]')]).toEqual(controls);
 act(()=>gain.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));expect(saved().rack['inserts.midGain']).toBe(0);
 saved();act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved().rack['inserts.midQ']).toBe(savedQ);expect(container.querySelectorAll('[data-effect-id=eq] [role=slider]')).toHaveLength(7);expect(button('Start audio')).toBeTruthy();
});
it('edits the compressor display and direct pedal knobs without decorative screens, with every control on the fixed face',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());
 const comp=container.querySelector('[data-effect-id=compressor]');expect(comp.querySelector('[aria-label="Compressor · Threshold"]')).toBeTruthy();expect(comp.querySelector('[aria-label="Compressor · Ratio"]')).toBeTruthy();expect(comp.querySelector('[aria-label="Compressor · Output trim"]')).toBeTruthy();expect(comp.querySelectorAll('[role=slider]')).toHaveLength(7);
 for(const [id,label,key]of [['phaser','Rate','inserts.phaserRate'],['flanger','Depth','inserts.flangerDepth'],['chorus','Depth','inserts.chorusDepth'],['shimmer','Decay','shimmer.decay'],['tape','Wow','tape.wow'],['ring','Frequency','ring.freq'],['crusher','Bits','crusher.bits'],['tremolo','Depth','tremolo.depth'],['pitch','Fine','pitch.fine'],['width','Width','width.amount'],['limiter','Ceiling','limiter.ceiling'],['freeze','Length','freeze.length']]){
  const box=container.querySelector(`[data-effect-id=${id}]`),knob=box.querySelector(`[aria-label$=" · ${label}"]`);expect(knob).toBeTruthy();const old=saved().rack[key];act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(engine.setRack.mock.lastCall[0][key]).not.toBe(old);
  expect(box.querySelector('.effect-face-screen')).toBeNull();expect(box.querySelector('.effect-plot')).toBeNull();expect(box.querySelector('[aria-label$=" · Parameter"]')).toBeNull();
 }
 act(()=>button('Freeze · Hold').click());expect(saved().rack['freeze.hold']).toBe(1);
 expect(container.querySelector('[aria-label="Phaser · Stages"]')).toBeTruthy();act(()=>container.querySelector('[aria-label="Phaser · Stages"]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));expect(saved().rack['inserts.phaserStages']).toBe(12);
 saved();act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(button('Phaser more controls')).toBeUndefined();expect(container.querySelector('[aria-label="Phaser · Stages"]')).toBeTruthy();
});
it('switches the screenless filter knobs by mode and displays measured compressor reduction independently of timing controls',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=filter]');
 expect(box.querySelector('.effect-face-screen')).toBeNull();expect(box.querySelector('.effect-plot')).toBeNull();expect(box.querySelector('[aria-label="Filter · Low cut"]')).toBeTruthy();
 act(()=>box.querySelector('[aria-label="Filter · Type"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(saved().rack['filter.type']).toBe(1);expect(box.querySelector('[aria-label="Filter · Cutoff"]')).toBeTruthy();expect(box.querySelector('[aria-label="Filter · Q"]')).toBeTruthy();expect(box.querySelector('[aria-label="Filter · Low cut"]').getAttribute('aria-disabled')).toBe('true');expect(box.querySelector('[aria-label="Filter · Q"]').getAttribute('aria-disabled')).toBe('false');
 act(()=>mocks.start.mock.lastCall[0].onStats({active:1,peak:.1,reduction:-6,compressorInputDb:-12,limiterReduction:0}));
 const comp=container.querySelector('[data-effect-id=compressor]');expect(comp.querySelector('[aria-label="Compressor gain reduction"]').value).toBe(0);
 act(()=>button('Compressor on/off').click());act(()=>mocks.start.mock.lastCall[0].onStats({active:1,peak:.1,reduction:-6.5,compressorInputDb:-11,limiterReduction:0}));expect(comp.querySelector('[aria-label="Compressor gain reduction"]').value).toBe(6.5);expect(comp.querySelector('.plot-live')).toBeTruthy();
 act(()=>[...comp.querySelectorAll('[role=radio]')].find(b=>b.textContent==='Timing').click());expect(comp.querySelector('[aria-label="Compressor configured attack and release"]')).toBeTruthy();
});
it('uses local tap footswitches without changing the audition clock and persists the effect time',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());
 const now=vi.spyOn(performance,'now');let clock=1000;now.mockImplementation(()=>clock);
 try{
  const tempo=saved().tempo;act(()=>button('Delay tap tempo').click());clock=1500;act(()=>button('Delay tap tempo').click());
  expect(saved().rack['effects.delayMs']).toBe(500);expect(saved().rack['master.sync']).toBe(0);expect(saved().tempo).toBe(tempo);expect(engine.setRack.mock.lastCall[0]['effects.delayMs']).toBe(500);
  clock=2000;act(()=>button('Phaser tap tempo').click());clock=2500;act(()=>button('Phaser tap tempo').click());expect(saved().rack['inserts.phaserRate']).toBe(2);
  expect(container.querySelectorAll('[data-effect-id=delay] .effect-foot')).toHaveLength(2);expect(container.querySelectorAll('[data-effect-id=freeze] .effect-foot')).toHaveLength(2);
  saved();act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved().rack['effects.delayMs']).toBe(500);expect(saved().tempo).toBe(tempo);
 }finally{now.mockRestore();}
});
it('keeps parameter-bank hardware fixed and edits the selected reverb setting without twelve knobs',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=reverb]'),pot=box.querySelector('.bank-encoders .effect-knob [role=slider]');
 expect(box.querySelectorAll('[role=slider]')).toHaveLength(5);const select=box.querySelector('[aria-label="Reverb · Parameter"]');act(()=>select.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
 expect(box.querySelector('.bank-encoders .effect-knob [role=slider]')).toBe(pot);expect(pot.getAttribute('aria-label')).toBe('Reverb · Dry level');act(()=>pot.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));expect(engine.setRack.mock.lastCall[0]['effects.dry']).toBe(0);
 const main=box.querySelector('[aria-label="Reverb · Decay"]');expect(main.closest('.is-main-knob')).toBeTruthy();expect(main.title).toContain('Decay:');
});
it('engages a silent legacy modulation voicing from the footswitch and retains nonzero blend on bypass cycles',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=phaser]');expect(box.querySelector('[aria-label="Phaser · Mix"]')).toBeNull();expect(button('Phaser on/off').getAttribute('aria-pressed')).toBe('false');
 act(()=>button('Phaser on/off').click());const mix=saved().rack['inserts.phaser'];expect(mix).toBeGreaterThan(0);expect(engine.setRack.mock.lastCall[0]['inserts.phaser']).toBe(mix);
 act(()=>button('Phaser on/off').click());expect(saved().rack['switch.phaser']).toBe(0);act(()=>button('Phaser on/off').click());expect(saved().rack['inserts.phaser']).toBe(mix);
 for(const id of ['tremolo','crusher','ring','chorus','flanger'])expect(container.querySelector(`[data-effect-id=${id}] [aria-label$=" · Mix"]`)).toBeNull();
});
it('returns time displays to idle without replacing hardware or losing the selected parameter',()=>{
 vi.useFakeTimers();
 try{
  act(()=>button('Show every effect').click());const box=container.querySelector('[data-effect-id=reverb]'),select=box.querySelector('[aria-label="Reverb · Parameter"]'),pot=box.querySelector('.bank-encoders .effect-knob [role=slider]');
  expect(box.querySelector('[aria-label="Reverb idle display"]')).toBeTruthy();act(()=>select.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
  expect(box.querySelector('[role=radiogroup]')).toBeTruthy();const label=pot.getAttribute('aria-label');act(()=>vi.advanceTimersByTime(5001));
  expect(box.querySelector('[aria-label="Reverb idle display"]')).toBeTruthy();expect(box.querySelector('[aria-label="Reverb · Parameter"]')).toBe(select);expect(box.querySelector('.bank-encoders .effect-knob [role=slider]')).toBe(pot);expect(pot.getAttribute('aria-label')).toBe(label);
  act(()=>pot.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));expect(saved().rack['effects.dry']).toBe(0);expect(box.querySelector('[role=radiogroup]')).toBeTruthy();
 }finally{vi.useRealTimers();}
});
it('edits all four Z-plane side knobs and shape nodes without faders, retaining settings on reload',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=zplane]');expect(box.querySelector('input[type=range]')).toBeNull();expect(box.querySelectorAll('.zp-side-knobs [role=slider]')).toHaveLength(4);
 for(const [label,key]of [['Morph','morph'],['Shift','shift'],['Resonance','q'],['Mix','mix']]){const knob=box.querySelector(`[aria-label="Z-plane · ${label}"]`),old=saved().rack['zplane.'+key];act(()=>knob.dispatchEvent(new KeyboardEvent('keydown',{key:old===1?'ArrowDown':'ArrowUp',bubbles:true})));expect(engine.setRack.mock.lastCall[0]['zplane.'+key]).not.toBe(old);}
 const node=box.querySelector('[aria-label="Shape A node 1"]');act(()=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));const rack=structuredClone(saved().rack);expect(rack['zplane.a']).toBeGreaterThan(cleanRack()['zplane.a']);expect(engine.setRack.mock.lastCall[0]).toEqual(rack);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved().rack).toEqual(rack);expect(container.querySelectorAll('[data-effect-id=zplane] .zp-side-knobs [role=slider]')).toHaveLength(4);
});
it('adds and edits a boost instance, reorders it without moving its box, and restores the complete chain and gain',async()=>{
 act(()=>button('Show every effect').click());await act(async()=>button('Start audio').click());const box=container.querySelector('[data-effect-id=boost]'),id=box.dataset.deskObjectId,pose=box.style.left;
 act(()=>button('Add Clean Boost to rack').click());expect(saved().instances.compatibility).toBe('serial');expect(saved().instances.chain).toContain('boost');expect(engine.setRack.mock.lastCall[1].chain).toContain('boost');expect(saved().instances.instances.find(i=>i.id==='boost').enabled).toBe(true);
 act(()=>box.querySelector('[aria-label="Clean Boost · Gain"]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));expect(engine.setRack.mock.lastCall[1].instances.find(i=>i.id==='boost').params.gain).toBe(24);
 act(()=>button('Edit Clean Boost').click());act(()=>button('Move Clean Boost earlier').click());const state=saved();expect(state.instances.chain.indexOf('boost')).toBeLessThan(state.instances.chain.length-1);expect(box.style.left).toBe(pose);
 act(()=>button('Close Clean Boost editor').click());act(()=>button('Open Clean Boost').click());expect(container.querySelector('[data-effect-id=boost]').dataset.deskObjectId).toBe(id);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(saved().instances).toEqual(state.instances);expect(button('Start audio')).toBeTruthy();
 act(()=>button('Reset rack').click());expect(saved().instances.chain).not.toContain('boost');expect(saved().instances.instances.find(i=>i.id==='boost').params.gain).toBe(6);
});
it('restores independent monitor visibility and pause without editing the audio rack or starting playback',async()=>{
 await act(async()=>button('Start audio').click());const rack=structuredClone(saved().rack),instances=structuredClone(saved().instances),calls=engine.setRack.mock.calls.length;
 act(()=>button('Pause scope').click());act(()=>button('Spectrum').click());expect(saved().panels.spectrum).toBe(false);expect(saved().monitors.scope.paused).toBe(true);expect(saved().monitors.spectrum.paused).toBe(false);expect(saved().rack).toEqual(rack);expect(saved().instances).toEqual(instances);expect(engine.setRack).toHaveBeenCalledTimes(calls);
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<EffectsPage/>));expect(container.querySelector('[aria-label="scope monitor"]').dataset.paused).toBe('true');expect(container.querySelector('[aria-label="spectrum monitor"]')).toBeNull();expect(button('Start audio')).toBeTruthy();expect(mocks.start).toHaveBeenCalledOnce();
 act(()=>button('Show every effect').click());expect(container.querySelector('[aria-label="spectrum monitor"]')).toBeTruthy();
});
