// The instrument applies a piano's tuning to every note it plays, and only to pianos.
vi.mock('../../audio/context', () => ({ audioContext: { currentTime: 0 } }));

import Instrument from './Instrument';
import PRESET_DEFAULTS from './presetDefaults';
import { sanitizePreset } from '../editor/presetStore';

const standIn = (preset) => {
    const inst = { preset: { ...PRESET_DEFAULTS, ...preset } };
    inst.pianoTuning = () => Instrument.prototype.pianoTuning.call(inst);
    return (midi) => Instrument.prototype.noteInfo.call(inst, midi).freq;
};
const cents = (a, b) => 1200 * Math.log2(a / b);

test('an equal-tempered piano, and every other source, plays the plain pitches', () => {
    const equal = standIn({ stringModel: 'piano', pianoType: 'grand' }), other = standIn({ stringModel: 'oscillator', pianoTemperament: 'just', pianoWear: 1 });
    for (const midi of [36, 60, 69, 84]) {
        expect(equal(midi)).toBe(standIn({})(midi));
        expect(other(midi)).toBe(standIn({})(midi));
    }
});

test('temperament, key, reference pitch and stretch move the notes of a piano', () => {
    const plain = standIn({}), just = standIn({ stringModel: 'piano', pianoTemperament: 'just', pianoTonic: 'C' });
    expect(cents(just(64), plain(64))).toBeCloseTo(-13.686, 2); // the pure major third over C
    expect(cents(just(60), plain(60))).toBeCloseTo(0, 6);
    expect(cents(standIn({ stringModel: 'piano', pianoA4: 415 })(69), 440)).toBeCloseTo(1200 * Math.log2(415 / 440), 2);
    const stretched = standIn({ stringModel: 'piano', pianoStretch: 1 });
    expect(cents(stretched(96), plain(96))).toBeGreaterThan(9);
    expect(cents(stretched(30), plain(30))).toBeLessThan(-5);
    const inD = standIn({ stringModel: 'piano', pianoTemperament: 'just', pianoTonic: 'D' });
    expect(cents(inD(66), plain(66))).toBeCloseTo(-13.686, 2); // F# over D
});

test('the new piano settings survive a preset round trip and the library presets use them', async () => {
    const preset = { stringModel: 'piano', pianoType: 'upright', pianoTemperament: 'werckmeister', pianoTonic: 'Eb', pianoA4: 415.5, pianoStretch: .4, pianoWear: .6 };
    expect(sanitizePreset(preset)).toEqual(preset);
    const library = (await import('../../library/voices.json')).default;
    const pianos = Object.entries(library.Pianos);
    expect(pianos.length).toBeGreaterThanOrEqual(5);
    for (const [name, p] of pianos) expect(sanitizePreset(p), name).toEqual(p);
    expect(new Set(pianos.map(([, p]) => p.pianoType))).toEqual(new Set(['grand', 'felted', 'upright', 'ambient', 'glass', 'drama', 'soft', 'subdued', 'concert']));
});
