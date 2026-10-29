import {PRESET_CATEGORIES} from '../app/presets';
import presetData from '../util/presetData';
import {RECIPES} from '../synth-lab/patch';
import {FM_RECIPES} from '../synth-lab/fmPatch';
import {PROCEDURAL_RECIPES} from '../synth-lab/proceduralPatch';
import {FAMILIES,LAB_VOICES,libraryVoice,voiceById,voiceSpec,voiceEngine,voiceLabel,voiceMetadata} from './catalog';

it('exposes every built-in calmbgm/unCAGED instrument and every new synth/FM recipe',()=>{
 for(const group of [...Object.values(PRESET_CATEGORIES),presetData])for(const name of Object.keys(group))if(name!=='- INIT -')expect(libraryVoice(name),name).toBeDefined();
 for(const recipe of [...RECIPES,...FM_RECIPES,...PROCEDURAL_RECIPES.filter(p=>p.family!=='drums')])expect(LAB_VOICES.some(v=>v.sourceRecipe===recipe.name),recipe.name).toBe(true);
 expect(new Set(LAB_VOICES.map(v=>v.id)).size).toBe(LAB_VOICES.length);for(const [family]of FAMILIES)expect(LAB_VOICES.some(v=>v.family===family),family).toBe(true);
});
it('includes approved rounded prepared instruments and preserves original oscillator plucks as classic choices',()=>{
 const guitar=voiceById('prepared-2');expect(guitar.kind).toBe('procedural');expect(guitar.patch.string.softness).toBe(.7);expect(voiceSpec(guitar).patch.string.softness).toBe(.7);
 expect(voiceById('prepared-3').patch.string.softness).toBe(.55);expect(voiceById('prepared-4').patch.string.softness).toBe(.85);
 for(const name of ['Nylon Guitar','Soft Harp','Harp Pluck','Kalimba Pluck','Upright Pluck']){expect(libraryVoice(name+' (classic)').patch.stringModel).toBe('oscillator');expect(libraryVoice(name).patch.stringModel).toBe('plucked');}
});
it('marks new Wasm voices, native-only sources and translated existing presets independently',()=>{
 const glass=voiceById('bowed-glass'),felt=libraryVoice('Felt Keys'),strings=libraryVoice('Warm Strings');
 expect(voiceLabel(glass)).toContain('NEW · Wasm only');expect(voiceLabel(felt)).toBe('Felt Keys · Previous only');expect(voiceLabel(strings)).toBe('Warm Strings · Both engines');
 expect(voiceEngine(glass,'previous')).toBe('wasm');expect(voiceEngine(felt,'wasm')).toBe('previous');expect(voiceSpec(felt,'wasm').kind).toBe('legacy');
 expect(voiceSpec(strings,'previous').kind).toBe('legacy');expect(voiceSpec(strings,'wasm').kind).toBe('subtractive');expect(voiceSpec(libraryVoice('Nylon Guitar'),'wasm').kind).toBe('legacy');
});
it('does not mutate source recipes and supplies correct envelope metadata for the planner',()=>{
 const entry=voiceById('bowed-glass'),before=JSON.stringify(entry),spec=voiceSpec(entry,'wasm',8);expect(spec.patch.global.polyphony).toBe(8);spec.patch.global.gain=.01;expect(JSON.stringify(entry)).toBe(before);expect(voiceMetadata(spec).gainAttack).toBeGreaterThan(.1);
 for(const v of LAB_VOICES){expect(['previous','wasm','both']).toContain(v.availability);expect(typeof v.isNew).toBe('boolean');const spec=voiceSpec(v,'wasm',8),metadata=voiceMetadata(spec);for(const value of Object.values(metadata))if(typeof value==='number')expect(Number.isFinite(value),v.name).toBe(true);}
});
