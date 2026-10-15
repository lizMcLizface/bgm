import { generateSound, soundName, SOUND_ROLES, SEED_BITS, generateEnsembleSound, ensemblePalette, ensembleName } from './soundGen';
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

describe('ensembles', () => {
    const ROLES = ['pad', 'bass', 'lead', 'counter'];

    test('same seed, same voices; valid presets that still suit their roles', () => {
        seeds(150, 7).forEach((ensemble) => {
            expect(generateEnsembleSound('lead', ensemble)).toEqual(generateEnsembleSound('lead', ensemble));
            ROLES.forEach((role) => {
                const { preset } = generateEnsembleSound(role, ensemble);
                expect(sanitizePreset(preset)).toEqual(preset);
                expect(preset.filterFreq).toBeGreaterThan(200);
                expect(preset.filterFreq).toBeLessThanOrEqual(11000);
            });
            expect(generateEnsembleSound('pad', ensemble).preset.gainAttack).toBeGreaterThanOrEqual(0.6);
            expect(generateEnsembleSound('bass', ensemble).preset.gainAttack).toBeLessThan(0.05);
            expect(generateEnsembleSound('bass', ensemble).preset.filterFreq).toBeLessThan(1500);
        });
    });

    test('the voices share a character: one waveform family, one reverb, one modulation, one echo', () => {
        const FAMILY = { sine: 'smooth', triangle: 'any', square_dc: 'any', sawtooth: 'bright' };
        seeds(150, 8).forEach((ensemble) => {
            const voices = ROLES.map((role) => generateEnsembleSound(role, ensemble).preset);
            const palette = ensemblePalette(ensemble);
            const melodic = voices.filter((p, i) => ROLES[i] !== 'bass');
            expect(new Set(melodic.map((p) => p.reverbType))).toEqual(new Set([palette.reverbType]));
            voices.forEach((p) => {
                expect(Boolean(p.chorusAmount)).toBe(palette.motion === 'chorus');
                expect(Boolean(p.phaserAmount)).toBe(palette.motion === 'phaser');
                if (palette.family === 'smooth') expect(FAMILY[p.vcoType]).not.toBe('bright');
                if (palette.family === 'bright') expect(p.vcoType).not.toBe('sine');
            });
            [voices[2], voices[3]].forEach((p) => expect(p.delayTime).toBe(palette.echo ? palette.echo.time : undefined));
        });
    });

    test('a single voice is still generated as before; names share a word and the id', () => {
        expect(generateSound('lead', 4242)).toEqual(generateSound('lead', 4242));
        const names = ROLES.map((role) => ensembleName(role, 0x3fa2c1));
        names.forEach((n) => expect(n).toMatch(/ #3fa2$/));
        expect(new Set(names.map((n) => n.split(' ')[0])).size).toBe(1);
    });
});
