import React, {act} from 'react';
import {createRoot} from 'react-dom/client';

vi.mock('../ui/VoicePanel',()=>({VoicePanel:()=> <div data-testid="synth-panel"><nav className="presets"><span>Instrument title</span><button>Patch</button><div role="spinbutton">Preset knob</div></nav></div>}));
vi.mock('../effects/RackCompact',()=>({default:({onClose})=> <div data-testid="rack"><button onClick={onClose}>Close rack</button></div>}));
vi.mock('../diy/LabPanels',()=>({default:({onClose})=> <div data-testid="tuner"><button onClick={onClose}>Close tuner</button></div>}));
vi.mock('../piano/PianoPage',()=>({
 PianoRig:()=> <div data-testid="piano"/>,
 PianoTuning:({onClose})=> <div data-testid="piano-tuner"><button onClick={onClose}>Close tuner</button></div>,
 DEFAULTS:{pianoType:'grand'},categoryOf:()=> 'grand',
}));
vi.mock('../iowa/IowaPage',()=>({IowaRig:()=> <div data-testid="iowa"/>}));
vi.mock('./host',()=>({NATIVE:{iowa:{presets:{}}}}));
import {VoiceWindow,panelHome} from './VoiceWindows';

globalThis.ResizeObserver??=class{observe(){}disconnect(){}};
let root,container;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();localStorage.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

it('opens the real generator synth editor and forwards keyboard edits to its role',()=>{
 const edit=vi.fn(),host={soundOf:()=>null,nativeOf:()=>null,loaded:{lead:{name:'Custom generator voice'}},g:{getRolePreset:()=>({gainAttack:.1,masterVolume:.5}),roles:{lead:{instrument:{}}}}};
 act(()=>root.render(<VoiceWindow role="lead" host={host} showSynth onEditNative={edit}/>));
 const volume=container.querySelector('[role="slider"][aria-label="Volume"]');
 expect(volume).toBeTruthy();
 act(()=>volume.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));
 expect(edit).toHaveBeenCalledWith('lead',{masterVolume:expect.any(Number)});
 expect(edit.mock.lastCall[1].masterVolume).toBeGreaterThan(.5);
});

it('opens and closes effects and tuning independently from the synth',()=>{
 const host={soundOf:()=>({synth:'poly',name:'test',values:{}}),nativeOf:()=>null,rackValues:()=>({}),g:{roles:{lead:{instrument:{}}}}};
 const closeFx=vi.fn(),closeTuning=vi.fn();
 const render=(showSynth,fx,tuning)=>act(()=>root.render(<VoiceWindow role="lead" index={0} host={host} showSynth={showSynth} fx={fx} tuning={tuning} onCloseFx={closeFx} onCloseTuning={closeTuning}/>));
 render(false,true,false);
 expect(container.querySelector('[data-testid="rack"]')).toBeTruthy();
 expect(container.querySelector('[data-testid="synth-panel"]')).toBeNull();
 expect(container.querySelector('[data-testid="tuner"]')).toBeNull();
 render(false,true,true);
 expect(container.querySelector('[data-testid="tuner"]')).toBeTruthy();
 expect(container.querySelector('[data-testid="synth-panel"]')).toBeNull();
 render(true,true,true);
 expect(container.querySelector('[data-testid="synth-panel"]')).toBeTruthy();
 act(()=>container.querySelector('[data-testid="rack"] button').click());
 expect(closeFx).toHaveBeenCalledOnce();
 act(()=>container.querySelector('[data-testid="tuner"] button').click());
 expect(closeTuning).toHaveBeenCalledOnce();
 render(true,false,false);
 expect(container.querySelector('[data-testid="synth-panel"]')).toBeTruthy();
 expect(container.querySelector('[data-testid="rack"]')).toBeNull();
 expect(container.querySelector('[data-testid="tuner"]')).toBeNull();
});

it('positions panels around the measured sequencer and rack',()=>{
 const seq={x:100,y:700,w:1200,h:500};
 expect(panelHome('synth',seq,{w:1600,h:400})).toEqual({x:-300,y:268});
 expect(panelHome('synth',seq,{w:800,h:400})).toEqual({x:300,y:268});
 expect(panelHome('effects',seq,{w:700,h:400})).toEqual({x:-632,y:750});
 expect(panelHome('tuning',{x:-632,y:750,w:700,h:400},{w:500,h:300})).toEqual({x:-532,y:1182});
 expect(panelHome('synth',seq,{w:0,h:400})).toBeNull();
});

it('moves synth popups by their visible chrome or title without stealing preset controls',()=>{
 const host={soundOf:()=>({synth:'poly',name:'test',values:{}}),nativeOf:()=>null,g:{roles:{lead:{instrument:{}}}}};
 act(()=>root.render(<VoiceWindow role="lead" host={host} showSynth/>));
 const popup=container.querySelector('.all-win'),grip=container.querySelector('.rig-grip');
 expect(grip.textContent).toContain('Lead synth');
 const event=(node,type,x,y)=>act(()=>{const e=new MouseEvent(type,{button:0,bubbles:true,clientX:x,clientY:y});Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:'mouse'}});node.dispatchEvent(e);});
 const drag=(node,dx,dy)=>{event(node,'pointerdown',100,100);event(node,'pointermove',100+dx,100+dy);event(node,'pointerup',100+dx,100+dy);};
 drag(grip,80,40);expect(popup.style.left).toBe('80px');expect(popup.style.top).toBe('40px');
 drag(container.querySelector('.presets>span'),30,10);expect(popup.style.left).toBe('110px');expect(popup.style.top).toBe('50px');
 drag(container.querySelector('.presets>button'),20,20);drag(container.querySelector('[role=spinbutton]'),20,20);
 expect(popup.style.left).toBe('110px');expect(popup.style.top).toBe('50px');
 expect(JSON.parse(localStorage.getItem('synths:all:win-lead'))).toEqual({x:110,y:50});
});

it('keeps the same object identity and pose when a voice changes from DI-Poly to piano and reopens',async()=>{
 const {DeskObjectsProvider}=await import('../ui/WorkbenchObjects'),{createDeskObjects}=await import('../ui/deskObjects');
 const store=createDeskObjects({storageKey:'test:voice-objects',definitions:[{binding:'instrument:lead',keys:['synths:all:win-lead'],kind:'instrument',label:'Lead',visible:true}]});
 let piano=false;const host={soundOf:()=>piano?null:{synth:'poly',name:'test',values:{}},nativeOf:()=>piano?{synth:'piano',name:'Grand',preset:{}}:null,rackValues:()=>({}),g:{roles:{lead:{instrument:{}}}}};
 const render=show=>act(()=>root.render(<DeskObjectsProvider store={store}><VoiceWindow role="lead" host={host} showSynth={show}/></DeskObjectsProvider>));
 render(true);const id=container.querySelector('.all-win').dataset.deskObjectId;
 const doc=store.snapshot();doc.objects[0].pose={x:240,y:360,angle:25};doc.objects[0].z=150;
 act(()=>store.restore(doc));piano=true;render(true);
 expect(container.querySelector('[data-testid="piano"]')).toBeTruthy();expect(container.querySelector('.all-win').dataset.deskObjectId).toBe(id);
 expect(container.querySelector('.all-win').style.left).toBe('240px');expect(container.querySelector('.all-win').style.transform).toBe('rotate(25deg)');
 render(false);render(true);expect(container.querySelector('.all-win').dataset.deskObjectId).toBe(id);expect(container.querySelector('.all-win').style.zIndex).toBe('150');
});
