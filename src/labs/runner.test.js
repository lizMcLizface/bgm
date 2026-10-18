const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../app/generator',()=>({default:class{},ROLES:{pad:{polyphony:8},lead:{polyphony:2},counter:{polyphony:2},bass:{polyphony:2}}}));
vi.mock('../app/engine/wasmInstrument',()=>({default:{create:state.create}}));
import {replaceLabVoice,syncLabVoices,runnerSettings} from './runner';
import {libraryVoice} from './catalog';
const instrument=()=>({connect:vi.fn(),dispose:vi.fn()});
const generator=()=>({AC:{},roles:Object.fromEntries(['pad','lead','counter','bass'].map(role=>[role,{tone:{},instrument:instrument()}]))});
beforeEach(()=>state.create.mockReset().mockImplementation(async()=>instrument()));
it('retains the test source and unchanged backing when switching contexts',async()=>{
 const g=generator(),config={runner:'keys',armed:'pad',voices:{pad:'bowed-glass'},engines:{pad:'wasm'}};await syncLabVoices(g,config);const pad=g.roles.pad.instrument;expect(state.create).toHaveBeenCalledTimes(4);expect(g.roles.bass.labVoiceId).toBe(libraryVoice('Thump Bass').id);await syncLabVoices(g,{...config,runner:'sparse'});expect(g.roles.pad.instrument).toBe(pad);expect(pad.dispose).not.toHaveBeenCalled();expect(state.create).toHaveBeenCalledTimes(6);expect(g.roles.bass.labVoiceId).toBe(libraryVoice('Upright Pluck').id);
});
it('cancels an obsolete pending source when the user returns to the installed sound',async()=>{
 const g=generator();await replaceLabVoice(g,'pad','bowed-glass');const installed=g.roles.pad.instrument,next=instrument();let resolve;state.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const pending=replaceLabVoice(g,'pad','rosin-silk');await replaceLabVoice(g,'pad','bowed-glass');resolve(next);await pending;expect(g.roles.pad.instrument).toBe(installed);expect(next.dispose).toHaveBeenCalledOnce();
});
it('retains the selected scenes percussion pattern rather than substituting generic brushes',()=>{
 expect(runnerSettings('keys').drums.style).toBe('lofi');expect(runnerSettings('motion').drums.style).toBe('drive');expect(runnerSettings('sparse').drums.style).toBe('shaker');
});
