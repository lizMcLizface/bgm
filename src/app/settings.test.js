import { defaultSettings, sanitizeSettings, encodeSettings, decodeSettings, settingsFromLocation, shareUrl } from './settings';

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
    expect(code.length).toBeLessThan(40);
    expect(decodeSettings(code).seed).toBe(7);
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
    const url = shareUrl({ ...defaultSettings(), seed: 1 }, { origin: 'https://liz.moe', pathname: '/bgm/' });
    expect(url).toMatch(/^https:\/\/liz\.moe\/bgm\/\?s=[A-Za-z0-9_-]+$/);
});
