// Where presets come from and go to:
// - built in: the generator's starters by category (Pads, Bass, Leads,
//   Keys & plucks, Textures) + unCAGED's src/util/presetData.js
// - unCAGED custom: what the synth tab saved (localStorage
//   'PolySynth-CustomPresets'), read-only here - visible because both pages
//   share an origin when run locally
// - mine: saved from this editor ('Generative-Presets')
// - from a setup: sounds that came with a loaded or pasted setup (scenes.js)
//   and are not stored anywhere else - kept for the visit
// - generated: made this visit by soundGen.js (kept in memory; a link
//   recreates them from role + seed, saving one makes it "mine")
// - JSON files: export/import, the durable route (and how presets get into
//   the repo or survive the move to a separate site, where localStorage
//   starts empty)
//
// localStorage can be unavailable (private mode, blocked storage); every
// access is guarded and the page works without it.

import { PRESET_CATEGORIES, HIDDEN_PRESETS } from '../presets';
import classics from '../../library/classics.json';
import presetData from '../../util/presetData';
import PRESET_DEFAULTS from '../engine/presetDefaults';

const USER_KEY = 'Generative-Presets';
const UNCAGED_KEY = 'PolySynth-CustomPresets';

// name -> { preset, info: { role, seed } or { role, ensemble } }
const generated = new Map();

/** Registers a generated sound so pickers list it and links can name it. */
export function addGeneratedPreset(name, preset, info) {
    generated.set(name, { preset, info: { ...info } });
}

/** What made a generated sound ({ role, seed } or { role, ensemble }), or null. */
export function generatedInfo(name) {
    const entry = generated.get(name);
    return entry ? { ...entry.info } : null;
}

/**
 * The classic synths' sounds worth having in the picker (library/classics.json), listed as
 * references: { classicRef: { synth, name, label, family, note } }. They are not presets of the
 * generator's synth - picking one loads the sound on the classic (GenerativeApp.loadPreset), so
 * the name is the one the voice shows then: 'V 80 · Plain'.
 */
const CLASSIC_SOUNDS = Object.fromEntries(classics.sounds.map(({ synth, name, family, note }) => {
    const label = `${classics.synths[synth]} · ${name}`;
    return [label, { classicRef: { synth, name, label, synthName: classics.synths[synth], family, note } }];
}));

// name -> preset
const fromSetups = new Map();

/** Registers a sound that came inside a setup, so pickers list it. */
export function addSetupPreset(name, preset) {
    fromSetups.set(name, preset);
}

const readJson = (key) => {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
};

/** Keeps only known preset keys with values of the default's type. */
export function sanitizePreset(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const clean = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (key in PRESET_DEFAULTS && typeof value === typeof PRESET_DEFAULTS[key]) clean[key] = value;
    });
    return Object.keys(clean).length ? clean : null;
}

/**
 * Every preset by group, for pickers.
 * @param {string} [first] - a category to list first (a role's own)
 * @param {boolean} [includeHidden] - keep presets withheld from the pickers (lookups need them)
 * @returns {Array<{ group: string, editable: boolean, presets: object }>}
 */
export function presetGroups(first, includeHidden = false) {
    const builtIn = Object.fromEntries(Object.entries(presetData).filter(([name]) => name !== '- INIT -'));
    const categories = Object.entries(PRESET_CATEGORIES)
        .map(([group, presets]) => ({ group, editable: false, presets: includeHidden ? presets : Object.fromEntries(Object.entries(presets).filter(([name]) => !HIDDEN_PRESETS.has(name))) }))
        .sort((a, b) => (b.group === first) - (a.group === first));
    return [
        ...categories,
        { group: 'Classic synths', editable: false, presets: CLASSIC_SOUNDS },
        { group: 'unCAGED', editable: false, presets: builtIn },
        { group: 'unCAGED custom', editable: false, presets: readJson(UNCAGED_KEY) },
        { group: 'Mine', editable: true, presets: readJson(USER_KEY) },
        { group: 'From setups', editable: false, presets: Object.fromEntries(fromSetups) },
        { group: 'Generated', editable: false, presets: Object.fromEntries([...generated].map(([name, { preset }]) => [name, preset])) },
    ].filter(({ presets }) => Object.keys(presets).length);
}

/** Looks a preset up by name, user presets winning over built-ins. */
export function findPreset(name) {
    const groups = presetGroups(undefined, true).reverse();
    const hit = groups.find(({ presets }) => name in presets);
    return hit ? hit.presets[name] : null;
}

export function isUserPreset(name) {
    return name in readJson(USER_KEY);
}

/** @returns {boolean} whether it was stored */
export function saveUserPreset(name, preset) {
    try {
        const presets = readJson(USER_KEY);
        presets[name] = preset;
        window.localStorage.setItem(USER_KEY, JSON.stringify(presets));
        return true;
    } catch (e) {
        return false;
    }
}

export function deleteUserPreset(name) {
    try {
        const presets = readJson(USER_KEY);
        delete presets[name];
        window.localStorage.setItem(USER_KEY, JSON.stringify(presets));
    } catch (e) {
        // nothing stored, nothing to delete
    }
}

/** Downloads `{ name, preset }` as a .json file. */
export function exportPreset(name, preset) {
    const blob = new Blob([JSON.stringify({ name, preset }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'preset'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Reads a preset file: either `{ name, preset }` (this editor's export) or a
 * bare flat preset object (e.g. an entry copied out of presetData.js).
 * @returns {Promise<{ name: string, preset: object }>}
 */
export async function importPresetFile(file) {
    const data = JSON.parse(await file.text());
    const preset = sanitizePreset(data && data.preset ? data.preset : data);
    if (!preset) throw new Error('No synth parameters found in that file');
    const name = (data && typeof data.name === 'string' && data.name) || file.name.replace(/\.json$/i, '');
    return { name, preset };
}
