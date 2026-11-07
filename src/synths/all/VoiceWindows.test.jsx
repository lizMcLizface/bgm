import React, {act} from 'react';
import {createRoot} from 'react-dom/client';

vi.mock('../ui/VoicePanel',()=>({VoicePanel:()=> <div data-testid="synth-panel"/>}));
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
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

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
