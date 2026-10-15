import { defaultSettings, sanitizeSettings, encodeSettings, decodeSettings, decodeShare, settingsFromLocation, shareFromLocation, shareUrl } from './settings';
import { randomKey, randomProgression, randomConductor, randomVoices } from './randomize';
import { PRESET_CATEGORIES, GENERATIVE_PRESETS } from './presets';
import { SHAREABLE_PRESETS, encodeShareCode } from './shareCode';
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

test('older s= links read unchanged values against their own baseline: sections stay off', () => {
    expect(defaultSettings().sections.mode).toBe('gentle');
    const off = { ...defaultSettings(), seed: 7, sections: { mode: 'off', phrases: 4 } };
    const legacy = encodeShareCode(off, off); // as made before sections defaulted to gentle
    expect(legacy.length).toBeLessThanOrEqual(6);
    expect(shareFromLocation({ search: `?s=${legacy}` }).settings.sections).toEqual({ mode: 'off', phrases: 4 });
});

test('links come in parts: m= always, v= and a= only for what changed', () => {
    const base = { ...defaultSettings(), seed: 7 };
    expect(encodeSettings(base)).toMatch(/^m=[\w-]+$/);
    expect(encodeSettings({ ...base, volumes: { ...base.volumes, pad: 0.3 } })).toMatch(/^m=[\w-]+&v=[\w-]+$/);
    expect(encodeSettings({ ...base, ambience: { ...base.ambience, rain: 0.5 } })).toMatch(/^m=[\w-]+&a=[\w-]+$/);
    // the music part doesn't change with the voices or the ambience
    const music = (code) => code.split('&')[0];
    expect(music(encodeSettings({ ...base, volumes: { ...base.volumes, pad: 0.3 }, ambience: { ...base.ambience, wind: 0.2 } }))).toBe(music(encodeSettings(base)));
});

test('ambience shapes travel in the a= part', () => {
    const base = defaultSettings();
    const settings = {
        ...base,
        seed: 5,
        ambience: { ...base.ambience, rain: 0.45, thunder: 0.3 },
        ambienceShape: {
            ...base.ambienceShape,
            rain: { ...base.ambienceShape.rain, intensity: 0.8, drops: 0.2, distance: 0.35, pan: -0.4, width: 0.6 },
            thunder: { ...base.ambienceShape.thunder, frequency: 0.75, intensity: 0.9 },
        },
    };
    expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
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

test('share URLs use the page path and the m= (v=, a=) parameters', () => {
    const url = shareUrl({ ...defaultSettings(), seed: 1 }, {}, { origin: 'https://calmbgm.com', pathname: '/' });
    expect(url).toMatch(/^https:\/\/calmbgm\.com\/\?m=[A-Za-z0-9_-]+$/);
    expect(shareFromLocation({ search: url.split('/')[3] }).settings.seed).toBe(1);
});

test('every built-in preset can be named in a link', () => {
    const builtIn = [...Object.keys(GENERATIVE_PRESETS), ...Object.keys(presetData).filter((n) => n !== '- INIT -')];
    builtIn.forEach((name) => expect(SHAREABLE_PRESETS).toContain(name));
});

test('links carry generated sounds as role + seed', () => {
    const presets = { lead: { generated: { role: 'lead', seed: 0xabcdef } }, pad: { generated: { role: 'bass', seed: 1 } }, bass: 'Deep Pulse' };
    const code = encodeSettings({ ...defaultSettings(), seed: 9 }, presets);
    expect(code.length).toBeLessThan(30);
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

test('a phrase= parameter sets the seed, on a link or on the defaults', async () => {
    const { phraseToSeed } = await import('./phrase');
    const alone = shareFromLocation({ search: '?phrase=rainy+sunday' });
    expect(alone.settings.seed).toBe(phraseToSeed('rainy sunday'));
    expect(alone.phrase).toBe('rainy sunday');
    const code = encodeSettings({ ...defaultSettings(), tonic: 4, seed: 3 });
    const both = shareFromLocation({ search: `?${code}&phrase=amber-tide-lantern-moss` });
    expect(both.settings.tonic).toBe(4);
    expect(both.settings.seed).toBe(phraseToSeed('amber-tide-lantern-moss'));
});
