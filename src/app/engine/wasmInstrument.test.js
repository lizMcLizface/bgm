const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../labs/voice',()=>({LabVoice:{create:state.create}}));
import WasmInstrument from './wasmInstrument';
import {WASM_PRESETS} from '../../synth-lab/voiceLibrary';
const ctx={currentTime:0,createGain:()=>({connect:vi.fn(),disconnect:vi.fn()})};
const voice=()=>({connect:vi.fn(),dispose:vi.fn(),panic:vi.fn(),on:vi.fn(()=>7),off:vi.fn(),schedule:vi.fn(),spec:{kind:'legacy'},native:{setWander:vi.fn()},keys:new Map()});
beforeEach(()=>state.create.mockReset());
it('removes native Wasm space only when it is assigned to the mixer',()=>{
 const preset=Object.values(WASM_PRESETS)[0];
 const original=new WasmInstrument(ctx,preset,8).spec();
 const moved=new WasmInstrument(ctx,{...preset,mixerSpaceMoved:true},8).spec();
 expect(original.patch.effects.reverb).toBeGreaterThan(0);
 expect(moved.patch.effects).toMatchObject({reverb:0,delay:0,delayToReverb:0});
});
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

it('keeps shared-room endpoints stable across shared and private preset replacements',async()=>{
 const a={...voice(),roomOutput:{connect:vi.fn()},sharedRoomInput:{}},b=voice(),pool={};state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx,roomPool:pool});expect(state.create.mock.calls[0][2].roomPool).toBe(pool);expect(a.roomOutput.connect).toHaveBeenCalledWith(i.roomOutput);expect(i.roomInput.connect).toHaveBeenCalledWith(a.sharedRoomInput);const output=i.roomOutput,input=i.roomInput;state.create.mockResolvedValueOnce(b);i.applyPreset({});await i.ready;expect(i.roomInput).toBe(input);expect(i.roomOutput).toBe(output);expect(input.disconnect).toHaveBeenCalledTimes(2);expect(a.dispose).toHaveBeenCalledTimes(1);i.dispose();
});

it('retains runtime processor errors after a preset replacement succeeds',async()=>{
 state.create.mockResolvedValueOnce(voice());const i=await WasmInstrument.create({context:ctx});state.create.mockResolvedValueOnce(voice());i.applyPreset({fmIndex:2});await i.ready;
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});try{state.create.mock.calls.at(-1)[2].onError(Error('processor failed'));expect(i.error.message).toBe('processor failed');}finally{log.mockRestore();i.dispose();}
});

it('retunes held notes, including notes still waiting for a source',async()=>{
 const a={...voice(),backend:{retune:vi.fn()}},b={...voice(),backend:{retune:vi.fn()}};
 state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});
 let resolve;state.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));i.applyPreset({fmIndex:2});
 const id=i.startNote(60,.7);i.retuneNote(id,60.2);resolve(b);await i.ready;await Promise.resolve();
 expect(b.on).toHaveBeenCalledWith(60.2,.7);
 i.retuneNote(id,60.3,.03);expect(b.backend.retune).toHaveBeenCalledWith(7,60.3,.03);
 i.stopNote(id);i.dispose();
});
it('retains a context-bound runtime environment through native-source and core rebuilds',async()=>{const env={version:1,profile:'owned-active-host-v1',context:ctx,roleWanderFactory:()=>{},iowaSourceBackend:'owned-rust',voiceFxOptions:{compressorFactory:()=>{}},instrumentOptions:()=>({sourceBackend:'native',voiceCompressorFactory:()=>{}}),prepareContext:async()=>{}},a=voice(),b=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx,preset:{stringModel:'piano'},audioEnvironment:env});expect(state.create.mock.calls.at(-1)[2].audioEnvironment).toBe(env);expect(JSON.stringify(state.create.mock.calls.at(-1)[1])).not.toContain('audioEnvironment');state.create.mockResolvedValueOnce(b);i.applyPreset({fmIndex:2});await i.ready;expect(state.create.mock.calls.at(-1)[2].audioEnvironment).toBe(env);i.dispose();});

it('rebuilds legacy sources when an editor change crosses owned piano eligibility and rolls back failure',async()=>{
 const compressor=()=>{},env={version:1,profile:'owned-active-host-v1',context:ctx,roleWanderFactory:()=>{},iowaSourceBackend:'owned-rust',voiceFxOptions:{compressorFactory:compressor},instrumentOptions:p=>({sourceBackend:p.stringModel==='piano'?'owned-rust':'native',voiceCompressorFactory:compressor}),prepareContext:async()=>{}};
 const a=voice(),b=voice();a.native={...a.native,sourceBackend:'native',set:vi.fn()};b.native={...b.native,sourceBackend:'owned-rust',set:vi.fn()};
 state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx,preset:{stringModel:'plucked'},audioEnvironment:env});
 state.create.mockResolvedValueOnce(b);i.set('stringModel','piano');await i.ready;expect(i.voice).toBe(b);expect(a.native.set).not.toHaveBeenCalled();expect(a.dispose).toHaveBeenCalledOnce();
 state.create.mockRejectedValueOnce(Error('cold preparation failed'));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{i.set('stringModel','plucked');await i.ready;expect(i.voice).toBe(b);expect(i.preset.stringModel).toBe('piano');expect(b.dispose).not.toHaveBeenCalled();expect(b.native.set).not.toHaveBeenCalled();}finally{log.mockRestore();i.dispose();}
});

it('reconstructs a physical material change inside the same owned backend',async()=>{const compressor=()=>{},env={version:1,profile:'owned-active-host-v1',context:ctx,roleWanderFactory:()=>{},iowaSourceBackend:'owned-rust',voiceFxOptions:{compressorFactory:compressor},instrumentOptions:()=>({sourceBackend:'owned-rust',voiceCompressorFactory:compressor}),prepareContext:async()=>{}};const a=voice(),b=voice();a.native={...a.native,sourceBackend:'owned-rust',set:vi.fn()};state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx,preset:{stringModel:'piano'},audioEnvironment:env});state.create.mockResolvedValueOnce(b);i.set('stringModel','plucked');await i.ready;expect(i.voice).toBe(b);expect(a.native.set).not.toHaveBeenCalled();expect(state.create.mock.calls.at(-1)[1]).toMatchObject({kind:'legacy',patch:{stringModel:'plucked'}});i.dispose();});

it('awaits late stale source retirement without delaying held notes on a newer ready source',async()=>{const a=voice(),late=voice();state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});let prepared,ack;state.create.mockImplementationOnce(()=>new Promise(resolve=>prepared=resolve));late.dispose.mockImplementation(()=>new Promise(resolve=>ack=resolve));i.applyPreset({fmIndex:2});const closed=i.dispose();expect(i.dispose()).toBe(closed);let settled=false;closed.then(()=>settled=true);expect(a.dispose).toHaveBeenCalledOnce();prepared(late);await vi.waitFor(()=>expect(late.dispose).toHaveBeenCalledOnce());expect(settled).toBe(false);ack();await closed;expect(settled).toBe(true);expect(()=>i.applyPreset({})).toThrow('Disposed');expect(state.create).toHaveBeenCalledTimes(2);});
it('retains a failed replaced owner acknowledgement through final instrument cleanup',async()=>{const a=voice(),b=voice(),failure=Error('retired processor failed');state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});a.dispose.mockRejectedValueOnce(failure);state.create.mockResolvedValueOnce(b);i.applyPreset({fmIndex:2});await i.ready;const result=await i.dispose().catch(error=>error),causes=error=>[error,...(error.errors??[]).flatMap(causes)];expect(causes(result)).toContain(failure);expect(b.dispose).toHaveBeenCalledOnce();expect(i.output.disconnect).toHaveBeenCalledOnce();});

it('rejects live effect controls before replacing the parent preset or saved FX spec',async()=>{const a=voice(),failure=Error('Motion full');a.fx={set:vi.fn(()=>{throw failure;})};a.spec.fx={tremoloDepth:.2};state.create.mockResolvedValueOnce(a);const i=await WasmInstrument.create({context:ctx});const preset=i.preset,fx=a.spec.fx;expect(()=>i.set('tremoloDepth',.8)).toThrow(failure);expect(i.preset).toBe(preset);expect(a.spec.fx).toBe(fx);await i.dispose();});
