const host=vi.hoisted(()=>({start:vi.fn()}));
vi.mock('../../synths/engine/liveSynth',()=>({startLiveSynth:host.start}));
import ClassicsInstrument from './classicsInstrument';
import {SYNTHS} from '../../synths/models';

const ctx={currentTime:1,createGain:()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()})};
const live=()=>({noteOn:vi.fn(),noteOff:vi.fn(),pressure:vi.fn(),setParams:vi.fn(),setRack:vi.fn(),panic:vi.fn(),close:vi.fn()});
const preset=()=>({classics:{synth:'prophet5',values:{...SYNTHS.prophet5.presets[0].values},light:true},masterVolume:.4});
beforeEach(()=>{host.start.mockReset();});
it('routes into the supplied context and destination and enforces the role voice budget on edits',async()=>{
 const l=live();host.start.mockResolvedValue(l);const i=await ClassicsInstrument.create({context:ctx,preset:preset(),polyphony:2});
 const options=host.start.mock.calls[0][0],ids=SYNTHS.prophet5.params.BY_KEY;
 expect(options.context).toBe(ctx);expect(options.destination).toBe(i.output);expect(options.params.find(([id])=>id===ids.voices.id)[1]).toBe(2);expect(i.output.gain.value).toBe(.4);
 i.setValues({...preset().classics.values,voices:16,oversample:1});const pairs=l.setParams.mock.calls[0][0];expect(pairs.find(([id])=>id===ids.voices.id)[1]).toBe(2);expect(pairs.find(([id])=>id===ids.oversample.id)[1]).toBe(0);
 i.dispose();expect(l.close).toHaveBeenCalledOnce();
});
it('books exact note pairs with distinct ids, per-note detune, bend, pressure and gate',async()=>{
 const l=live();host.start.mockResolvedValue(l);const i=await ClassicsInstrument.create({context:ctx,preset:preset()});
 i.scheduleNote(60,3,2,.8,25,{bend:.5,gateScale:.9,pressure:.4});i.scheduleNote(64,3,1,.6);
 expect(l.noteOn.mock.calls).toEqual([[1,60.75,.8,3],[2,64,.6,3]]);expect(l.noteOff.mock.calls).toEqual([[1,4.8],[2,4]]);expect(l.pressure).toHaveBeenCalledWith(1,.4,3);
 i.silence();expect(l.panic).toHaveBeenCalledOnce();
});
it('disconnects an incomplete role when loading fails without closing the shared context',async()=>{
 const output=ctx.createGain(),context={...ctx,createGain:()=>output,close:vi.fn()};host.start.mockRejectedValue(Error('unavailable'));
 await expect(ClassicsInstrument.create({context,preset:preset()})).rejects.toThrow('unavailable');expect(output.disconnect).toHaveBeenCalledOnce();expect(context.close).not.toHaveBeenCalled();
});
it('plays the generator drums on a drum machine’s pads, at the kit level, skipping drums that are off',async()=>{
 const l=live();host.start.mockResolvedValue(l);
 const i=await ClassicsInstrument.create({context:ctx,preset:{classics:{synth:'tr909',values:{...SYNTHS.tr909.presets[0].values}}},polyphony:16});
 i.setKit({kick:{on:true,level:.5},hat:{on:false,level:1}});
 i.scheduleNote(0,2,.1,.8);i.scheduleNote(4,2,.1,.8);i.scheduleNote(7,2.5,.1,.6);
 expect(l.noteOn.mock.calls).toEqual([[1,36,.4,2],[2,42,.6,2.5]]);expect(l.noteOff.mock.calls).toEqual([[1,2.05],[2,2.55]]);
});
it('stacks single-voice kernels for chords on a monophonic synth',async()=>{
 const lives=[live(),live(),live(),live()];lives.forEach(l=>host.start.mockResolvedValueOnce(l));
 const i=await ClassicsInstrument.create({context:ctx,preset:{classics:{synth:'minimoog',values:{...SYNTHS.minimoog.presets[0].values}}},polyphony:8});
 expect(host.start).toHaveBeenCalledTimes(4);
 [48,52,55].forEach(n=>i.scheduleNote(n,2,1,.7));i.scheduleNote(60,3.5,1,.7);
 expect(lives.map(l=>l.noteOn.mock.calls.map(c=>c[1]))).toEqual([[48,60],[52],[55],[]]);
 i.silence();lives.forEach(l=>expect(l.panic).toHaveBeenCalledOnce());i.dispose();lives.forEach(l=>expect(l.close).toHaveBeenCalledOnce());
});
