import {runnerVoiceIds,roleSources,RUNNERS,runnerScene} from './contexts';
import {voiceById,libraryVoice} from './catalog';

it('uses the scenes actual instrument choices for every backing role',()=>{
 for(const c of RUNNERS){const scene=runnerScene(c.id),ids=runnerVoiceIds(c.id);for(const role of ['pad','lead','counter','bass']){const name=scene.voices[role];expect(voiceById(ids[role])).toBeDefined();if(typeof name==='string')expect(voiceById(ids[role]).presetName).toBe(name);}}
 expect(voiceById(runnerVoiceIds('keys').bass).name).toBe('Thump Bass');expect(voiceById(runnerVoiceIds('sparse').bass).name).toBe('Upright Pluck');
});
it('keeps the test voice fixed while changing context and restores the former test role when arming another',()=>{
 const c={runner:'keys',armed:'pad',voices:{pad:'rosin-silk',lead:'tine-keys',bass:'dco-drone'},engines:{pad:'wasm'}};
 const cafe=roleSources(c),folk=roleSources({...c,runner:'sparse'});expect(cafe.pad.id).toBe('rosin-silk');expect(folk.pad.id).toBe('rosin-silk');expect(voiceById(cafe.bass.id).name).toBe('Thump Bass');expect(voiceById(folk.bass.id).name).toBe('Upright Pluck');expect(cafe.bass.engine).toBe('previous');
 const bass=roleSources({...c,armed:'bass',voices:{...c.voices,bass:libraryVoice('Upright Pluck').id}});expect(bass.pad.id).toBe(libraryVoice('Felt Piano').id);expect(bass.bass.id).toBe(libraryVoice('Upright Pluck').id);
});
