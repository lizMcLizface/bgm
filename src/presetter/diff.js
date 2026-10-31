// What the page differs from a preset by: the diff stored for a preset (changes.js). `setup` is the page's state as GenerativeApp's
// captureSetup builds it (scenes.js buildSetup). Page-only: it needs the scenes, the library and the arranger.
import { sceneSettings, sceneVoiceSpec } from '../app/scenes';
import { voiceLayers } from '../app/arranger';
import { findPreset } from '../app/editor/presetStore';
import { ROLE_PRESETS } from '../app/presets';
import PRESET_DEFAULTS from '../app/engine/presetDefaults';
import { cleanBook, inheritBook } from '../app/rulebook/session';
import { deepDiff } from './changes';

// What is not a choice about the preset: the seed is a new one each visit, and the generation is the page's.
export const IGNORED = ['seed', 'generation'];

const nameOf = (spec) => (typeof spec === 'string' ? spec : spec?.name);
const sameSynth = (name, synth) => {
    const known = findPreset(name);
    if (!known) return false;
    const a = { ...PRESET_DEFAULTS, ...known }, b = { ...PRESET_DEFAULTS, ...synth };
    return Object.entries(a).every(([key, value]) => b[key] === value);
};

/** The preset as a book the page would hold, cleaned the way buildSetup cleans the page's. */
export const shippedBook = (scene) => ({ version: 1, ...cleanBook({ version: 1, ...inheritBook(scene.rulebook) }) });

/**
 * @param {object} scene - the preset as shipped (a SCENES entry)
 * @param {object} setup - the page now
 * @returns {object} a change (see changes.js), {} for none
 */
export function diffSetup(scene, setup) {
    const out = {}, warnings = [];
    const settings = deepDiff(sceneSettings(scene, setup.settings.seed), setup.settings, IGNORED);
    if (Object.keys(settings).length) out.settings = settings;

    // with the layers split the pad and the rhythm part have voices made for them (scenes.js sceneVoiceSpec)
    const layers = voiceLayers(setup.settings), voices = {}, layerVoices = {};
    for (const [role, voice] of Object.entries(setup.voices ?? {})) {
        const expected = sceneVoiceSpec(scene, role, layers) ?? ROLE_PRESETS[role];
        const layered = role === 'rhythm' || (role === 'pad' && layers !== 'combined');
        if (voice.external) {
            if (JSON.stringify(nameOf(expected) && expected.external) === JSON.stringify(voice.external)) continue;
            if (layered) warnings.push(`${role}: a classic synth voice is not kept for the layers`); else voices[role] = { name: voice.name, external: voice.external };
            continue;
        }
        const named = voice.name === nameOf(expected), edited = !(findPreset(voice.name) && sameSynth(voice.name, voice.synth ?? {}));
        // the same sound (a built-in one, or the very synth values the preset carries) is no change
        if (named && (!edited || (typeof expected === 'object' && JSON.stringify({ ...PRESET_DEFAULTS, ...expected.synth }) === JSON.stringify({ ...PRESET_DEFAULTS, ...voice.synth })))) continue;
        if (!edited) {
            if (layered) layerVoices[role] = voice.name; else voices[role] = voice.name;
        } else if (layered) warnings.push(`${role}: an edited sound is not kept for the layers - save it under a name of its own first`);
        else voices[role] = { name: voice.name, synth: voice.synth };
    }
    if (Object.keys(voices).length) out.voices = voices;
    if (Object.keys(layerVoices).length) out.layerVoices = layerVoices;

    if (setup.rulebook && JSON.stringify(setup.rulebook) !== JSON.stringify(shippedBook(scene))) out.rulebook = setup.rulebook;
    if (setup.percussion && JSON.stringify(setup.percussion) !== JSON.stringify(scene.percussion ?? null)) out.percussion = setup.percussion;
    if (warnings.length) out.warnings = warnings;
    return out;
}
