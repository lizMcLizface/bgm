import { defaultSettings, sanitizeSettings, encodeSettings, decodeSettings, decodeShare, settingsFromLocation, shareFromLocation, shareUrl } from './settings';
import { randomKey, randomProgression, randomConductor, randomVoices } from './randomize';
import { PRESET_CATEGORIES } from './presets';
import { seeded } from './random';

test('round-trips through a share code', () => {
    const settings = {
        ...defaultSettings(),
        tonic: 9,
        mode: 'Harmonic Minor-5',
        meter: '6/8',
        bpm: 64,
        padWeights: { sustain: 0, pulse: 0, arpeggio: 100 },
        drift: { ...defaultSettings().drift, mode: 'centered', excludedTonics: [1, 6], excludedModes: ['Major-7'] },
        humanize: { timing: 20, velocity: 0.1, detune: 5 },
        seed: 12345,
    };
    expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
});

test('codes only carry what differs from the defaults', () => {
    const code = encodeSettings({ ...defaultSettings(), seed: 7 });
    expect(code.length).toBeLessThanOrEqual(6);
    expect(decodeSettings(code).seed).toBe(7);
    expect(encodeSettings({ ...defaultSettings(), seed: 2 ** 31 - 1, tonic: 5 }).length).toBeLessThanOrEqual(10);
});

test('fully randomized settings and presets round-trip in a short code', () => {
    const rng = seeded(11);
    const current = { pad: 'Soft Pad', bass: 'Warm Bass', lead: 'Glass Lead' };
    const groups = Object.entries(PRESET_CATEGORIES).map(([group, presets]) => ({ group, presets }));
    for (let i = 0; i < 100; i++) {
        const base = { ...defaultSettings(), drift: { ...defaultSettings().drift, excludedTonics: [1, 6], excludedModes: ['Major-7', 'Pentatonic-2'] } };
        const voices = randomVoices(base, current, 'wild', rng, groups);
        const settings = sanitizeSettings({
            ...base,
            ...randomKey(base, 'wild', rng),
            ...randomProgression(base, 'wild', rng),
            ...randomConductor(base, 'wild', rng),
            ...voices.settings,
            leadActivity: 0.35,
            humanize: { timing: 31, velocity: 0.17, detune: 7.5 },
        });
        const code = encodeSettings(settings, voices.presets);
        expect(code.length).toBeLessThan(60);
        expect(decodeShare(code)).toEqual({ settings, presets: voices.presets });
    }
});

test('links name built-in presets only', () => {
    const code = encodeSettings({ ...defaultSettings(), seed: 1 }, { lead: 'Ocarina', pad: 'My Own Pad', bass: null });
    expect(decodeShare(code).presets).toEqual({ lead: 'Ocarina' });
    // a role's default preset costs nothing
    expect(encodeSettings({ ...defaultSettings(), seed: 1 }, { lead: 'Glass Lead', pad: 'Soft Pad', bass: 'Warm Bass' }))
        .toBe(encodeSettings({ ...defaultSettings(), seed: 1 }));
});

test('links made before the compact codes still open', () => {
    const legacy = 'eyJ2IjoxLCJ0b25pYyI6NCwic2VlZCI6M30'; // {"v":1,"tonic":4,"seed":3}
    expect(shareFromLocation({ search: `?s=${legacy}` })).toEqual({ settings: { ...defaultSettings(), tonic: 4, seed: 3 }, presets: {} });
});

test('untrusted input is clamped, filtered or replaced by defaults', () => {
    const clean = sanitizeSettings({
        tonic: 99,
        mode: 'Not-A-Mode',
        bpm: 5000,
        meter: '13/7',
        leadActivity: -3,
        padWeights: { sustain: 'lots', pulse: 40 },
        drift: { mode: 'chaos', keyChance: 2, excludedTonics: [1, 'x', 99, 1], excludedModes: ['Major-2', 'nope'] },
        humanize: { timing: Infinity },
        evil: '<script>',
        seed: -1,
    });
    const defaults = defaultSettings();
    expect(clean.tonic).toBe(defaults.tonic);
    expect(clean.mode).toBe(defaults.mode);
    expect(clean.bpm).toBe(110);
    expect(clean.meter).toBe('4/4');
    expect(clean.leadActivity).toBe(0);
    expect(clean.padWeights).toEqual({ ...defaults.padWeights, pulse: 40 });
    expect(clean.drift.mode).toBe('off');
    expect(clean.drift.keyChance).toBe(1);
    expect(clean.drift.excludedTonics).toEqual([1]);
    expect(clean.drift.excludedModes).toEqual(['Major-2']);
    expect(clean.humanize.timing).toBe(defaults.humanize.timing);
    expect(clean).not.toHaveProperty('evil');
    expect(Number.isInteger(clean.seed)).toBe(true);
});

test('garbage codes are rejected; the query parameter (and legacy hash) is found', () => {
    expect(decodeSettings('%%%not-base64')).toBeNull();
    expect(settingsFromLocation({ search: '', hash: '' })).toBeNull();
    const code = encodeSettings({ ...defaultSettings(), tonic: 4, seed: 3 });
    expect(settingsFromLocation({ search: `?s=${code}` }).tonic).toBe(4);
    expect(settingsFromLocation({ search: '', hash: `#/generative?s=${code}` }).tonic).toBe(4);
});

test('share URLs use the page path and an s= query parameter', () => {
    const url = shareUrl({ ...defaultSettings(), seed: 1 }, {}, { origin: 'https://liz.moe', pathname: '/bgm/' });
    expect(url).toMatch(/^https:\/\/liz\.moe\/bgm\/\?s=[A-Za-z0-9_-]+$/);
});
