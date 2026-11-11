import {it,expect,vi} from 'vitest';
const host=vi.hoisted(()=>({start:vi.fn()}));
vi.mock('../synths/engine/liveSynth',()=>({startLiveSynth:host.start}));
import ClassicsInstrument from '../app/engine/classicsInstrument';
import {SYNTHS} from '../synths/models';
import {compositeClassicStemTap} from '../synths/all/classicStemTap';
import {compileClassicCompositeNotes} from './classicCompiler';
const context={currentTime:0,createGain:()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()})};
async function fixture(light=false){
 const lives=[];host.start.mockImplementation(async o=>{let held=0;const l={sourceRevision:0,sourceInput:{slot:lives.length},rack:o.rack,noteOn:vi.fn(),noteOff:vi.fn(),pressure:vi.fn(),panic:vi.fn(),close:vi.fn(),captureSource:()=>({revision:l.sourceRevision,version:1,model:o.model,parameters:o.params.map(a=>a.slice()),polyphony:o.polyphony,controls:[]}),holdSourceInput:vi.fn(()=>{held++;let closed=false;return ()=>{if(!closed){closed=true;held--;}};}),get sourceHeld(){return held;}};lives.push(l);return l;});
 const preset={classics:{synth:'minimoog',values:{...SYNTHS.minimoog.presets[0].values},light,rack:{'master.enabled':1,'inserts.saturation':.4}}},instrument=await ClassicsInstrument.create({context,preset,polyphony:8});return {instrument,lives,tap:compositeClassicStemTap(instrument)};
}
const notes=[
 {midi:48,time:37/48000,duration:3,velocity:.6,expression:{pressure:.2}},
 {midi:52,time:37/48000,duration:2,velocity:.6},
 {midi:55,time:37/48000,duration:1,velocity:.7,expression:{pressure:.4}},
 {midi:60,time:37/48000,duration:.5,velocity:.5},
 {midi:64,time:.1,duration:.2,velocity:.8,detune:25,expression:{bend:.25,pressure:.6}},
 {midi:67,time:.3,duration:.4,velocity:.6},
 {midi:69,time:1.1,duration:.7,velocity:.5},
];
it('matches the actual four-kernel host allocator and routes global IDs, steals, pressure and fractional tuning per slot',async()=>{
 const {instrument,lives,tap}=await fixture(),compiled=compileClassicCompositeNotes(tap,notes,48000,{sourceIds:[1,5,7,8],otherSourceCount:4});
 for(const n of notes)instrument.scheduleNote(n.midi,n.time,n.duration,n.velocity,n.detune,n.expression);
 expect(compiled.allocation.map(a=>a.slot)).toEqual([0,1,2,3,3,3,2]);
 for(const [slot,l]of lives.entries()){
  const events=compiled.sources[slot].events;
  const on=events.filter(e=>e.event===0).map(e=>[e.id,e.a,e.b,e.frame]),off=events.filter(e=>e.event===1).map(e=>[e.id,e.frame]),pressure=events.filter(e=>e.event===3).map(e=>[e.id,e.a,e.frame]);
  expect(on).toEqual(l.noteOn.mock.calls.map(([id,m,v,t])=>[id,m,v,Math.round(t*48000)]));
  expect(off).toEqual(l.noteOff.mock.calls.map(([id,t])=>[id,Math.round(t*48000)]).sort((a,b)=>a[1]-b[1]));
  expect(pressure).toEqual(l.pressure.mock.calls.map(([id,p,t])=>[id,p,Math.round(t*48000)]));
  expect(events.every(e=>e.target===compiled.bindings[slot].sourceId&&e.owner===e.target)).toBe(true);
 }
 expect(tap.inputs).toEqual(lives.map(l=>l.sourceInput));expect(new Set(tap.inputs).size).toBe(4);
 expect(compiled.referenceGraph.modules.filter(m=>m.type==='legacy.classic')).toHaveLength(4);expect(compiled.referenceGraph.modules.filter(m=>m.type==='ref.mix')).toHaveLength(3);expect(compiled.tail).toBeGreaterThan(1);
 const before=JSON.stringify(compiled);tap.patch.slots[0].parameters[0][1]=999;expect(JSON.stringify(compiled)).toBe(before);
 instrument.dispose();
});
it('retains per-slot input leases, restores all slots idempotently and invalidates one-slot changes',async()=>{
 const {instrument,lives,tap}=await fixture(true);expect(lives).toHaveLength(2);const a=tap.activate(),b=tap.activate();expect(lives.map(l=>l.sourceHeld)).toEqual([2,2]);expect(instrument.effectsAwake()).toBe(true);a();a();expect(lives.map(l=>l.sourceHeld)).toEqual([1,1]);b();expect(lives.map(l=>l.sourceHeld)).toEqual([0,0]);expect(instrument.effectsAwake()).toBe(false);
 lives[1].sourceRevision++;expect(()=>tap.assertCurrent()).toThrow('stack changed');instrument.dispose();
});
it('cleans acquired gates if a later slot cannot lease and rejects excess combined outputs',async()=>{
 const {instrument,lives,tap}=await fixture();lives[2].holdSourceInput.mockImplementation(()=>{throw Error('slot unavailable');});expect(()=>tap.activate()).toThrow('unavailable');expect(lives.map(l=>l.sourceHeld)).toEqual([0,0,0,0]);expect(instrument.sourceInputs).toBe(0);
 expect(()=>compileClassicCompositeNotes(tap,notes,48000,{otherSourceCount:5})).toThrow('budget');expect(()=>compileClassicCompositeNotes(tap,notes,48000,{sourceIds:[1,2,2,4]})).toThrow('bindings');instrument.dispose();
});
it('replays a detached saved composite deterministically including equal-time receive order',async()=>{
 const {instrument,tap}=await fixture(true),source={patch:JSON.parse(JSON.stringify(tap.patch))},a=compileClassicCompositeNotes(source,notes),b=compileClassicCompositeNotes(source,notes);
 expect(b).toEqual(a);expect(a.allocation.slice(0,4).map(a=>a.slot)).toEqual([0,1,1,1]);expect(a.events.length).toBe(notes.length*2+3);instrument.dispose();
});
