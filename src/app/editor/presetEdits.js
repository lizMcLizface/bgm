// An edited sound of the generator's own synth as links carry it (shareExtras.js): its preset's
// name and only the values that differ from that preset - from the defaults when the name is no
// built-in sound (a generated one, or one from a setup), so the link means the same anywhere.
import PRESET_DEFAULTS from '../engine/presetDefaults';
import { findPreset, sanitizePreset } from './presetStore';
import { SHAREABLE_PRESETS } from '../shareCode';

const baseOf = (name) => ({ ...PRESET_DEFAULTS, ...(SHAREABLE_PRESETS.includes(name) ? findPreset(name) : {}) });
/** The voice's preset -> { name, values } (changes only). */
export function presetEdit(name, preset) {
    const base = baseOf(name);
    return { name, values: Object.fromEntries(Object.entries(preset).filter(([key, value]) => key in PRESET_DEFAULTS && JSON.stringify(base[key]) !== JSON.stringify(value))) };
}
/** { name, values } -> the full preset (unknown or wrongly typed values fall back to the preset's). */
export function presetFromEdit({ name, values }) {
    const base = baseOf(name);
    return sanitizePreset({ ...base, ...values }) ?? base;
}
