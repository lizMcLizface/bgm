import { defaultSettings, sanitizeSettings, encodeSettings, decodeSettings, decodeShare, settingsFromLocation, shareFromLocation, shareUrl } from './settings';
import { randomKey, randomProgression, randomConductor, randomVoices } from './randomize';
import { PRESET_CATEGORIES, GENERATIVE_PRESETS } from './presets';
import { SHAREABLE_PRESETS } from './shareCode';
import presetData from '../util/presetData';
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
    expect(code.length).toBeLessThanOrEqual(8);
    expect(decodeSettings(code)).toEqual({ ...defaultSettings(), seed: 7 });
    expect(encodeSettings({ ...defaultSettings(), seed: 2 ** 31 - 1, tonic: 5 }).length).toBeLessThanOrEqual(12);
});

test('links read unchanged values against a fixed baseline: sections stay off in older links', () => {
    expect(defaultSettings().sections.mode).toBe('gentle');
    const off = { ...defaultSettings(), seed: 7, sections: { mode: 'off', phrases: 4 } };
    const code = encodeSettings(off);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(decodeSettings(code).sections).toEqual({ mode: 'off', phrases: 4 });
});

test('voice volumes travel in links', () => {
    const settings = { ...defaultSettings(), seed: 3, volumes: { lead: 0.42, counter: 0.6, pad: 0.15, bass: 1 } };
    expect(decodeSettings(encodeSettings(settings)).volumes).toEqual(settings.volumes);
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
    const url = shareUrl({ ...defaultSettings(), seed: 1 }, {}, { origin: 'https://calmbgm.com', pathname: '/' });
    expect(url).toMatch(/^https:\/\/calmbgm\.com\/\?s=[A-Za-z0-9_-]+$/);
});

test('every built-in preset can be named in a link', () => {
    const builtIn = [...Object.keys(GENERATIVE_PRESETS), ...Object.keys(presetData).filter((n) => n !== '- INIT -')];
    builtIn.forEach((name) => expect(SHAREABLE_PRESETS).toContain(name));
});

test('links carry generated sounds as role + seed', () => {
    const presets = { lead: { generated: { role: 'lead', seed: 0xabcdef } }, pad: { generated: { role: 'bass', seed: 1 } }, bass: 'Deep Pulse' };
    const code = encodeSettings({ ...defaultSettings(), seed: 9 }, presets);
    expect(code.length).toBeLessThan(25);
    expect(decodeShare(code).presets).toEqual(presets);
});

test('second lead, sections and ambience travel in links; old codes read them as off', () => {
    const settings = { ...defaultSettings(), seed: 9, counter: { mode: 'harmony', activity: 0.35 }, sections: { mode: 'strong', phrases: 8 }, ambience: { ...defaultSettings().ambience, rain: 0.4, thunder: 0.65 }, ambienceVolume: 0.55, playMusic: false, playAmbience: true };
    const code = encodeSettings(settings, { counter: 'Ocarina', lead: { generated: { role: 'counter', seed: 77 } } });
    expect(decodeShare(code)).toEqual({ settings, presets: { counter: 'Ocarina', lead: { generated: { role: 'counter', seed: 77 } } } });
    const plain = encodeSettings({ ...defaultSettings(), seed: 9 });
    expect(decodeShare(plain).settings.counter).toEqual({ mode: 'off', activity: 0.5 });
    expect(Object.values(decodeShare(plain).settings.ambience).every((v) => v === 0)).toBe(true);
    expect([decodeShare(plain).settings.playMusic, decodeShare(plain).settings.playAmbience]).toEqual([true, false]);
});
