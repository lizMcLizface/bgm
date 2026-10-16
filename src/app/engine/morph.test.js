import { blendPresets } from './morph';

const from = { masterVolume: 0.4, filterFreq: 400, filterType: 'lowpass', voiceCount: 2, vcoType: 'sawtooth', reverbAmount: 0 };
const to = { masterVolume: 0.8, filterFreq: 1600, filterType: 'bandpass', voiceCount: 6, vcoType: 'square', reverbAmount: 0.5 };

describe('blendPresets', () => {
    test('the ends are the two presets', () => {
        expect(blendPresets(from, to, 0)).toEqual({ ...from, filterFreq: 400 });
        expect(blendPresets(from, to, 1)).toEqual(to);
    });

    test('numbers glide, frequencies in ratio', () => {
        const half = blendPresets(from, to, 0.5);
        expect(half.masterVolume).toBeCloseTo(0.6);
        expect(half.reverbAmount).toBeCloseTo(0.25);
        expect(half.filterFreq).toBeCloseTo(800); // an octave up from 400 towards 1600, not 1000
    });

    test('choices and whole-step numbers switch halfway', () => {
        expect(blendPresets(from, to, 0.49)).toMatchObject({ filterType: 'lowpass', vcoType: 'sawtooth', voiceCount: 2 });
        expect(blendPresets(from, to, 0.5)).toMatchObject({ filterType: 'bandpass', vcoType: 'square', voiceCount: 6 });
    });
});
