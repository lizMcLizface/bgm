import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import MonitorPedal from './MonitorPedal';
import {MONITOR_DEFAULTS} from './monitorModel';
vi.mock('./monitorDraw',()=>({drawMonitor:vi.fn()}));

let container,root,engine,requests,cancels;
function Harness(){const [configs,setConfigs]=useState(structuredClone(MONITOR_DEFAULTS));return <>{Object.keys(configs).map(kind=><MonitorPedal key={kind} kind={kind} config={configs[kind]} onChange={(id,p)=>setConfigs(c=>({...c,[id]:{...c[id],...p}}))} onClose={()=>{}} engine={engine} audio="on" positionKey={'test-'+kind} home={{x:0,y:0}}/>)}</>;}
const control=name=>container.querySelector(`[aria-label="${name}"]`),press=(name,key)=>act(()=>control(name).dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}))),click=name=>act(()=>control(name).click());
const advance=ms=>act(async()=>vi.advanceTimersByTimeAsync(ms));
function frame(end=16384){const left=Float32Array.from({length:16384},(_,i)=>.4*Math.sin(2*Math.PI*440*i/48000));return {left,right:Float32Array.from(left,v=>-v),end,rate:48000};}
beforeEach(async()=>{vi.useFakeTimers();globalThis.IS_REACT_ACT_ENVIRONMENT=true;requests=[];cancels=[];engine={current:{context:{sampleRate:48000},setRack:vi.fn(),requestStereoScope:vi.fn((n,cb,consumer)=>{requests.push({n,cb,consumer});const cancel=vi.fn();cancels.push(cancel);return cancel;})}};vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Harness/>));});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
it('runs independent stereo consumers, pauses one without changing audio, and cancels requests on unmount',async()=>{
 expect(requests.map(r=>r.consumer)).toEqual(['pedal:scope','pedal:spectrum']);act(()=>requests.forEach(r=>r.cb(frame())));expect(control('Scope readings').textContent).toContain('Corr -1.00');expect(control('Spectrum readings').textContent).toContain('Corr -1.00');
 click('Scope monitoring');const calls=engine.current.requestStereoScope.mock.calls.length;await advance(60);expect(requests.slice(calls).map(r=>r.consumer)).toEqual(['pedal:spectrum']);expect(control('Scope status').textContent).toBe('Paused');expect(engine.current.setRack).not.toHaveBeenCalled();expect(cancels[0]).toHaveBeenCalled();
 click('Scope monitoring');expect(requests.at(-1).consumer).toBe('pedal:scope');act(()=>root.unmount());root=createRoot(container);expect(cancels.at(-1)).toHaveBeenCalled();expect(cancels.at(-2)).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('captures once after arming and resumes only on re-arm, retaining every fitted knob',async()=>{
 const reply=end=>act(()=>requests.filter(r=>r.consumer==='pedal:scope').at(-1).cb(frame(end))),knobs=[...container.querySelectorAll('[data-monitor-id=scope] [role=slider]')];press('Scope · Mode','End');reply(16384);expect(control('Scope status').textContent).toBe('Armed');await advance(50);reply(18432);expect(control('Scope status').textContent).toBe('Captured');const count=requests.filter(r=>r.consumer==='pedal:scope').length;await advance(200);expect(requests.filter(r=>r.consumer==='pedal:scope')).toHaveLength(count);
 click('Scope arm capture');expect(control('Scope status').textContent).toBe('Armed');reply(1000000);expect(control('Scope status').textContent).toBe('Armed');await advance(50);reply(1002048);expect(control('Scope status').textContent).toBe('Captured');expect([...container.querySelectorAll('[data-monitor-id=scope] [role=slider]')]).toEqual(knobs);
});
