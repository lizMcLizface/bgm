// Presets as the page's top row offers them (called scenes here, so they
// aren't confused with the synth presets of presets.js): whole soundscapes
// to start from - key, scale, tempo, meter, progression, arrangement, drums,
// ambience and a sound for every voice. They are data: src/library/
// scenes.json, { categories, scenes }. A scene is
//
//   { name, category, blurb, tags?, settings, voices }
//
// where `settings` is a patch over the default settings (anything it
// doesn't name is the default; a complete settings object works as well)
// and `voices` names a synth preset per role - or carries one in full,
// { name, synth }, which is what "Copy setup" produces. So a setup copied
// from the page can be pasted straight into scenes.json (give it a
// category), or into the page's own paste box.
//
// Choosing one moves the piece there from the next bar, with a new seed, and
// plays what the scene plays - music, ambience or both. Afterwards
// everything is as editable as ever. Presets of your own (saved from the
// page) live in localStorage and come back as scenes in the 'mine'
// category - see setupStore.js.

import library from '../library/scenes.json';
import { defaultSettings, newSeed, sanitizeSettings } from './settings';
import { ROLE_PRESETS } from './presets';
import { sanitizePreset } from './editor/presetStore';

/** The picker's categories, in order: [{ id, label, blurb }]. */
export const SCENE_CATEGORIES = library.categories;
/** Where setups of your own go. */
export const MINE = { id: 'mine', label: 'Mine', blurb: 'Saved from this page' };

export const SETUP_FORMAT = 'bgm-setup';
export const SETUP_VERSION = 1;
const ROLES = Object.keys(ROLE_PRESETS);

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

/**
 * Untrusted object -> a scene, or null when it can't be one. Voices are a
 * preset name or { name, synth } (synth keeps known keys of the right type).
 * Names that aren't presets are left for the caller to look up.
 */
export function normalizeScene(raw, defaultCategory = MINE.id) {
    if (!isObject(raw)) return null;
    const name = text(raw.name, 60);
    if (!name || !isObject(raw.settings)) return null;
    const voices = {};
    ROLES.forEach((role) => {
        const spec = isObject(raw.voices) ? raw.voices[role] : undefined;
        if (typeof spec === 'string' && spec) {
            voices[role] = spec;
        } else if (isObject(spec)) {
            const synth = sanitizePreset(spec.synth);
            if (synth) voices[role] = { name: text(spec.name, 60) || `${name} ${role}`, synth };
            else if (typeof spec.name === 'string' && spec.name) voices[role] = spec.name;
        }
    });
    return {
        name,
        category: text(raw.category, 40) || defaultCategory,
        blurb: text(raw.blurb, 200),
        tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string').map((t) => t.slice(0, 30)).slice(0, 12) : [],
        settings: raw.settings,
        voices,
    };
}

/** In picker order. */
export const SCENES = library.scenes.map((scene) => normalizeScene(scene, SCENE_CATEGORIES[0].id));

/** A name as it reads in a link: 'Rainy Day, Chickens Inside' -> 'rainy-day-chickens-inside'. */
export const sceneSlug = (name) => name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * The preset name in a page address: `?preset=turnip-town`, or just `?turnip-town`
 * (a lone parameter with no value). null when there is none.
 */
export function presetFromSearch(search) {
    const query = new URLSearchParams(search || '');
    if (query.has('preset')) return query.get('preset');
    const keys = [...query.keys()].filter((key) => !['intro', 'generation', 'phrase'].includes(key));
    return keys.length === 1 && query.get(keys[0]) === '' ? keys[0] : null;
}

/**
 * Whether a link asks for the short intro: `intro=short` (true), `intro=full` (false),
 * null when it says nothing.
 */
export function introFromSearch(search) {
    const value = new URLSearchParams(search || '').get('intro');
    if (value === 'short') return true;
    return value === 'full' ? false : null;
}

/** The built-in preset a link's `preset=` names (by its slug, or its name), or null. */
export function sceneBySlug(text) {
    const slug = sceneSlug(String(text || ''));
    return (slug && SCENES.find((scene) => sceneSlug(scene.name) === slug)) || null;
}

/** The picker's groups by what a scene plays. */
export const SCENE_GROUPS = { both: 'Music with ambience', music: 'Music only', ambience: 'Ambience only' };

/** What a scene plays: 'music', 'ambience' or 'both' (music with ambience). */
export function sceneGroup(scene) {
    if (scene.settings.playMusic === false) return 'ambience';
    const levels = scene.settings.ambience || {};
    return Object.values(levels).some((v) => v > 0) ? 'both' : 'music';
}

/**
 * A scene's complete settings: the defaults, the scene, and `seed` (a new
 * one unless given). Volumes and mutes go back to their defaults too.
 */
export function sceneSettings(scene, seed = newSeed()) {
    const base = defaultSettings();
    // a scene names only the ambience shape it changes
    const shape = Object.fromEntries(Object.entries(base.ambienceShape)
        .map(([id, params]) => [id, { ...params, ...((scene.settings.ambienceShape || {})[id] || {}) }]));
    const merged = { ...base, ...scene.settings, ambienceShape: shape, seed };
    return sanitizeSettings(merged, base);
}

/**
 * The page's current state as a setup: complete settings and, per voice,
 * its preset name and every synth parameter. JSON-ready.
 * @param {object} state - { settings, voices: { role: { name, synth } } }
 * @param {object} [info] - { name, blurb, category, tags }
 */
export function buildSetup({ settings, voices }, { name = 'My setup', blurb = '', category = MINE.id, tags = [] } = {}) {
    return {
        format: SETUP_FORMAT,
        version: SETUP_VERSION,
        name,
        category,
        blurb,
        tags,
        settings: JSON.parse(JSON.stringify(settings)),
        voices: Object.fromEntries(ROLES.filter((role) => voices[role]).map((role) => [role, { name: voices[role].name, synth: { ...voices[role].synth } }])),
    };
}

/**
 * Reads pasted or imported setup text: a setup as buildSetup makes it, or
 * a scene as scenes.json has it.
 * @returns {object} the scene
 * @throws {Error} with a message fit to show
 */
export function parseSetup(source) {
    let data;
    try {
        data = typeof source === 'string' ? JSON.parse(source) : source;
    } catch (e) {
        throw new Error('That is not valid JSON');
    }
    if (isObject(data) && data.format !== undefined && data.format !== SETUP_FORMAT) throw new Error('That JSON is not a bgm setup');
    if (isObject(data) && data.version > SETUP_VERSION) throw new Error('That setup is from a newer version of bgm');
    const scene = normalizeScene(data);
    if (!scene) throw new Error('No setup found: it needs a name and settings');
    return scene;
}
