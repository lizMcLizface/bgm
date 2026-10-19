const state=vi.hoisted(()=>({create:vi.fn(),room:vi.fn(),echo:vi.fn()}));
vi.mock('../app/engine/Instrument',()=>({default:class{}}));
vi.mock('../synth-lab/backend',()=>({WasmBackend:{create:state.create}}));
vi.mock('../synth-lab/fmBackend',()=>({FMBackend:{create:state.create}}));
vi.mock('./PreparedSource',()=>({PreparedSource:{create:state.create}}));
vi.mock('../synth-lab/inserts',()=>({createInstrumentInserts:vi.fn()}));
vi.mock('../synth-lab/routedEffects',()=>({createRoutedEffects:state.room,createInstrumentEffects:vi.fn(),connectEnsembleChannel:()=>({dispose:vi.fn()})}));
vi.mock('../synth-lab/nativeEcho',()=>({createNativeEcho:state.echo}));
import {LabVoice} from './voice';
import {initialFM} from '../synth-lab/fmPatch';
import {writeWasmPerformance,WASM_PERFORMANCE_KEY} from '../audio/wasmPerformance';
import {PERFORMANCE_KEY} from '../audio/performance';
const node=()=>({gain:{value:1,setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()});
const context=()=>({sampleRate:48000,currentTime:1,createGain:node});
const backend=()=>({node:node(),patch:vi.fn(),on:vi.fn(()=>5),off:vi.fn(),panic:vi.fn(),dispose:vi.fn()});
beforeEach(()=>{localStorage.removeItem(WASM_PERFORMANCE_KEY);localStorage.removeItem(PERFORMANCE_KEY);state.create.mockReset().mockImplementation(async()=>backend());state.room.mockReset().mockImplementation(async()=>({connect:vi.fn(),dispose:vi.fn()}));state.echo.mockReset().mockImplementation(async()=>({input:node(),output:node(),clear:vi.fn(),dispose:vi.fn()}));});
afterEach(()=>{localStorage.removeItem(WASM_PERFORMANCE_KEY);localStorage.removeItem(PERFORMANCE_KEY);});
it('changes active FM quality without replacing its node, held keys, macros or designed patch',async()=>{
 const v=await LabVoice.create(context(),{kind:'fm',patch:initialFM()}),source=v.backend;
 try{const id=v.on(60,.8);v.controls({bend:2,texture:.3});writeWasmPerformance('economy');expect(v.backend).toBe(source);expect(v.keys.get(id)).toBe(60);expect(source.off).not.toHaveBeenCalled();expect(source.patch.mock.calls.at(-1)[0].global).toMatchObject({quality:0,bend:2});expect(v.patch.global.quality).toBe(1);v.controls({bend:3});expect(source.patch.mock.calls.at(-1)[0].global).toMatchObject({quality:0,bend:3});writeWasmPerformance('full');expect(source.patch.mock.calls.at(-1)[0].global).toMatchObject({quality:1,bend:3});}finally{v.dispose();}const calls=source.patch.mock.calls.length;writeWasmPerformance('economy');expect(source.patch).toHaveBeenCalledTimes(calls);
});
it('starts offline renders at device quality but does not change them partway through',async()=>{
 writeWasmPerformance('economy');const p=initialFM(),v=await LabVoice.create({...context(),length:48000},{kind:'fm',patch:p});
 try{expect(state.create.mock.calls[0][1].global.quality).toBe(0);expect(v.patch.global.quality).toBe(1);writeWasmPerformance('full');expect(v.backend.patch).not.toHaveBeenCalled();}finally{v.dispose();}
});
it('honours a quality choice made while the source module is still loading',async()=>{
 let ready;const b=backend();state.create.mockImplementationOnce(()=>new Promise(resolve=>{ready=()=>resolve(b);}));
 const pending=LabVoice.create(context(),{kind:'fm',patch:initialFM()});writeWasmPerformance('economy');ready();const v=await pending;
 try{expect(b.patch.mock.calls.at(-1)[0].global.quality).toBe(0);expect(v.patch.global.quality).toBe(1);}finally{v.dispose();}
});
it('routes the light room preference into creation without mutating the patch or its long decay',async()=>{
 localStorage.setItem(PERFORMANCE_KEY,JSON.stringify({reverb:'light'}));const p=initialFM();p.effects.decay=20;const v=await LabVoice.create(context(),{kind:'fm',patch:p});
 try{expect(state.room.mock.calls[0][1]).toMatchObject({quality:0,decay:20});expect(v.patch.effects).toEqual(p.effects);}finally{v.dispose();}
});

it('shares the room while retaining client delay, macros and independent panic',async()=>{
 const lease={input:node(),release:vi.fn()},pool={acquire:vi.fn(async()=>lease),clear:vi.fn()},p=initialFM();p.effects.decay=20;
 const v=await LabVoice.create(context(),{kind:'fm',patch:p},{roomPool:pool});
 try{expect(state.room).not.toHaveBeenCalled();expect(pool.acquire).toHaveBeenCalledWith(expect.objectContaining({decay:20}),expect.any(Object));expect(state.echo.mock.calls[0][1]).toMatchObject({delay:p.effects.delay,delayMs:p.effects.delayMs,pingPong:p.effects.pingPong});expect(v.sharedRoomInput).toBe(lease.input);v.controls({level:.4});expect(v.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(.7*.4,1,.025);expect(v.roomOutput.gain.setTargetAtTime).toHaveBeenLastCalledWith(.7*.4,1,.025);v.panic();expect(pool.clear).not.toHaveBeenCalled();expect(lease.release).not.toHaveBeenCalled();expect(v.echo.clear).toHaveBeenCalledTimes(1);}finally{v.dispose();}expect(lease.release).toHaveBeenCalledTimes(1);
});
it('honours a private long room even when compatible pooling is enabled',async()=>{
 const pool={acquire:vi.fn()},p=initialFM();p.routing={room:'private',roomDecay:20};const v=await LabVoice.create(context(),{kind:'fm',patch:p},{roomPool:pool});
 try{expect(pool.acquire).not.toHaveBeenCalled();expect(state.room.mock.calls[0][1].decay).toBe(20);expect(v.roomOutput).toBeUndefined();}finally{v.dispose();}
});
it('allocates no FDN for a dry or echo-only pooled client',async()=>{
 const pool={acquire:vi.fn()},p=initialFM();Object.assign(p.effects,{reverb:0,delay:.2,delayToReverb:0});const v=await LabVoice.create(context(),{kind:'fm',patch:p},{roomPool:pool});
 try{expect(pool.acquire).not.toHaveBeenCalled();expect(state.room).not.toHaveBeenCalled();expect(state.echo).toHaveBeenCalledTimes(1);}finally{v.dispose();}
});
it('releases the source and its listeners if pooled room preparation fails',async()=>{
 const b=backend();state.create.mockResolvedValueOnce(b);const pool={acquire:vi.fn(async()=>{throw Error('room load');})};await expect(LabVoice.create(context(),{kind:'fm',patch:initialFM()},{roomPool:pool})).rejects.toThrow('room load');expect(b.dispose).toHaveBeenCalledTimes(1);
});
