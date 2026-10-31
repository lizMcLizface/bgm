// What a listener changed in a preset, kept apart from the preset (docs/PRESETTER.md). A change is the difference from the preset as
// shipped, not a copy of the page, so a preset edited elsewhere in the meantime keeps its other edits. No imports: the same file
// bakes the changes into src/library/scenes.json (tools/applyPresetChanges.mjs) and previews them in the app.
//
// A change: { settings?: patch, voices?: { role: name | { name, synth } | { name, external } }, layerVoices?: { pad?, rhythm? } (names),
//   rulebook?, percussion?, warnings?: string[] } - and, beside it in a stored entry, the listener's own notes (store.js).

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** `patch` laid over `base`: objects merge key by key, anything else (arrays too) replaces. */
export function deepMerge(base, patch) {
    if (!isObject(base) || !isObject(patch)) return patch === undefined ? base : patch;
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) out[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key], value) : value;
    return out;
}

/** The leaves of `actual` that differ from `base` (a nested patch), ignoring the dotted paths in `skip`; {} when none. */
export function deepDiff(base, actual, skip = [], path = '') {
    const out = {};
    for (const [key, value] of Object.entries(actual ?? {})) {
        const here = path ? `${path}.${key}` : key;
        if (skip.includes(here)) continue;
        if (isObject(value) && isObject(base?.[key])) {
            const inner = deepDiff(base[key], value, skip, here);
            if (Object.keys(inner).length) out[key] = inner;
        } else if (!same(value, base?.[key])) out[key] = value;
    }
    return out;
}

/** The dotted paths of a nested patch's leaves, for listing what a change touches. */
export function leafPaths(patch, path = '') {
    return Object.entries(patch ?? {}).flatMap(([key, value]) => (isObject(value) && Object.keys(value).length ? leafPaths(value, path ? `${path}.${key}` : key) : [path ? `${path}.${key}` : key]));
}

export const isEmptyChange = (change) => !change || !['settings', 'voices', 'layerVoices', 'rulebook', 'percussion'].some((k) => change[k] && Object.keys(change[k]).length);

/** A scene (as scenes.json has it) with a change laid over it. The scene is not modified. */
export function applyChange(scene, change) {
    if (isEmptyChange(change)) return scene;
    const out = { ...scene, settings: deepMerge(scene.settings ?? {}, change.settings ?? {}), voices: { ...scene.voices, ...change.voices } };
    if (change.layerVoices && Object.keys(change.layerVoices).length) out.layerVoices = { ...scene.layerVoices, ...change.layerVoices };
    if (change.rulebook) out.rulebook = change.rulebook;
    if (change.percussion) out.percussion = change.percussion;
    return out;
}

/** One line for a table: what a change touches. */
export function describeChange(change) {
    if (isEmptyChange(change)) return '';
    const settings = leafPaths(change.settings).length, voices = Object.keys(change.voices ?? {}).length + Object.keys(change.layerVoices ?? {}).length;
    return [settings && `${settings} setting${settings > 1 ? 's' : ''}`, voices && `${voices} voice${voices > 1 ? 's' : ''}`, change.rulebook && 'rulebook', change.percussion && 'drums'].filter(Boolean).join(', ');
}

/**
 * A dump's changes laid over the library (scenes.json's contents): the library with them, and what happened to each preset.
 * A hidden revision copy of a preset (comparisonOf) that was the same as the preset gets the same change, so the pair still match.
 */
export function bakeLibrary(library, dump) {
    const scenes = [...library.scenes], applied = [], missing = [], warned = [];
    for (const [name, entry] of Object.entries(dump.presets ?? {})) {
        if (entry.change?.warnings?.length) warned.push(`${name}: ${entry.change.warnings.join('; ')}`);
        if (isEmptyChange(entry.change)) continue;
        const at = scenes.findIndex((s) => s.name === name);
        if (at < 0) { missing.push(name); continue; }
        const before = scenes[at];
        scenes[at] = applyChange(before, entry.change);
        applied.push(`${name}: ${describeChange(entry.change)}`);
        scenes.forEach((copy, i) => {
            if (copy.comparisonOf === name && same(copy.settings, before.settings) && same(copy.voices, before.voices)) scenes[i] = applyChange(copy, entry.change);
        });
    }
    const next = Object.entries(dump.presets ?? {}).filter(([, e]) => e.status === 'tweak' || e.status === 'redo')
        .map(([n, e]) => `${n} (${e.status === 'redo' ? 'redo' : 'tweak'})${e.note ? `: ${e.note}` : ''}`);
    return { library: { ...library, scenes }, applied, missing, warned, next };
}
