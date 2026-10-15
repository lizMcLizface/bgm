import { randomKey, randomProgression, randomConductor, randomVoices, randomField, randomPreset, randomLength, randomArrangement, randomStyleWeights, randomRole, RANDOM_FIELDS, presetPool, modeQuality, progressionQuality, randomAmbience } from './randomize';
import { defaultSettings, sanitizeSettings } from './settings';
import { PRESET_CATEGORIES } from './presets';
import { DEFAULT_DRIFT } from './conductor';
import { seeded } from './random';
import PROGRESSIONS from './progressions';

const RUNS = 300;
const CURRENT = { pad: 'Soft Pad', bass: 'Warm Bass', lead: 'Glass Lead' };
const GROUPS = [
    ...Object.entries(PRESET_CATEGORIES).map(([group, presets]) => ({ group, presets })),
    { group: 'Mine', presets: { 'My Sound': {} } },
];

// Every patch, at both levels, must survive validation unchanged.
function expectValid(patch) {
    const settings = { ...defaultSettings(), ...patch };
    expect(sanitizeSettings(settings)).toEqual(settings);
}

const randomAll = (settings, level, rng) => {
    const key = randomKey(settings, level, rng, { matchProgression: false });
    const progression = randomProgression({ ...settings, ...key }, level, rng);
    return {
        ...key,
        ...progression,
        ...randomConductor(settings, level, rng),
        ...randomVoices(settings, CURRENT, level, rng, GROUPS).settings,
    };
};

test('every randomized patch is valid settings, at both levels', () => {
    const rng = seeded(3);
    for (let i = 0; i < RUNS; i++) {
        expectValid(randomAll(defaultSettings(), 'reason', rng));
        expectValid(randomAll(defaultSettings(), 'wild', rng));
    }
});

test('qualities: major and minor modes and progressions', () => {
    expect(modeQuality('Major-1')).toBe('major');
    expect(modeQuality('Major-6')).toBe('minor');
    expect(modeQuality('Pentatonic-5')).toBe('minor');
    expect(progressionQuality(0)).toBe('major');
    expect(progressionQuality(6)).toBe('minor');
});

test('within reason, the mode suits the progression and the progression the mode', () => {
    const rng = seeded(5);
    for (let i = 0; i < RUNS; i++) {
        const minorProgression = { ...defaultSettings(), progression: 6 };
        expect(modeQuality(randomKey(minorProgression, 'reason', rng).mode)).not.toBe('major');
        const minorMode = { ...defaultSettings(), mode: 'Major-6' };
        expect(progressionQuality(randomProgression(minorMode, 'reason', rng).progression)).toBe('minor');
    }
});

test('within reason stays near the defaults', () => {
    const rng = seeded(7);
    for (let i = 0; i < RUNS; i++) {
        const { mode, barsPerChord, meter, bpm } = randomProgression(defaultSettings(), 'reason', rng);
        expect(mode).toBeUndefined();
        expect([1, 2]).toContain(barsPerChord);
        expect(['4/4', '3/4', '6/8']).toContain(meter);
        expect(bpm).toBeGreaterThanOrEqual(62);
        expect(bpm).toBeLessThanOrEqual(84);
        const { drift } = randomConductor(defaultSettings(), 'reason', rng);
        expect(drift.mode).not.toBe('off');
        ['keyChance', 'modeChance', 'progressionChance', 'tempoChance'].forEach((key) => {
            expect(drift[key]).toBeLessThanOrEqual(DEFAULT_DRIFT[key] * 1.5 + 0.025);
        });
    }
});

test('the conductor keeps the exclusion lists', () => {
    const settings = { ...defaultSettings(), drift: { ...DEFAULT_DRIFT, excludedTonics: [1], excludedModes: ['Major-7'] } };
    ['reason', 'wild'].forEach((level) => {
        const { drift } = randomConductor(settings, level, seeded(1));
        expect(drift.excludedTonics).toEqual([1]);
        expect(drift.excludedModes).toEqual(['Major-7']);
    });
});

test('voices: within reason each role gets a new sound from its own category', () => {
    const rng = seeded(9);
    for (let i = 0; i < RUNS; i++) {
        const { presets, settings } = randomVoices(defaultSettings(), CURRENT, 'reason', rng, GROUPS);
        expect(Object.keys(PRESET_CATEGORIES.Leads)).toContain(presets.lead);
        expect(Object.keys(PRESET_CATEGORIES.Bass)).toContain(presets.bass);
        expect(Object.keys(PRESET_CATEGORIES.Pads)).toContain(presets.pad);
        Object.entries(CURRENT).forEach(([role, name]) => expect(presets[role]).not.toBe(name));
        Object.values(settings.voices).forEach((v) => expect(v.octave).toBe(0));
    }
});

test('voices: full random can take any preset', () => {
    expect(presetPool('lead', 'wild', GROUPS)).toContain('My Sound');
    expect(presetPool('lead', 'wild', GROUPS)).toContain('Warm Bass');
    expect(presetPool('lead', 'reason', GROUPS)).not.toContain('Warm Bass');
});

test('single fields: a different, valid value each press', () => {
    const rng = seeded(13);
    ['reason', 'wild'].forEach((level) => {
        RANDOM_FIELDS.forEach((key) => {
            let settings = defaultSettings();
            for (let i = 0; i < 50; i++) {
                const patch = randomField(key, settings, level, rng);
                expect(patch[key]).not.toEqual(settings[key]);
                settings = { ...settings, ...patch };
                expectValid(settings);
            }
        });
    });
});

test('single preset: a different one from the pool', () => {
    const rng = seeded(17);
    for (let i = 0; i < 50; i++) {
        const name = randomPreset('lead', 'Glass Lead', 'reason', rng, GROUPS);
        expect(name).not.toBe('Glass Lead');
        expect(Object.keys(PRESET_CATEGORIES.Leads)).toContain(name);
    }
});

test('progressions: within reason keeps the length, randomLength changes it', () => {
    const rng = seeded(19);
    let settings = defaultSettings();
    for (let i = 0; i < 100; i++) {
        const length = PROGRESSIONS[settings.progression].length;
        expect(PROGRESSIONS[randomField('progression', settings, 'reason', rng).progression]).toHaveLength(length);
        const patch = randomLength(settings, i % 2 ? 'wild' : 'reason', rng);
        expect(PROGRESSIONS[patch.progression].length).not.toBe(length);
        settings = { ...settings, ...patch };
        expectValid(settings);
    }
});

test('arrangement, style groups and single voices: valid at both levels', () => {
    const rng = seeded(23);
    ['reason', 'wild'].forEach((level) => {
        for (let i = 0; i < 100; i++) {
            expectValid(randomArrangement(defaultSettings(), level, rng));
            const weights = randomStyleWeights('bass', level, rng);
            expect(Object.values(weights).some((w) => w > 0)).toBe(true);
            const voice = randomRole('lead', defaultSettings(), 'Glass Lead', level, rng, GROUPS);
            expect(voice.preset).not.toBe('Glass Lead');
            expect(voice.settings).not.toHaveProperty('padNotes');
            expectValid(voice.settings);
        }
    });
    const { settings } = randomRole('pad', defaultSettings(), 'Soft Pad', 'reason', rng, GROUPS);
    expect(settings).toHaveProperty('padNotes');
});

test('key and scale dice skip excluded keys and modes', () => {
    const rng = seeded(29);
    const excludedTonics = [1, 3, 6, 8, 10];
    const excludedModes = ['Major-2', 'Major-3', 'Major-4', 'Major-5'];
    const settings = { ...defaultSettings(), drift: { ...defaultSettings().drift, excludedTonics, excludedModes } };
    ['reason', 'wild'].forEach((level) => {
        for (let i = 0; i < 100; i++) {
            const { tonic, mode } = randomKey(settings, level, rng);
            expect(excludedTonics).not.toContain(tonic);
            expect(excludedModes).not.toContain(mode);
        }
    });
});

test('ambience: within reason one or two layers at modest levels, thunder only with rain or wind', () => {
    const rng = seeded(5);
    for (let i = 0; i < 200; i++) {
        const levels = randomAmbience('reason', rng);
        const on = Object.entries(levels).filter(([, v]) => v > 0);
        expect(on.filter(([id]) => id !== 'thunder').length).toBeGreaterThanOrEqual(1);
        expect(on.filter(([id]) => id !== 'thunder').length).toBeLessThanOrEqual(2);
        on.forEach(([, v]) => expect(v).toBeLessThanOrEqual(0.65));
        if (levels.thunder) expect(levels.rain + levels.wind).toBeGreaterThan(0);
    }
    for (let i = 0; i < 100; i++) {
        const levels = randomAmbience('wild', rng);
        expect(Object.values(levels).some((v) => v > 0)).toBe(true);
        Object.values(levels).forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    }
});
