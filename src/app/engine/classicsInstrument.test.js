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
it.each(['tr808','tr909','tr707','tr606'])('maps every common drum to a valid %s pad and falls back for missing tracks',async synth=>{
 const l=live();host.start.mockResolvedValue(l);
 const i=await ClassicsInstrument.create({context:ctx,preset:{classics:{synth,values:SYNTHS[synth].presets[0].values}}});
 for(let drum=0;drum<14;drum++)i.scheduleNote(drum,2,.1,.8);
 expect(l.noteOn).toHaveBeenCalledTimes(14);
 for(const [,note] of l.noteOn.mock.calls)expect(note).toBeGreaterThanOrEqual(36);
 i.hitTrack('not-a-track',6,3,.8);
 expect(l.noteOn).toHaveBeenLastCalledWith(15,i.drums[6],.8,3);
 i.dispose();
});
it('stacks single-voice kernels for chords on a monophonic synth',async()=>{
 const lives=[live(),live(),live(),live()];lives.forEach(l=>host.start.mockResolvedValueOnce(l));
 const i=await ClassicsInstrument.create({context:ctx,preset:{classics:{synth:'minimoog',values:{...SYNTHS.minimoog.presets[0].values}}},polyphony:8});
 expect(host.start).toHaveBeenCalledTimes(4);
 [48,52,55].forEach(n=>i.scheduleNote(n,2,1,.7));i.scheduleNote(60,3.5,1,.7);
 expect(lives.map(l=>l.noteOn.mock.calls.map(c=>c[1]))).toEqual([[48,60],[52],[55],[]]);
 i.silence();lives.forEach(l=>expect(l.panic).toHaveBeenCalledOnce());i.dispose();lives.forEach(l=>expect(l.close).toHaveBeenCalledOnce());
});
it('keeps the existing effect route awake for a nested owned-source lease and disposes once',async()=>{
 const release=vi.fn(),l={...live(),captureSource:vi.fn(()=>({version:1})),holdSourceInput:vi.fn(()=>release)};host.start.mockResolvedValue(l);
 const i=await ClassicsInstrument.create({context:ctx,preset:preset()});expect(i.captureSource()).toEqual({version:1});expect(i.effectsAwake()).toBe(false);
 const a=i.holdSourceInput(),b=i.holdSourceInput();expect(i.effectsAwake()).toBe(true);a();a();expect(release).toHaveBeenCalledTimes(1);expect(i.effectsAwake()).toBe(true);b();expect(i.effectsAwake()).toBe(false);
 i.held.set(1,l);expect(()=>i.holdSourceInput()).toThrow('keyboard');i.dispose();i.dispose();expect(l.close).toHaveBeenCalledOnce();expect(()=>i.captureSource()).toThrow('single-kernel');
});
it('refuses to collapse a mono stack into one source kernel',async()=>{
 const l={...live(),captureSource:vi.fn()};host.start.mockResolvedValue(l);const i=await ClassicsInstrument.create({context:ctx,preset:{classics:{synth:'minimoog',values:SYNTHS.minimoog.presets[0].values}},polyphony:8});expect(()=>i.captureSource()).toThrow('single-kernel');expect(l.captureSource).not.toHaveBeenCalled();i.dispose();
});
it('rolls back every completed owned mono-stack source when another source fails',async()=>{const a=live(),b=live(),factory=vi.fn();host.start.mockResolvedValueOnce(a).mockRejectedValueOnce(Error('second source failed')).mockResolvedValueOnce(b).mockRejectedValueOnce(Error('fourth source failed'));await expect(ClassicsInstrument.create({context:ctx,preset:{classics:{synth:'minimoog',values:SYNTHS.minimoog.presets[0].values}},polyphony:8,sourceNodeFactory:factory})).rejects.toThrow('second source failed');expect(a.close).toHaveBeenCalledOnce();expect(b.close).toHaveBeenCalledOnce();expect(host.start.mock.calls.every(([o])=>o.sourceNodeFactory===factory)).toBe(true);});

it('forwards the immutable rack dynamics factory and arms every live mono-stack rack only after resume',async()=>{
 const context={...ctx,state:'suspended'},factory=vi.fn(),lives=Array.from({length:4},()=>({...live(),armRuntime:vi.fn(async()=>{})}));lives.forEach(l=>host.start.mockResolvedValueOnce(l));
 const i=await ClassicsInstrument.create({context,preset:{classics:{synth:'minimoog',values:SYNTHS.minimoog.presets[0].values}},polyphony:8,rackDynamicsFactory:factory});
 expect(host.start.mock.calls.every(([o])=>o.rackDynamicsFactory===factory)).toBe(true);await i.armRuntime();expect(lives.every(l=>l.armRuntime.mock.calls.length===0)).toBe(true);context.state='running';await i.armRuntime();expect(lives.every(l=>l.armRuntime.mock.calls.length===1)).toBe(true);i.dispose();
});

it('awaits every owned disposal despite a synchronous owner failure and disconnects output immediately',async()=>{
 let finish;const pending=new Promise(r=>finish=r),output=ctx.createGain(),context={...ctx,createGain:()=>output},lives=Array.from({length:4},live);lives[0].close.mockImplementation(()=>{throw Error('first owner failed');});lives[1].close.mockReturnValue(pending);lives[2].close.mockRejectedValue(Error('third owner failed'));lives.forEach(l=>host.start.mockResolvedValueOnce(l));
 const i=await ClassicsInstrument.create({context,preset:{classics:{synth:'minimoog',values:SYNTHS.minimoog.presets[0].values}},polyphony:8}),disposed=i.dispose();expect(i.dispose()).toBe(disposed);expect(output.disconnect).toHaveBeenCalledOnce();expect(lives.every(l=>l.close.mock.calls.length===1)).toBe(true);let done=false;disposed.catch(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);finish();await expect(disposed).rejects.toMatchObject({message:'Classic instrument disposal failed',errors:[expect.objectContaining({message:'first owner failed'}),expect.objectContaining({message:'third owner failed'})]});expect(i.disposalError).toBeInstanceOf(AggregateError);
});
