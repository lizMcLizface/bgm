const state=vi.hoisted(()=>({create:vi.fn(),route:vi.fn()}));
vi.mock('../app/generator',()=>({default:class{},ROLES:{pad:{polyphony:8},lead:{polyphony:2},counter:{polyphony:2},bass:{polyphony:2}}}));
vi.mock('../app/engine/wasmInstrument',()=>({default:{create:state.create}}));
vi.mock('../app/engine/wasmRoomRoute',()=>({createWasmRoomRoute:state.route}));
import {replaceLabVoice,syncLabVoices,runnerSettings} from './runner';
import {libraryVoice} from './catalog';
const instrument=()=>({connect:vi.fn(),dispose:vi.fn()});
const generator=()=>({AC:{},applyMix:vi.fn(),roles:Object.fromEntries(['pad','lead','counter','bass'].map(role=>[role,{tone:{},instrument:instrument()}]))});
beforeEach(()=>{state.create.mockReset().mockImplementation(async()=>instrument());state.route.mockReset().mockImplementation(()=>({dispose:vi.fn()}));});
it('retains the test source and unchanged backing when switching contexts',async()=>{
 const g=generator(),config={runner:'keys',armed:'pad',voices:{pad:'bowed-glass'},engines:{pad:'wasm'}};await syncLabVoices(g,config);const pad=g.roles.pad.instrument;expect(state.create).toHaveBeenCalledTimes(4);expect(g.roles.bass.labVoiceId).toBe(libraryVoice('Thump Bass').id);await syncLabVoices(g,{...config,runner:'sparse'});expect(g.roles.pad.instrument).toBe(pad);expect(pad.dispose).not.toHaveBeenCalled();expect(state.create).toHaveBeenCalledTimes(6);expect(g.roles.bass.labVoiceId).toBe(libraryVoice('Upright Pluck').id);
});
it('cancels an obsolete pending source when the user returns to the installed sound',async()=>{
 const g=generator();await replaceLabVoice(g,'pad','bowed-glass');const installed=g.roles.pad.instrument,next=instrument();let resolve;state.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const pending=replaceLabVoice(g,'pad','rosin-silk');await replaceLabVoice(g,'pad','bowed-glass');resolve(next);await pending;expect(g.roles.pad.instrument).toBe(installed);expect(next.dispose).toHaveBeenCalledOnce();
});
it('retains the selected scenes percussion pattern rather than substituting generic brushes',()=>{
 expect(runnerSettings('keys').drums.style).toBe('lofi');expect(runnerSettings('motion').drums.style).toBe('drive');expect(runnerSettings('sparse').drums.style).toBe('shaker');
});

it('keeps runner room ownership and replaces the old send route with its voice',async()=>{
 const g=generator(),pool={};g.wasmRoomPool=pool;Object.assign(g.roles.pad,{volume:.4,wander:{},tone:{frequency:{value:1600}}});await replaceLabVoice(g,'pad','bowed-glass');const oldRoute=g.roles.pad.roomRoute;expect(state.create.mock.calls[0][0].roomPool).toBe(pool);expect(state.route.mock.calls[0][2]).toMatchObject({volume:.4,cutoff:1600,roleWander:g.roles.pad.wander});await replaceLabVoice(g,'pad','rosin-silk');expect(oldRoute.dispose).toHaveBeenCalledTimes(1);expect(g.applyMix).toHaveBeenCalledTimes(2);
});
