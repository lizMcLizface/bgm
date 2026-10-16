// Instrument.morphTo, on a stand-in for the instrument: only the parts the morph touches.

vi.mock('../../audio/context', () => ({ audioContext: { currentTime: 0 } }));

import Instrument from './Instrument';

const standIn = () => {
    const inst = {
        now: 0,
        preset: { masterVolume: 0.2 },
        morph: null,
        AC: null,
        sets: [],
        applyPreset(preset) { Object.entries(preset).forEach(([key, value]) => inst.set(key, value)); },
        set(key, value) {
            Instrument.prototype.set.call(inst, key, value);
        },
        morphTo: (preset, seconds) => Instrument.prototype.morphTo.call(inst, preset, seconds),
        finishMorph: () => Instrument.prototype.finishMorph.call(inst),
    };
    inst.AC = { get currentTime() { return inst.now; } };
    return inst;
};

describe('Instrument.morphTo', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('glides with the audio clock, then lands exactly on the target', () => {
        const inst = standIn();
        // the real set() would touch the audio graph: keep only the bookkeeping
        inst.set = (key, value) => {
            if (inst.morph && !inst.morph.stepping) inst.finishMorph();
            inst.preset = { ...inst.preset, [key]: value };
        };
        inst.morphTo({ masterVolume: 0.8 }, 4);
        inst.now = 2;
        vi.advanceTimersByTime(100);
        expect(inst.preset.masterVolume).toBeCloseTo(0.5);
        inst.now = 5;
        vi.advanceTimersByTime(100);
        expect(inst.preset.masterVolume).toBe(0.8);
        expect(inst.morph).toBeNull();
    });

    test('an edit during a morph ends it on the target first; a very short morph is a plain switch', () => {
        const inst = standIn();
        inst.set = (key, value) => {
            if (inst.morph && !inst.morph.stepping) inst.finishMorph();
            inst.preset = { ...inst.preset, [key]: value };
        };
        inst.morphTo({ masterVolume: 0.8 }, 4);
        inst.set('filterFreq', 500);
        expect(inst.preset).toMatchObject({ masterVolume: 0.8, filterFreq: 500 });
        expect(inst.morph).toBeNull();
        inst.morphTo({ masterVolume: 0.3 }, 0.1);
        expect(inst.preset.masterVolume).toBe(0.3);
        expect(inst.morph).toBeNull();
    });
});
