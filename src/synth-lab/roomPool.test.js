// @vitest-environment node
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('./effects',()=>({createEffectsBus:state.create}));
import {WasmRoomPool,roomKey} from './roomPool';
const node=()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()});
const bus=()=>({node:node(),connect:vi.fn(),clear:vi.fn(),dispose:vi.fn()});
const context=()=>({createGain:node});
beforeEach(()=>state.create.mockReset().mockImplementation(async()=>bus()));
test('matching rooms ignore client dry/send/delay settings and create a single wet-only processor',async()=>{
 const c=context(),destination=node(),p=new WasmRoomPool(c,destination);
 const [a,b]=await Promise.all([p.acquire({reverb:.2,dry:1,delayMs:300}),p.acquire({reverb:.6,dry:0,delayMs:700})]);
 expect(a.input).toBe(b.input);expect(state.create).toHaveBeenCalledTimes(1);expect(state.create.mock.calls[0][1]).toMatchObject({dry:0,reverb:.8,delay:0,delayToReverb:0});expect(a.input.gain.value).toBe(1.25);expect(a.input.connect).toHaveBeenCalledWith((await state.create.mock.results[0].value).node,0,1);
 a.release();expect((await state.create.mock.results[0].value).dispose).not.toHaveBeenCalled();b.release();b.release();expect((await state.create.mock.results[0].value).dispose).toHaveBeenCalledTimes(1);expect(p.rooms.size).toBe(0);
});
test('all room response settings split pools while send controls do not',()=>{
 const base=roomKey({});for(const [k,v]of Object.entries({decay:20,size:.9,damping:2000,predelay:70,width:.3,modulation:.8,quality:0,reverbReturn:6}))expect(roomKey({[k]:v})).not.toBe(base);
 expect(roomKey({reverb:.1,delay:.7,feedback:.8,tone:7000,pingPong:0,delayToReverb:.9})).toBe(base);
});
test('pool clear belongs to the owner and releasing a client leaves other rooms intact',async()=>{
 const p=new WasmRoomPool(context(),node()),a=await p.acquire({decay:6}),b=await p.acquire({decay:20}),first=await state.create.mock.results[0].value,second=await state.create.mock.results[1].value;
 p.clear();expect(first.clear).toHaveBeenCalledTimes(1);expect(second.clear).toHaveBeenCalledTimes(1);a.release();expect(second.dispose).not.toHaveBeenCalled();p.dispose();b.release();expect(second.dispose).toHaveBeenCalledTimes(1);
});
test('room errors reach every active client even when callbacks share identity',async()=>{
 const p=new WasmRoomPool(context(),node()),error=vi.fn(),a=await p.acquire({}, {onError:error}),b=await p.acquire({}, {onError:error}),emit=state.create.mock.calls[0][2].onError;
 a.release();emit(Error('processor'));expect(error).toHaveBeenCalledTimes(1);b.release();emit(Error('late'));expect(error).toHaveBeenCalledTimes(1);
});
test('failed creation releases its reservation and allows retry',async()=>{
 state.create.mockRejectedValueOnce(Error('load'));const p=new WasmRoomPool(context(),node());await expect(p.acquire({})).rejects.toThrow('load');expect(p.rooms.size).toBe(0);const a=await p.acquire({});a.release();
});
test('disposing while a room loads disposes the eventual processor and rejects the lease',async()=>{
 let ready;state.create.mockImplementationOnce(()=>new Promise(r=>{ready=r;}));const p=new WasmRoomPool(context(),node()),pending=p.acquire({}),b=bus();p.dispose();ready(b);await expect(pending).rejects.toThrow('disposed');expect(b.dispose).toHaveBeenCalledTimes(1);await expect(p.acquire({})).rejects.toThrow('disposed');
});

test('room diagnostics expose response/output state without changing ownership',async()=>{
 const b={...bus(),settings:{decay:12},stats:{peak:.2,reportedAt:3},error:Error('test')};state.create.mockResolvedValueOnce(b);
 const p=new WasmRoomPool(context(),node()),a=await p.acquire({});expect(p.diagnostics[0]).toMatchObject({clients:1,ready:true,settings:{decay:12},stats:{peak:.2},error:'test'});expect(b.clear).not.toHaveBeenCalled();expect(b.dispose).not.toHaveBeenCalled();a.release();expect(p.diagnostics).toEqual([]);
});
