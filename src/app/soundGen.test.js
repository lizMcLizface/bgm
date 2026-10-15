import { generateSound, soundName, SOUND_ROLES, SEED_BITS } from './soundGen';
import { sanitizePreset } from './editor/presetStore';
import PRESET_DEFAULTS from './engine/presetDefaults';
import { seeded } from './random';

const seeds = (count, seed = 1) => {
    const rng = seeded(seed);
    return Array.from({ length: count }, () => Math.floor(rng() * 2 ** SEED_BITS));
};

test('the same role and seed always make the same sound', () => {
    SOUND_ROLES.forEach((role) => {
        expect(generateSound(role, 12345)).toEqual(generateSound(role, 12345));
        expect(generateSound(role, 12345).preset).not.toEqual(generateSound(role, 12346).preset);
    });
});

test('generated presets only use known parameters, with valid values', () => {
    SOUND_ROLES.forEach((role) => seeds(200).forEach((seed) => {
        const { preset } = generateSound(role, seed);
        expect(sanitizePreset(preset)).toEqual(preset);
        Object.entries(preset).forEach(([key, value]) => {
            if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
            expect(typeof value).toBe(typeof PRESET_DEFAULTS[key]);
        });
        expect(preset.filterFreq).toBeGreaterThan(200);
        expect(preset.filterFreq).toBeLessThanOrEqual(11000);
    }));
});

test('sounds suit their role', () => {
    seeds(200).forEach((seed) => {
        expect(generateSound('pad', seed).preset.gainAttack).toBeGreaterThanOrEqual(0.6);
        expect(generateSound('bass', seed).preset.gainAttack).toBeLessThan(0.05);
        expect(generateSound('bass', seed).preset.filterFreq).toBeLessThan(1500);
    });
});

test('names are readable and differ per seed', () => {
    expect(soundName('lead', 0xabcdef)).toMatch(/^\w+ \w+ #abcd$/);
    const names = new Set(seeds(500).map((seed) => soundName('pad', seed)));
    expect(names.size).toBeGreaterThan(495);
});
