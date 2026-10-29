import {WASM_VOICES,WASM_PRESETS,nativeWasmVoice} from './voiceLibrary';
import {sanitizePreset,findPreset} from '../app/editor/presetStore';
import {BROWSABLE_SCENES as SCENES,sceneUsesWasm,buildSetup,parseSetup,sceneSettings} from '../app/scenes';
import {voiceById} from '../labs/catalog';
import DEFAULTS from '../app/engine/presetDefaults';
test('main presets use the same full native patches as their lab counterparts',()=>{
 for(const v of WASM_VOICES){
  expect(sanitizePreset(WASM_PRESETS[v.name])).toEqual(WASM_PRESETS[v.name]);
  const spec=nativeWasmVoice({...DEFAULTS,...findPreset(v.name)},8),expected=structuredClone(v.patch);expected.global.polyphony=8;
  expect(spec).toEqual({kind:v.kind,patch:expected});expect(voiceById(v.id).patch).toEqual(v.patch);
 }
});
test('common envelope/level edits affect native carriers without mutating library patches',()=>{
 for(const v of WASM_VOICES){const before=JSON.stringify(v),flat=WASM_PRESETS[v.name],spec=nativeWasmVoice({...flat,masterVolume:flat.masterVolume*.5,gainRelease:flat.gainRelease*2},6);
  expect(spec.patch.global.gain).toBeCloseTo(v.patch.global.gain*.5);const index=v.kind==='fm'?v.patch.carriers.findIndex(x=>x>0):0,lane=p=>v.kind==='fm'?p.operators[index]:p.layers[index];expect(lane(spec.patch).release).toBeCloseTo(lane(v.patch).release*2);expect(JSON.stringify(v)).toBe(before);
 }
 expect(nativeWasmVoice({})).toBeNull();
});
test('three new soundscapes retain native voices through setup export/import',()=>{
 const scenes=SCENES.filter(s=>s.category==='wasm');expect(scenes).toHaveLength(3);
 for(const scene of scenes){expect(scene.isNew).toBe(true);expect(sceneUsesWasm(scene)).toBe(true);
  const voices=Object.fromEntries(Object.entries(scene.voices).map(([role,name])=>[role,{name,synth:{...DEFAULTS,...findPreset(name)}}]));
  const restored=parseSetup(JSON.stringify(buildSetup({settings:sceneSettings(scene,42),voices},{name:scene.name})));
  for(const role of Object.keys(voices))expect(restored.voices[role].synth.wasmVoice).toBe(voices[role].synth.wasmVoice);
 }
});

test('Soft Pipes has a useful audition level without changing the parallel-drawbar voice',()=>{
 const pipes=WASM_VOICES.find(v=>v.id==='soft-pipes');// the audition level now comes from the level pass (library/levelTrims.json), never below the original .35
 expect(pipes.patch.global.gain).toBeGreaterThanOrEqual(.35);expect(pipes.patch.global.gain).toBeLessThanOrEqual(.8);expect(pipes.metadata.masterVolume).toBe(pipes.patch.global.gain);
 expect(pipes.patch.global.index).toBe(.25);expect(pipes.patch.operators.every(o=>o.attack===.08&&o.release===.55)).toBe(true);
});
