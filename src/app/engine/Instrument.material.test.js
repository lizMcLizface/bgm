// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('../../audio/context',()=>({audioContext:{}}));
import Instrument from './Instrument.js';
function standIn(material='piano',backend='owned-rust') {
 const source={sync:vi.fn(),dispose:vi.fn()},preset={stringModel:material,pianoType:'felt',masterVolume:.3},morph={to:{...preset,pianoType:'electric'},timer:32},i={sourceBackend:backend,preset,morph,AC:{currentTime:12},voices:[{voiceId:7}],awake:[true],held:new Map([[9,{voiceId:7,index:0}]]),busyUntil:[Infinity],finishMorph:vi.fn(),updateChain:vi.fn(),updateEnvelopes:vi.fn(),set:vi.fn(),pianoSource:material==='piano'?source:null,pluckedSource:material==='plucked'?source:null};
 return {i,source,preset,morph};
}
it.each(['piano','plucked'])('refuses %s material replacement atomically for set/apply/morph',material=>{
 const {i,source,preset,morph}=standIn(material),next=material==='piano'?'plucked':'piano',voices=i.voices,held=i.held;
 expect(()=>Instrument.prototype.set.call(i,'stringModel',next)).toThrow('fresh instrument');
 expect(()=>Instrument.prototype.applyPreset.call(i,{masterVolume:.9,stringModel:next})).toThrow('fresh instrument');
 expect(()=>Instrument.prototype.morphTo.call(i,{masterVolume:.9,stringModel:next},3)).toThrow('fresh instrument');
 expect(i.preset).toBe(preset);expect(i.morph).toBe(morph);expect(i.voices).toBe(voices);expect(i.held).toBe(held);expect(i.held.get(9)).toEqual({voiceId:7,index:0});expect(i.busyUntil).toEqual([Infinity]);expect(i.finishMorph).not.toHaveBeenCalled();expect(i.set).not.toHaveBeenCalled();expect(i.updateChain).not.toHaveBeenCalled();expect(source.sync).not.toHaveBeenCalled();expect(source.dispose).not.toHaveBeenCalled();
});
it('preflights full-default application before any earlier parameter setters, including default oscillator material',()=>{const {i,preset}=standIn();expect(()=>Instrument.prototype.applyPreset.call(i,{masterVolume:.9})).toThrow('fresh instrument');expect(i.preset).toBe(preset);expect(i.set).not.toHaveBeenCalled();});
it('retains native material changes, same-material owned edits and first construction',()=>{
 const native=standIn('piano','native');native.i.morph=null;Instrument.prototype.set.call(native.i,'stringModel','plucked');expect(native.i.preset.stringModel).toBe('plucked');expect(native.i.updateChain).toHaveBeenCalledOnce();
 const owned=standIn();owned.i.morph=null;Instrument.prototype.set.call(owned.i,'pianoType','electric');expect(owned.i.preset).toMatchObject({stringModel:'piano',pianoType:'electric'});expect(owned.source.sync).toHaveBeenCalledOnce();
 const initial=standIn();initial.i.preset=null;Instrument.prototype.applyPreset.call(initial.i,{stringModel:'piano'});expect(initial.i.set).toHaveBeenCalledWith('stringModel','piano');
});
