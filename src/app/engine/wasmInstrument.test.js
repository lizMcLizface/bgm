const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../labs/voice',()=>({LabVoice:{create:state.create}}));
import WasmInstrument from './wasmInstrument';
const ctx={currentTime:0,createGain:()=>({connect:vi.fn(),disconnect:vi.fn()})};
const voice=()=>({connect:vi.fn(),dispose:vi.fn(),panic:vi.fn(),on:vi.fn(()=>7),off:vi.fn(),schedule:vi.fn(),spec:{kind:'legacy'},native:{setWander:vi.fn()},keys:new Map()});
beforeEach(()=>state.create.mockReset());
it('cancels a released manual note and a stopped scheduled note while a source is loading',async()=>{
 const a=voice(),b=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});let resolve;state.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));i.applyPreset({stringModel:'piano'});const id=i.startNote(60,.7);i.stopNote(id);i.scheduleNote(64,1,1,.7);i.silence();resolve(b);await i.ready;await Promise.resolve();expect(b.on).not.toHaveBeenCalled();expect(b.schedule).not.toHaveBeenCalled();i.dispose();
});
it('preserves a newer preset when older async source preparation finishes last',async()=>{
 const a=voice(),b=voice(),c=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});let resolve;state.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));i.applyPreset({stringModel:'piano'});state.create.mockResolvedValueOnce(c);i.applyPreset({fmIndex:2});await i.ready;resolve(b);await Promise.resolve();expect(i.voice).toBe(c);expect(b.dispose).toHaveBeenCalled();expect(state.create.mock.calls[1][1].kind).toBe('legacy');expect(state.create.mock.calls[2][1].kind).toBe('fm');i.dispose();
});
it('retains the working voice if source creation fails',async()=>{
 const a=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});state.create.mockRejectedValueOnce(Error('unavailable'));const log=vi.spyOn(console,'error').mockImplementation(()=>{});i.applyPreset({fmIndex:2});await i.ready;expect(i.voice).toBe(a);expect(i.error.message).toBe('unavailable');expect(a.dispose).not.toHaveBeenCalled();i.dispose();log.mockRestore();
});
it('plays a still-held key on the latest source after overlapping preset loads settle',async()=>{
 const a=voice(),b=voice(),c=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});let first,last;state.create.mockImplementationOnce(()=>new Promise(r=>{first=r;}));i.applyPreset({stringModel:'piano'});const id=i.startNote(60,.7);state.create.mockImplementationOnce(()=>new Promise(r=>{last=r;}));i.applyPreset({fmIndex:2});first(b);await Promise.resolve();expect(a.on).not.toHaveBeenCalled();last(c);await i.ready;await Promise.resolve();expect(c.on).toHaveBeenCalledWith(60,.7);i.stopNote(id);expect(c.off).toHaveBeenCalledWith(7);i.dispose();
});
