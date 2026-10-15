import { generateSoundV2, generateEnsembleSoundV2, ensemblePaletteV2, ensembleNameV2, soundFrom, SOUND_KINDS, anyKind } from './soundGenV2';
import { generateSound, generateEnsembleSound, SEED_BITS } from './soundGen';
import { sanitizePreset } from './editor/presetStore';
import PRESET_DEFAULTS from './engine/presetDefaults';
import { seeded } from './random';

const seeds = (count, seed = 1) => {
    const rng = seeded(seed);
    return Array.from({ length: count }, () => Math.floor(rng() * 2 ** SEED_BITS));
};
const ROLES = Object.keys(SOUND_KINDS);

const valid = (preset) => {
    expect(sanitizePreset(preset)).toEqual(preset);
    Object.entries(preset).forEach(([key, value]) => {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
        expect(typeof value).toBe(typeof PRESET_DEFAULTS[key]);
    });
    if (preset.filterFreq !== undefined) {
        expect(preset.filterFreq).toBeGreaterThan(200);
        expect(preset.filterFreq).toBeLessThanOrEqual(11000);
    }
};

test('version 1 is frozen: v1 links make the sounds they always made', () => {
    expect(generateSound('lead', 12345).preset).toMatchSnapshot();
    expect(generateSound('pad', 777).preset).toMatchSnapshot();
    expect(generateEnsembleSound('bass', 0x3fa2c1).preset).toMatchSnapshot();
    expect(soundFrom({ role: 'pad', seed: 777 })).toEqual(generateSound('pad', 777));
    expect(soundFrom({ role: 'bass', ensemble: 0x3fa2c1 })).toEqual(generateEnsembleSound('bass', 0x3fa2c1));
});

test('every kind, for every role it suits: deterministic, valid presets', () => {
    ROLES.forEach((role) => Object.keys(SOUND_KINDS[role]).forEach((kind) => seeds(80).forEach((seed) => {
        const sound = generateSoundV2(role, seed, kind);
        expect(sound).toEqual(generateSoundV2(role, seed, kind));
        expect(sound.kind).toBe(kind);
        valid(sound.preset);
    })));
});

test('kinds sound like what they are called', () => {
    seeds(150, 3).forEach((seed) => {
        expect(generateSoundV2('pad', seed, 'pad').preset.gainAttack).toBeGreaterThanOrEqual(0.6);
        expect(generateSoundV2('pad', seed, 'texture').preset.gainAttack).toBeGreaterThanOrEqual(1.5);
        expect(generateSoundV2('pad', seed, 'keys').preset.gainAttack).toBeLessThan(0.05);
        expect(generateSoundV2('lead', seed, 'pluck').preset.gainSustain).toBe(0);
        expect(generateSoundV2('lead', seed, 'bell').preset.gainSustain).toBeLessThanOrEqual(0.12);
        ['bass', 'pluck'].forEach((kind) => {
            const { preset } = generateSoundV2('bass', seed, kind);
            expect(preset.gainAttack).toBeLessThan(0.05);
            expect(preset.filterFreq).toBeLessThan(1500);
        });
    });
});

test('"any" picks a kind from the seed, and the link can name it', () => {
    const counts = {};
    seeds(400, 4).forEach((seed) => {
        const sound = generateSoundV2('pad', seed);
        expect(sound.kind).toBe(anyKind('pad', seed));
        expect(generateSoundV2('pad', seed, sound.kind)).toEqual(sound);
        expect(soundFrom({ role: 'pad', seed, kind: sound.kind, version: 2 })).toEqual(sound);
        counts[sound.kind] = (counts[sound.kind] || 0) + 1;
    });
    expect(Object.keys(counts).sort()).toEqual(['keys', 'pad', 'texture']);
});

describe('v2 ensembles', () => {
    test('same seed, same voices; valid presets; kinds from the character', () => {
        seeds(150, 7).forEach((ensemble) => {
            const palette = ensemblePaletteV2(ensemble);
            ROLES.forEach((role) => {
                const sound = generateEnsembleSoundV2(role, ensemble);
                expect(sound).toEqual(generateEnsembleSoundV2(role, ensemble));
                expect(sound.kind).toBe(palette.kinds[role]);
                expect(Object.keys(SOUND_KINDS[role])).toContain(sound.kind);
                valid(sound.preset);
            });
            const bass = generateEnsembleSoundV2('bass', ensemble).preset;
            expect(bass.gainAttack).toBeLessThan(0.05);
            expect(bass.filterFreq).toBeLessThan(1500);
        });
    });

    test('the melodic voices share a reverb and an echo', () => {
        seeds(150, 8).forEach((ensemble) => {
            const palette = ensemblePaletteV2(ensemble);
            ['pad', 'lead', 'counter'].forEach((role) => expect(generateEnsembleSoundV2(role, ensemble).preset.reverbType).toBe(palette.reverbType));
            ['lead', 'counter'].forEach((role) => {
                const p = generateEnsembleSoundV2(role, ensemble).preset;
                const time = palette.echo && palette.echo.pingPong ? p.pingPongDelayTime : p.delayTime;
                expect(time).toBe(palette.echo ? palette.echo.time : undefined);
            });
        });
    });

    test('every character comes up', () => {
        const characters = new Set(seeds(600, 9).map((s) => ensemblePaletteV2(s).character));
        expect([...characters].sort()).toEqual(['bright', 'dub', 'glassy', 'lofi', 'organ', 'smooth', 'warm']);
        expect(ensembleNameV2('pad', 0x3fa2c1)).toMatch(/ #3fa2$/);
    });
});
