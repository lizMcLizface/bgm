import { SCENES, SCENE_CATEGORIES, sceneSettings, sceneGroup, SCENE_GROUPS, buildSetup, parseSetup, normalizeScene, sceneSlug, sceneBySlug, presetFromSearch, introFromSearch } from './scenes';
import { scaleById } from './theory';
import { findPreset, sanitizePreset } from './editor/presetStore';
import { SHAREABLE_PRESETS } from './shareCode';
import { defaultSettings } from './settings';
import { ROLE_PRESETS, GENERATIVE_PRESETS } from './presets';
import PRESET_DEFAULTS from './engine/presetDefaults';

// every key of `patch` has to be in `actual` (nested objects: at any depth)
const expectContained = (patch, actual) => {
    Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) expectContained(value, actual[key]);
        else expect(actual[key]).toEqual(value);
    });
};

test('an intro=short link still names its preset, and says whether the intro is short', () => {
    expect(presetFromSearch('?turnip-town&intro=short')).toBe('turnip-town');
    expect(presetFromSearch('?preset=turnip-town&intro=short')).toBe('turnip-town');
    expect(presetFromSearch('?intro=short')).toBeNull();
    expect(introFromSearch('?intro=short')).toBe(true);
    expect(introFromSearch('?preset=x&intro=full')).toBe(false);
    expect(introFromSearch('?preset=x')).toBeNull();
});

test('every scene is valid as it stands: modes, presets, settings that survive sanitizing', () => {
    expect(new Set(SCENES.map((s) => s.name)).size).toBe(SCENES.length);
    SCENES.forEach((scene) => {
        const settings = sceneSettings(scene, 5);
        expect(() => scaleById(settings.mode)).not.toThrow();
        // nothing the scene says was thrown away as invalid
        expectContained(scene.settings, settings);
        Object.values(scene.voices).forEach((name) => {
            expect(typeof name).toBe('string');
            expect(findPreset(name)).toBeTruthy();
            expect(SHAREABLE_PRESETS).toContain(name);
        });
    });
});

test('every scene is in a category, every category has scenes, and the list is long enough to browse', () => {
    const ids = SCENE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    SCENES.forEach((scene) => expect(ids).toContain(scene.category));
    ids.forEach((id) => expect(SCENES.filter((s) => s.category === id).length).toBeGreaterThanOrEqual(4));
    ['ftl', 'metroid', 'f-zero', 'altp', 'stardew', 'terraria'].forEach((tag) =>
        expect(SCENES.some((s) => s.tags.includes(tag))).toBe(true));
});

test('every group has scenes, and ambience-only scenes play no music', () => {
    Object.keys(SCENE_GROUPS).forEach((group) => expect(SCENES.filter((s) => sceneGroup(s) === group).length).toBeGreaterThanOrEqual(4));
    SCENES.filter((s) => sceneGroup(s) === 'ambience').forEach((scene) => {
        const settings = sceneSettings(scene, 1);
        expect([settings.playMusic, settings.playAmbience]).toEqual([false, true]);
        expect(Object.values(settings.ambience).some((v) => v > 0)).toBe(true);
    });
});

test('the driving presets use the driving engine, and every voice a music scene names is a real sound', () => {
    const fast = SCENES.filter((s) => (s.settings.bpm || 0) > 110);
    expect(fast.length).toBeGreaterThanOrEqual(3);
    fast.forEach((scene) => expect(sceneSettings(scene, 1).bpm).toBe(scene.settings.bpm));
    SCENES.filter((s) => sceneGroup(s) !== 'ambience').forEach((scene) => {
        expect(Object.keys(scene.voices).every((role) => role in ROLE_PRESETS)).toBe(true);
        ['pad', 'bass', 'lead'].forEach((role) => expect(scene.voices[role]).toBeTruthy());
    });
});

describe('setups', () => {
    const synthOf = (name) => ({ ...PRESET_DEFAULTS, ...GENERATIVE_PRESETS[name] });
    const state = () => ({
        settings: { ...defaultSettings(), bpm: 140, seed: 42 },
        voices: Object.fromEntries(Object.entries(ROLE_PRESETS).map(([role, name]) => [role, { name, synth: synthOf(name) }])),
    });

    test('a built setup is plain JSON that reads back as the same scene', () => {
        const setup = buildSetup(state(), { name: 'My night' });
        const scene = parseSetup(JSON.stringify(setup));
        expect(scene.name).toBe('My night');
        expect(scene.category).toBe('mine');
        // complete settings, and the seed travels
        expect(scene.settings.seed).toBe(42);
        expect(sceneSettings(scene, 42)).toEqual({ ...defaultSettings(), ...sceneSettings(scene, 42), bpm: 140, seed: 42 });
        // every voice with every synth parameter
        Object.keys(ROLE_PRESETS).forEach((role) => {
            expect(scene.voices[role].name).toBe(ROLE_PRESETS[role]);
            expect(Object.keys(scene.voices[role].synth).length).toBeGreaterThan(100);
        });
    });

    test('pasted text is checked: not JSON, another kind of JSON, no settings', () => {
        expect(() => parseSetup('{nope')).toThrow('not valid JSON');
        expect(() => parseSetup('{"format":"something-else","name":"x","settings":{}}')).toThrow('not a bgm setup');
        expect(() => parseSetup('{"name":"x"}')).toThrow('No setup found');
        expect(() => parseSetup('[]')).toThrow('No setup found');
        expect(() => parseSetup('{"format":"bgm-setup","version":99,"name":"x","settings":{}}')).toThrow('newer');
    });

    test('a scene as scenes.json has it (partial settings, preset names) is accepted too', () => {
        const scene = parseSetup({ name: 'Mine', settings: { bpm: 90 }, voices: { pad: 'Soft Pad', bass: { name: 'Warm Bass' } } });
        expect(scene.voices).toEqual({ pad: 'Soft Pad', bass: 'Warm Bass' });
        expect(sceneSettings(scene).bpm).toBe(90);
    });

    test('unknown synth keys and wrongly typed values are dropped, never loaded', () => {
        const scene = normalizeScene({
            name: 'x', settings: {}, voices: { lead: { name: 'L', synth: { vcoType: 'saw<script>', masterVolume: 0.5, evil: 1, filterFreq: 'high' } } },
        });
        expect(scene.voices.lead.synth).toEqual({ vcoType: 'saw<script>', masterVolume: 0.5 });
        expect(sanitizePreset({ evil: 1 })).toBeNull();
        expect(normalizeScene({ name: '', settings: {} })).toBeNull();
        expect(normalizeScene({ name: 'a', settings: 5 })).toBeNull();
    });

    test('settings from a pasted setup are sanitized like a link\'s', () => {
        const scene = parseSetup({ name: 'x', settings: { bpm: 9999, tonic: 99, mode: 'nope', meter: '13/7' } });
        const settings = sceneSettings(scene, 1);
        expect(settings.bpm).toBe(170);
        expect(settings.tonic).toBe(defaultSettings().tonic);
        expect(settings.mode).toBe(defaultSettings().mode);
        expect(settings.meter).toBe('4/4');
    });
});

describe('preset links', () => {
    test('every preset has its own readable slug, and a slug (or the name) finds the preset', () => {
        const slugs = SCENES.map((s) => sceneSlug(s.name));
        expect(new Set(slugs).size).toBe(SCENES.length);
        slugs.forEach((slug) => expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
        expect(sceneSlug('Rainy Day, Chickens Inside')).toBe('rainy-day-chickens-inside');
        expect(sceneSlug('Rainy café')).toBe('rainy-cafe');
        SCENES.forEach((scene) => {
            expect(sceneBySlug(sceneSlug(scene.name))).toBe(scene);
            expect(sceneBySlug(scene.name)).toBe(scene);
        });
        expect(sceneBySlug('no-such-preset')).toBeNull();
        expect(sceneBySlug('')).toBeNull();
        expect(sceneBySlug(null)).toBeNull();
    });

    test('the address: ?preset=name or just ?name, nothing else', () => {
        expect(presetFromSearch('?preset=turnip-town')).toBe('turnip-town');
        expect(presetFromSearch('?turnip-town')).toBe('turnip-town');
        expect(presetFromSearch('')).toBeNull();
        expect(presetFromSearch('?m=PKF1TVqggmqogMg8vpzRuiyg')).toBeNull();
        expect(presetFromSearch('?turnip-town&m=abc')).toBeNull();
    });
});
