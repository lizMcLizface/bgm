import { slowVibrato, voiceMotion, canDrift } from './timbreDrift';

const synth = { filterFreq: 2000, voiceCount: 3, detuneSpread: 8, vibratoDepth: 0, osc2Type: 'off' };

test('nothing at amount 0, for other roles, for sounds with vibrato, and for sounds the drift may not touch', () => {
    expect(slowVibrato(synth, 'pad', 3, 0)).toBeNull();
    expect(slowVibrato(synth, 'lead', 3, 1)).toBeNull();
    expect(slowVibrato(synth, 'bass', 3, 1)).toBeNull();
    expect(slowVibrato({ ...synth, vibratoDepth: 5 }, 'pad', 3, 1)).toBeNull();
    expect(slowVibrato({ ...synth, fmIndex: 2 }, 'pad', 3, 1)).toBeNull();
    expect(slowVibrato({ ...synth, wasmVoice: true }, 'pad', 3, 1)).toBeNull();
    expect(canDrift(synth)).toBe(true);
});

test('depth stays shallow and the rate slow, scaled by the amount, and both glide smoothly between bars', () => {
    let last = null;
    for (let bar = 0; bar < 64; bar++) {
        const v = slowVibrato(synth, 'pad', bar, 1, 7);
        expect(v.vibratoDepth).toBeGreaterThan(0);
        expect(v.vibratoDepth).toBeLessThanOrEqual(6);
        expect(v.vibratoRate).toBeGreaterThanOrEqual(0.3);
        expect(v.vibratoRate).toBeLessThanOrEqual(0.8);
        if (last) { expect(Math.abs(v.vibratoDepth - last.vibratoDepth)).toBeLessThan(2.5); expect(Math.abs(v.vibratoRate - last.vibratoRate)).toBeLessThan(0.3); }
        last = v;
    }
    expect(slowVibrato(synth, 'pad', 5, 0.5, 7).vibratoDepth).toBeLessThanOrEqual(3);
    expect(slowVibrato(synth, 'counter', 5, 1, 7)).not.toBeNull();
});

test('voiceMotion combines the timbre drift and the slow vibrato, and is null when neither applies', () => {
    expect(voiceMotion(synth, 'pad', 4, { timbreDrift: 0, padVibrato: 0 }, 3)).toBeNull();
    const both = voiceMotion(synth, 'pad', 4, { timbreDrift: 0.5, padVibrato: 0.5 }, 3);
    expect(both).toHaveProperty('vibratoDepth');
    expect(both).toHaveProperty('filterFreq');
    expect(voiceMotion(synth, 'pad', 4, { timbreDrift: 0.5 }, 3)).not.toHaveProperty('vibratoDepth');
});
